from backend.anomalies import compare, cell_key, METHOD
from backend.reference_import import extract
import numpy as np
import pytest
import xarray as xr

def query():
    return {'query_id':'q','plan':{'variables':['temperature']},'profiles':[{
        'profile':{'id':'p','latitude':5.2,'longitude':80.2,'timestamp':'2025-05-10'},
        'observations':[{'source_level':0,'depth_m':95,'temperature':23}]}]}

def reference(values=None):
    return {'reference_id':'r','sources':{'hash':{'url':'source'}},'cells':{
        cell_key('temperature',5,5.2,80.2):{'source_id':'hash','latitude':5.5,'longitude':80.5,'depths':[0,100,200],'values':values or [28,20,15]}}}

def test_departure_sign_and_exact_evidence():
    r=compare(query(),reference(),5)
    row=r['rows'][0]
    assert row['departure']==3 and row['baseline']==20
    assert row['source_level']==0 and row['reference']['depth_offset_m']==-5
    assert row['reference']['depth_index']==1
    assert r['counts']['matched']==1 and r['reference_id']=='r'

def test_absent_month_never_substitutes_another_month():
    q=query();q['profiles'][0]['profile']['timestamp']='2025-06-01'
    r=compare(q,reference())
    assert r['rows'][0]['status']=='baseline_unavailable'
    assert r['rows'][0]['departure'] is None

def test_missing_baseline_and_land_mask_never_create_zero_anomaly():
    assert compare(query(),None)['rows'][0]['status']=='baseline_unavailable'
    r=compare(query(),reference([28,None,15]))
    assert r['rows'][0]['status']=='reference_masked' and r['rows'][0]['departure'] is None

def test_tolerance_boundary_and_no_vertical_extrapolation():
    assert compare(query(),reference(),4)['rows'][0]['status']=='depth_tolerance_exceeded'
    q=query();q['profiles'][0]['observations'][0]['depth_m']=201
    assert compare(q,reference(),50)['rows'][0]['status']=='outside_reference_depth'

def test_tie_prefers_shallow_and_missing_observation_not_counted():
    q=query();q['profiles'][0]['observations'][0]['depth_m']=50
    assert compare(q,reference(),50)['rows'][0]['baseline']==28
    q['profiles'][0]['observations'][0]['temperature']=None
    assert compare(q,reference())['rows']==[]

def test_cell_boundaries_and_dateline():
    assert cell_key('salinity',1,90,180)=='salinity:01:89.5:-179.5'
    assert cell_key('temperature',5,-.1,-.1)=='temperature:05:-0.5:-0.5'

def test_extract_verified_month_grid_and_mask(tmp_path):
    values=np.full((1,2,180,360),20.,dtype='float32')
    values[0,1,95,260]=np.nan
    ds=xr.Dataset({'t_an':(('time','depth','lat','lon'),values,{'standard_name':'sea_water_temperature','units':'degrees_celsius'})},
        coords={'time':[0],'depth':[0,100],'lat':np.arange(-89.5,90),'lon':np.arange(-179.5,180)},
        attrs={'title':'World Ocean Atlas 2023 : sea_water_temperature May 1991-2020 1.00 degree'})
    path=tmp_path/'fixture.nc';ds.to_netcdf(path)
    cells,source=extract(path,'temperature',5,[query()['profiles'][0]['profile']])
    assert list(cells.values())[0]['values']==[20,None]
    assert len(source['sha256'])==64 and source['variable']=='t_an'
    with pytest.raises(ValueError,match='month'):
        extract(path,'temperature',6,[])

def test_endpoint_missing_reference_and_stale_snapshot(monkeypatch):
    from fastapi.testclient import TestClient
    import backend.main as main
    import backend.anomalies as anomalies
    monkeypatch.setattr(anomalies,'load_reference',lambda:None)
    data=main.snapshot()
    plan={'snapshot_id':data['snapshot_id'],'start_date':'2025-01-01','end_date':'2026-12-31','variables':['temperature']}
    with TestClient(main.app) as client:
        response=client.post('/api/query/anomalies',json={'plan':plan})
        assert response.status_code==200
        body=response.json()
        assert body['reference_id'] is None and body['counts']['matched']==0
        assert body['counts']['baseline_unavailable']>0
        assert client.post('/api/query/anomalies',json={'plan':plan,'depth_tolerance_m':51}).status_code==422
        plan['snapshot_id']='stale'
        assert client.post('/api/query/anomalies',json={'plan':plan}).status_code==409

def test_import_failure_preserves_published_cache(tmp_path, monkeypatch):
    import backend.reference_import as importer
    import json
    root=tmp_path
    (root/'data/processed').mkdir(parents=True)
    (root/'data/processed/snapshot.json').write_text(json.dumps({'profiles':[]}))
    dest=root/'reference.json'
    original=json.dumps({'method':METHOD,'period':'1991-2020','cells':{},'sources':{}})
    dest.write_text(original)
    monkeypatch.setattr(importer,'ROOT',root)
    monkeypatch.setattr(importer,'REFERENCE_PATH',dest)
    monkeypatch.setattr('sys.argv',['reference_import','--months','5','--files-dir',str(root)])
    def fail(*args):raise ValueError('invalid baseline')
    monkeypatch.setattr(importer,'extract',fail)
    with pytest.raises(ValueError,match='invalid baseline'):importer.main()
    assert dest.read_text()==original

def test_ncar_import_records_archive_and_retains_noaa_identity(tmp_path,monkeypatch):
    import backend.reference_import as importer
    import json
    (tmp_path/'data/processed').mkdir(parents=True)
    (tmp_path/'data/processed/snapshot.json').write_text(json.dumps({'profiles':[]}))
    dest=tmp_path/'reference.json'
    monkeypatch.setattr(importer,'ROOT',tmp_path)
    monkeypatch.setattr(importer,'REFERENCE_PATH',dest)
    monkeypatch.setattr('sys.argv',['reference_import','--archive','ncar','--months','5'])
    downloads=[]
    monkeypatch.setattr(importer,'download',lambda url,path: downloads.append(url))
    monkeypatch.setattr(importer,'extract',lambda path,v,m,p: ({},{'sha256':v,'url':importer.source_url(v,m)}))
    importer.main()
    data=json.loads(dest.read_text())
    assert all(u.startswith('https://data.gdex.ucar.edu/d285000/woa23_netcdf/') for u in downloads)
    for source in data['sources'].values():
        assert source['archive']=='ncar'
        assert source['url'].startswith('https://www.ncei.noaa.gov/')
        assert source['download_url'].startswith('https://data.gdex.ucar.edu/')
