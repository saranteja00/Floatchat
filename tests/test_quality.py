from copy import deepcopy
import pytest
from backend.main import snapshot
from backend.queries import QueryPlan, execute_query
from backend.quality import profile_audit, quality_summary


def plan(**kw):
    return QueryPlan(**(dict(snapshot_id=snapshot()['snapshot_id'],start_date='2025-01-01',end_date='2026-12-31',min_depth=0,max_depth=2100)|kw))


@pytest.mark.parametrize('qc',['strict','expanded'])
@pytest.mark.parametrize('variables',[['temperature'],['salinity'],['temperature','salinity']])
def test_audit_conserves_source_counts_and_agrees_with_result(qc,variables):
    result=execute_query(snapshot(),plan(qc=qc,variables=variables,min_depth=200,max_depth=1000))
    audit=result['quality']
    assert sum(audit['totals'].values())==audit['source_levels']
    assert audit['totals']['retained']==result['counts']['observations']
    for row in audit['profiles']:
        assert sum(row['counts'].values())==row['source_levels']
        actual=next((r for r in result['profiles'] if r['profile']['id']==row['profile_id']),None)
        assert row['counts']['retained']==(len(actual['observations']) if actual else 0)
        for v in variables:
            assert row['variables'][v]['valid']==(actual['counts'][v] if actual else 0)


def test_exclusion_order_and_independent_variable_masks():
    p=deepcopy(snapshot()['profiles'][0]);base=deepcopy(p['levels'][0]);base.update(depth_m=50,PRES_QC='1',TEMP=20,TEMP_QC='1',PSAL=35,PSAL_QC='1')
    p['position_qc']=p['time_qc']='1'
    p['levels']=[base|{'depth_m':None},base|{'depth_m':300},base|{'TEMP':None,'PSAL_QC':'4'},base|{'TEMP_QC':'4'},base]
    r=profile_audit(p,plan(max_depth=100))
    assert r['counts']==dict(metadata_qc=0,pressure_or_depth=1,outside_depth=1,no_requested_values=1,retained=2)
    assert r['variables']['temperature']==dict(valid=1,missing=1,qc_excluded=1)
    p['time_qc']='4'
    assert profile_audit(p,plan())['counts']['metadata_qc']==5


def test_empty_and_single_timestamp_coverage():
    assert quality_summary([],plan())['coverage']==[]
    p=deepcopy(snapshot()['profiles'][0])
    assert quality_summary([p],plan())['coverage'][0]['largest_gap_days'] is None
    q=deepcopy(p);q['timestamp']='2025-05-11T14:24:56Z';p['timestamp']='2025-05-01T14:24:56Z'
    assert quality_summary([q,p],plan())['coverage'][0]['largest_gap_days']==10
