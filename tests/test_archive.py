import json
from copy import deepcopy
import pytest
from fastapi import HTTPException
from backend import archive, refresh
from backend.main import snapshot

@pytest.fixture
def store(monkeypatch,tmp_path):
    monkeypatch.setattr(refresh,'ROOT',tmp_path)
    monkeypatch.setattr(refresh,'TARGET',tmp_path/'snapshot.json')
    current=deepcopy(snapshot());current['snapshot_id']='argo-aaaaaaaaaaaa'
    old=deepcopy(current);old['snapshot_id']='argo-bbbbbbbbbbbb';old['profiles']=old['profiles'][:2]
    refresh.write_json(refresh.TARGET,current)
    refresh.write_json(tmp_path/'data/processed/history'/f'{old["snapshot_id"]}.json',old)
    return current,old

def test_switch_preserves_current_and_roundtrips_exact_data(store):
    current,old=store
    assert len(archive.list_snapshots()['snapshots'])==2
    assert archive.activate(old['snapshot_id'],current['snapshot_id'])['changed']
    assert json.loads(refresh.TARGET.read_text())==old
    archive.activate(current['snapshot_id'],old['snapshot_id'])
    assert json.loads(refresh.TARGET.read_text())==current

def test_stale_switch_and_path_traversal_rejected(store):
    current,old=store
    before=refresh.TARGET.read_bytes()
    for target,expected in [('../snapshot',current['snapshot_id']),(old['snapshot_id'],'argo-cccccccccccc')]:
        with pytest.raises(HTTPException):archive.activate(target,expected)
    assert refresh.TARGET.read_bytes()==before

def test_import_lock_blocks_activation(store):
    current,old=store
    refresh.LOCK.acquire()
    try:
        with pytest.raises(HTTPException) as e:archive.activate(old['snapshot_id'],current['snapshot_id'])
        assert e.value.status_code==409
    finally:refresh.LOCK.release()

def test_incompatible_and_corrupt_archives_are_not_activated(store):
    current,old=store
    old['method_version']='future'
    path=refresh.ROOT/'data/processed/history'/f'{old["snapshot_id"]}.json'
    refresh.write_json(path,old)
    with pytest.raises(HTTPException):archive.activate(old['snapshot_id'],current['snapshot_id'])
    path.write_text('broken')
    assert archive.list_snapshots()['unreadable_archives']==1
    assert json.loads(refresh.TARGET.read_text())==current


def test_conflicting_backup_blocks_switch(store):
    current,old=store
    conflicting=deepcopy(current);conflicting['profiles']=conflicting['profiles'][:1]
    refresh.write_json(refresh.ROOT/'data/processed/history'/f'{current["snapshot_id"]}.json',conflicting)
    with pytest.raises(HTTPException):archive.activate(old['snapshot_id'],current['snapshot_id'])
    assert json.loads(refresh.TARGET.read_text())==current
