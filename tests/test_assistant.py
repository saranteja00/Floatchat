import json
import httpx
import pytest
from backend import assistant
from backend.main import snapshot
from backend.queries import InterpretRequest, QueryPlan

@pytest.fixture
def request_plan():
 return InterpretRequest(question='Only salinity please', context=QueryPlan(snapshot_id=snapshot()['snapshot_id'],start_date='2025-05-01',end_date='2025-05-31',min_depth=200,max_depth=1000))

@pytest.fixture(autouse=True)
def clean_provider(monkeypatch):
 for key in ['GEMINI_API_KEY','GEMINI_MODEL','GROQ_API_KEY','GROQ_MODEL','FLOATCHAT_AI_PROVIDER','OPENAI_API_KEY','FLOATCHAT_AI_MODEL']:
  monkeypatch.delenv(key,raising=False)

@pytest.fixture
def configured(monkeypatch):
 monkeypatch.setenv('OPENAI_API_KEY','test-only-not-a-key');monkeypatch.setenv('FLOATCHAT_AI_MODEL','test-model')

def test_no_key_local(monkeypatch,request_plan):
 monkeypatch.delenv('OPENAI_API_KEY',raising=False)
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['engine']=='local';assert r['fallback_reason']

def test_followup_plan_validated_and_changes_computed(configured,monkeypatch,request_plan):
 plan=request_plan.context.model_copy(update={'variables':['salinity']})
 monkeypatch.setattr(assistant,'provider_decision',lambda *a:(assistant.Decision(status='ready',message='Salinity selected.',plan=plan),'response-test'))
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['engine']=='openai';assert r['changed_fields']==['variables'];assert r['plan']['min_depth']==200;assert r['provider_response_id']=='response-test'

@pytest.mark.parametrize('patch',[{'snapshot_id':'invented'},{'float_ids':['9999999']}])
def test_hallucinated_identity_rejected(configured,monkeypatch,request_plan,patch):
 monkeypatch.setattr(assistant,'provider_decision',lambda *a:(assistant.Decision(status='ready',message='ok',plan=request_plan.context.model_copy(update=patch)),'x'))
 assert assistant.interpret_assisted(request_plan,snapshot())['plan'] is None

def test_provider_failure_falls_back_without_leaking_secrets(configured,monkeypatch,request_plan):
 def fail(*a):raise httpx.ConnectError('test-only-not-a-key')
 monkeypatch.setattr(assistant,'provider_decision',fail)
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['engine']=='local';assert 'test-only-not-a-key' not in json.dumps(r)

def test_invalid_output_does_not_silently_fallback(configured,monkeypatch,request_plan):
 def fail(*a):raise ValueError('bad json')
 monkeypatch.setattr(assistant,'provider_decision',fail)
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['status']=='clarification_required';assert r['plan'] is None;assert r['engine']=='openai'

def test_clarification_cannot_execute_plan(configured,monkeypatch,request_plan):
 monkeypatch.setattr(assistant,'provider_decision',lambda *a:(assistant.Decision(status='clarification_required',message='Which date?',plan=request_plan.context),'x'))
 assert assistant.interpret_assisted(request_plan,snapshot())['plan'] is None

