from copy import deepcopy
from fastapi.testclient import TestClient
from backend.main import app, snapshot
from backend.report import render_report

client = TestClient(app)
def plan():
    return dict(snapshot_id=snapshot()['snapshot_id'],float_ids=[],start_date='2025-05-01',end_date='2025-05-31',min_depth=200,max_depth=1000,variables=['temperature','salinity'],qc='strict',bounds=None)

def test_report_matches_executed_query_and_sources():
    p=plan(); result=client.post('/api/query',json=p).json()
    report=client.post('/api/query/report',json=p)
    assert report.status_code==200
    assert 'attachment;' in report.headers['content-disposition']
    assert result['query_id'] in report.text
    assert result['summary'] in report.text
    for r in result['profiles']:
        assert r['source']['sha256'] in report.text
        assert r['source']['filename'] in report.text
    for r in result['ranges'].values():
        assert f"{r['min']:.3f}–{r['max']:.3f}" in report.text

def test_report_empty_selection_and_stale_snapshot():
    p=plan();p.update(start_date='2020-01-01',end_date='2020-01-02')
    assert 'No usable profiles' in client.post('/api/query/report',json=p).text
    p['snapshot_id']='old'
    assert client.post('/api/query/report',json=p).status_code==409

def test_report_escapes_metadata_and_disallows_unsafe_links():
    r=deepcopy(client.post('/api/query',json=plan()).json())
    r['profiles'][0]['source'].update(filename='<script>alert(1)</script>',url='javascript:alert(1)')
    r['warnings']=['<img src=x onerror=alert(1)>']
    html=render_report(r)
    assert '<script>' not in html and '<img' not in html and 'href="javascript:' not in html
    assert '&lt;script&gt;' in html
    assert "default-src 'none'" in html

def test_report_only_requested_variable_is_summarized():
    p=plan();p['variables']=['salinity']
    html=client.post('/api/query/report',json=p).text
    assert '<th scope="col">Temperature' not in html
    assert '<strong>Temperature</strong>' not in html
    assert '<strong>Salinity</strong>' in html
