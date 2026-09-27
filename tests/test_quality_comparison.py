from copy import deepcopy
from backend.main import snapshot
from backend.queries import QueryPlan
from backend.quality import compare_quality


def plan(data,**kw):
    return QueryPlan(**(dict(snapshot_id=data['snapshot_id'],start_date='2025-01-01',end_date='2026-12-31')|kw))

def test_additional_variable_at_existing_level_is_not_new_level():
    data=deepcopy(snapshot());p=data['profiles'][0];data['profiles']=[p];p['position_qc']=p['time_qc']='1'
    level=p['levels'][0];p['levels']=[level];level.update(PRES_QC='1',depth_m=10,TEMP=20,TEMP_QC='2',PSAL=35,PSAL_QC='1')
    r=compare_quality(data,plan(data))
    assert r['added_levels']==0
    assert len(r['added_values'])==1
    assert r['added_values'][0]['variable']=='temperature'
    assert r['added_values'][0]['flags']['variable']=='2'
    assert r['strict']['profiles'][0]['observations'][0]['temperature'] is None
    assert r['expanded']['profiles'][0]['observations'][0]['temperature']==20

def test_metadata_qc_two_can_add_entire_profile():
    data=deepcopy(snapshot());p=data['profiles'][0];data['profiles']=[p];p['position_qc']='2';p['time_qc']='1'
    r=compare_quality(data,plan(data))
    assert r['strict']['counts']['observations']==0
    assert r['added_levels']==r['expanded']['counts']['observations']>0
    assert all(a['flags']['position']=='2' for a in r['added_values'])

def test_real_comparison_preserves_filters_and_source_values():
    data=snapshot();p=plan(data,min_depth=200,max_depth=1000,variables=['salinity'])
    original=p.model_dump()
    r=compare_quality(data,p)
    assert p.model_dump()==original
    assert r['strict']['plan']|{'qc':'expanded'}==r['expanded']['plan']
    for a in r['added_values']:
        profile=next(x for x in r['expanded']['profiles'] if x['profile']['id']==a['profile_id'])
        o=next(x for x in profile['observations'] if x['source_level']==a['source_level'])
        assert a['value']==o['salinity']
        assert a['variable']=='salinity'
        assert '2' in a['flags'].values()

def test_empty_comparison():
    data=snapshot();r=compare_quality(data,plan(data,start_date='1900-01-01',end_date='1900-01-02'))
    assert r['added_values']==[] and r['added_levels']==0