def test_transport_payload_and_parse(configured,monkeypatch,request_plan):
 captured={}
 def respond(req):
  captured.update(json.loads(req.content));return httpx.Response(200,json={'status':'completed','id':'resp-test','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'status':'ready','message':'Review selection.','plan':request_plan.context.model_dump(mode='json')})}]}]})
 original=httpx.Client
 monkeypatch.setattr(assistant.httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
 decision,rid=assistant.provider_decision(request_plan,snapshot())
 assert rid=='resp-test';assert decision.plan==request_plan.context
 assert captured['store'] is False;assert captured['text']['format']['strict'] is True
 assert 'test-only-not-a-key' not in captured['input']

def test_schema_requires_all_object_fields():
 def walk(n):
  if isinstance(n,dict):
   if n.get('type')=='object':assert set(n['required'])==set(n['properties']);assert n['additionalProperties'] is False
   assert 'default' not in n
   for v in n.values():walk(v)
  elif isinstance(n,list):
   for v in n:walk(v)
 walk(assistant.strict_schema())

def test_groq_transport(monkeypatch,request_plan):
 monkeypatch.setenv('GROQ_API_KEY','groq-test-secret')
 captured={}
 def respond(req):
  assert str(req.url)=='https://api.groq.com/openai/v1/chat/completions'
  assert req.headers['authorization']=='Bearer groq-test-secret'
  captured.update(json.loads(req.content))
  return httpx.Response(200,json={'id':'groq-response','choices':[{'finish_reason':'stop','message':{'content':json.dumps({'status':'ready','message':'Review selection','plan':request_plan.context.model_dump(mode='json')})}}]})
 original=httpx.Client
 monkeypatch.setattr(assistant.httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
 r=assistant.interpret_assisted(request_plan,snapshot())
 assert r['engine']=='groq';assert r['model']=='openai/gpt-oss-20b'
 assert captured['response_format']['json_schema']['strict'] is True
 assert 'groq-test-secret' not in json.dumps(captured)

@pytest.mark.parametrize('choices',[[],[{'finish_reason':'length','message':{'content':'{}'}}],[{'finish_reason':'stop','message':{'refusal':'no','content':'{}'}}]])
def test_groq_incomplete_refusal(monkeypatch,request_plan,choices):
 monkeypatch.setenv('GROQ_API_KEY','fake')
 original=httpx.Client
 monkeypatch.setattr(assistant.httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'choices':choices})),**kw))
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['engine']=='groq';assert r['plan'] is None

def test_explicit_provider_never_uses_other_key(monkeypatch):
 monkeypatch.setenv('FLOATCHAT_AI_PROVIDER','groq');monkeypatch.setenv('OPENAI_API_KEY','fake');monkeypatch.setenv('FLOATCHAT_AI_MODEL','fake')
 assert assistant.configuration()['configured'] is False

@pytest.mark.parametrize('status,body,expected',[
 (401,'secret-provider-body','Authentication failed'),
 (403,'secret-provider-body','Access denied'),
 (429,'secret-provider-body','quota'),
 (400,'schema invalid secret-provider-body','structured-output schema'),
 (404,'secret-provider-body','not found'),
 (503,'secret-provider-body','service error'),
])
def test_safe_provider_diagnostics(configured,monkeypatch,request_plan,status,body,expected):
 def fail(*a):
  response=httpx.Response(status,text=body,request=httpx.Request('POST','https://api.openai.com/v1/responses'))
  response.raise_for_status()
 monkeypatch.setattr(assistant,'provider_decision',fail)
 r=assistant.interpret_assisted(request_plan,snapshot())
 assert str(status) in r['fallback_reason'];assert expected in r['fallback_reason']
 assert 'secret-provider-body' not in json.dumps(r);assert r['engine']=='local'

def test_timeout_diagnostic(configured,monkeypatch,request_plan):
 def fail(*a):raise httpx.ReadTimeout('hidden')
 monkeypatch.setattr(assistant,'provider_decision',fail)
 assert 'timed out' in assistant.interpret_assisted(request_plan,snapshot())['fallback_reason']

@pytest.mark.parametrize('status',[400,429,503])
def test_json_provider_detail_redacts_credentials(configured,monkeypatch,request_plan,status):
 def fail(*a):
  response=httpx.Response(status,json={'error':{'message':'Unsupported option with test-only-not-a-key and gsk_exampleSecret and sk-exampleSecret and AQ.exampleNewKey'}},request=httpx.Request('POST','https://api.openai.com/v1/responses'))
  response.raise_for_status()
 monkeypatch.setattr(assistant,'provider_decision',fail)
 r=assistant.interpret_assisted(request_plan,snapshot())
 assert 'Unsupported option' in r['provider_error_detail']
 for secret in ['test-only-not-a-key','gsk_exampleSecret','sk-exampleSecret','AQ.exampleNewKey']:assert secret not in json.dumps(r)

