from scripts.evaluate_interpreter import cases, score
from backend.queries import interpret


def test_offline_development_cases():
    for case in cases('test', '1902674'):
        assert score(case, interpret(case['request'])) == 'pass', case['id']


def test_fallback_never_counts_as_ai_success():
    case = cases('test', '1902674')[0]
    response = {'status': 'ready', 'plan': case['expected_plan'], 'engine': 'local'}
    assert score(case, response) == 'pass'
    assert score(case, response, live=True) == 'provider_unavailable'


def test_validation_rejection_is_not_successful_clarification():
    case = cases('test', '1902674')[5]
    response = {'status': 'clarification_required', 'plan': None, 'engine': 'gemini',
                'provider_response_id': 'x', 'interpretation_error': 'invalid_provider_plan'}
    assert score(case, response, live=True) == 'invalid_provider_output'
    response.pop('interpretation_error')
    assert score(case, response, live=True) == 'pass'
    response.pop('provider_response_id')
    assert score(case, response, live=True) == 'unverified_provider_output'


def test_unmentioned_field_reset_fails():
    case = cases('test', '1902674')[-1]
    response = {'status': 'ready', 'plan': case['expected_plan'] | {'qc': 'strict'}}
    assert score(case, response) == 'semantic_failure'


def test_partial_or_extra_plans_fail():
    case = cases('test', '1902674')[0]
    assert score(case, {'status': 'ready'}) == 'semantic_failure'
    assert score(case, {'status': 'ready', 'plan': case['expected_plan'] | {'sql': 'select'}}) == 'semantic_failure'
