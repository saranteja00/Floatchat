import json
from pathlib import Path
from backend import refresh as module
from backend.main import snapshot
from fastapi.testclient import TestClient
from backend.main import app


def test_discovery_prefers_delayed_and_rejects_paths():
    html=''.join(f'<a href="{name}">file</a>' for name in ['R1902676_049.nc','D1902676_049.nc','R1902676_050.nc','R1902676_051.nc','D1902676_001.nc','../R1902676_999.nc','R1902676_052D.nc','R9999999_999.nc'])
    assert module.discover(html,'1902676')==['D1902676_049.nc','R1902676_050.nc','R1902676_051.nc']


def test_failed_refresh_preserves_snapshot(monkeypatch,tmp_path):
    target=tmp_path/'snapshot.json';target.write_text(json.dumps(snapshot()))
    before=target.read_bytes()
    monkeypatch.setattr(module,'TARGET',target);monkeypatch.setattr(module,'STATE',tmp_path/'status.json')
    monkeypatch.setattr(module,'fetch',lambda *a: (_ for _ in ()).throw(ConnectionError()))
    assert module.refresh()['state']=='error'
    assert target.read_bytes()==before
    assert not module.LOCK.locked()


def test_success_publishes_and_archives(monkeypatch,tmp_path):
    old=snapshot();target=tmp_path/'snapshot.json';target.write_text(json.dumps(old))
    monkeypatch.setattr(module,'TARGET',target);monkeypatch.setattr(module,'STATE',tmp_path/'status.json');monkeypatch.setattr(module,'ROOT',tmp_path)
    monkeypatch.setattr(module,'FLOATS',('1902676',))
    monkeypatch.setattr(module,'fetch',lambda url,limit:b'<a href="R1902676_999.nc">x</a>' if url.endswith('/') else b'netcdf-test')
    profile=dict(old['profiles'][0]);profile.update(id='new-profile',cycle=999,wmo='1902676',direction='A',timestamp='2026-09-01T00:00:00Z')
    monkeypatch.setattr(module,'normalize_file',lambda path,source:[profile|{'source':source}])
    result=module.refresh();new=json.loads(target.read_text())
    assert result['state']=='ready' and result['changed']
    assert len(new['profiles'])==len(old['profiles'])+1
    assert (tmp_path/'data/processed/history'/f'{old["snapshot_id"]}.json').exists()
    assert module.refresh()['changed'] is False
    assert json.loads(target.read_text())['snapshot_id']==new['snapshot_id']


def test_refresh_requires_custom_header():
    assert TestClient(app).post('/api/data/refresh').status_code==403


def test_history_discovery_is_bounded_and_ordered():
    html=''.join(f'<a href="R1902676_{i:03d}.nc">file</a>' for i in range(1,51))
    for count in (3,12,24):
        selected=module.discover(html,'1902676',count)
        assert len(selected)==count
        assert selected[0]==f'R1902676_{51-count:03d}.nc'
        assert selected[-1]=='R1902676_050.nc'


def test_history_rejects_unbounded_requests(monkeypatch):
    import pytest
    for count in (0,1,25,1000):
        with pytest.raises(ValueError): module.refresh(count)
        assert TestClient(app).post(f'/api/data/refresh?cycles={count}',headers={'X-FloatChat-Refresh':'1'}).status_code==422


def test_worker_failure_is_reported_without_changing_snapshot(monkeypatch,tmp_path):
    import subprocess
    target=tmp_path/'snapshot.json';target.write_text('preserve')
    monkeypatch.setattr(module,'TARGET',target);monkeypatch.setattr(module,'STATE',tmp_path/'status.json')
    monkeypatch.setattr(module.subprocess,'run',lambda *a,**kw: (_ for _ in ()).throw(subprocess.CalledProcessError(1,a[0])))
    assert module.refresh_isolated(12)['state']=='error'
    assert target.read_text()=='preserve'
    assert not module.LOCK.locked()


def test_worker_receives_bounded_arguments_without_ai_keys(monkeypatch,tmp_path):
    monkeypatch.setattr(module,'STATE',tmp_path/'status.json')
    monkeypatch.setenv('GEMINI_API_KEY','test-secret')
    def run(args,**kwargs):
        assert args[-2:]==['--cycles','12']
        assert 'GEMINI_API_KEY' not in kwargs['env']
        module.write_json(module.STATE,{'state':'ready','changed':False})
    monkeypatch.setattr(module.subprocess,'run',run)
    assert module.refresh_isolated(12)=={'state':'ready','changed':False}