def test_provider_detail_does_not_echo_non_json_body(configured,monkeypatch,request_plan):
 def fail(*a):
  httpx.Response(400,text='<html>private debug text</html>',request=httpx.Request('POST','https://api.openai.com/v1/responses')).raise_for_status()
 monkeypatch.setattr(assistant,'provider_decision',fail)
 detail = assistant.interpret_assisted(request_plan,snapshot())['provider_error_detail']
 assert '<html>' not in detail
 assert 'private debug text' not in detail

def test_gemini_transport(monkeypatch,request_plan):
 monkeypatch.setenv('GEMINI_API_KEY','AIzaTestSecret')
 captured={}
 def respond(req):
  assert req.url.host=='generativelanguage.googleapis.com';assert not req.url.query
  assert req.headers['x-goog-api-key']=='AIzaTestSecret'
  captured.update(json.loads(req.content))
  return httpx.Response(200,json={'responseId':'gemini-test','candidates':[{'finishReason':'STOP','content':{'parts':[{'thought':True,'text':'not output'},{'text':json.dumps({'status':'ready','message':'Review','plan':request_plan.context.model_dump(mode='json')})}]}}]})
 original=httpx.Client
 monkeypatch.setattr(assistant.httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
 r=assistant.interpret_assisted(request_plan,snapshot())
 assert r['engine']=='gemini';assert r['plan']['min_depth']==200
 assert captured['generationConfig']['responseMimeType']=='application/json'
 assert 'AIzaTestSecret' not in json.dumps(captured)

@pytest.mark.parametrize('body',[{'candidates':[]},{'promptFeedback':{'blockReason':'SAFETY'}},{'candidates':[{'finishReason':'MAX_TOKENS'}]}])
def test_gemini_blocked_or_incomplete(monkeypatch,request_plan,body):
 monkeypatch.setenv('GEMINI_API_KEY','fake')
 original=httpx.Client
 monkeypatch.setattr(assistant.httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(200,json=body)),**kw))
 r=assistant.interpret_assisted(request_plan,snapshot());assert r['plan'] is None;assert r['engine']=='gemini'

def test_gemini_does_not_use_groq_key(monkeypatch):
 monkeypatch.setenv('FLOATCHAT_AI_PROVIDER','gemini');monkeypatch.setenv('GROQ_API_KEY','fake')
 assert assistant.configuration()['configured'] is False


@pytest.mark.parametrize('key',['AQ.test\x16','AIzaTest\x00','AQ.test\u200b','AQ.test secret','AQ.test\r\n'])
def test_invalid_header_credentials_stay_local(monkeypatch,request_plan,key):
 # Mapping replacement allows testing NUL, which real OS environments reject.
 monkeypatch.setattr(assistant.os,'environ',{'FLOATCHAT_AI_PROVIDER':'gemini','GEMINI_API_KEY':key})
 def no_network(*args,**kwargs):
  pytest.fail('Invalid credentials must never reach the network')
 monkeypatch.setattr(httpx.Client,'post',no_network)
 result=assistant.interpret_assisted(request_plan,snapshot())
 assert result['engine']=='local'
 assert 'API key contains' in result['fallback_reason']
 assert key not in json.dumps(result,ensure_ascii=False)


@pytest.mark.parametrize('key',['AIzaLegacyKey','AQ.new-auth-key_123'])
def test_header_credentials_allow_both_google_formats(monkeypatch,key):
 monkeypatch.setenv('GEMINI_API_KEY',key)
 assert assistant.provider_key('GEMINI_API_KEY')==key
