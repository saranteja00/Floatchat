"""Reopen locally archived snapshots without modifying their observations."""
import json
import re
from fastapi import HTTPException
from backend import refresh
from backend.ingestion import METHOD_VERSION


def read(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if not re.fullmatch(r'argo-[0-9a-f]{12}', data['snapshot_id']) or not isinstance(data['profiles'], list) or not data['profiles']:
        raise ValueError('Invalid snapshot')
    return data


def summary(data, current):
    return {'snapshot_id':data['snapshot_id'],'current':data['snapshot_id']==current,'created_at':data['created_at'],'profile_count':len(data['profiles']),'float_count':len({p['wmo'] for p in data['profiles']}),'first_observation':min(p['timestamp'] for p in data['profiles']),'last_observation':max(p['timestamp'] for p in data['profiles']),'compatible':data['method_version']==METHOD_VERSION}


def list_snapshots():
    current = read(refresh.TARGET)
    items = {current['snapshot_id']:summary(current,current['snapshot_id'])}
    skipped = 0
    for path in sorted((refresh.ROOT/'data/processed/history').glob('argo-*.json')):
        try:
            data = read(path)
            if path.stem != data['snapshot_id']:
                raise ValueError('Mismatched identity')
            items.setdefault(data['snapshot_id'],summary(data,current['snapshot_id']))
        except (ValueError, KeyError, TypeError, OSError):
            skipped += 1
    return {'current_snapshot_id':current['snapshot_id'],'snapshots':sorted(items.values(),key=lambda r:r['created_at'],reverse=True),'unreadable_archives':skipped}


def activate(snapshot_id, expected_current):
    if not re.fullmatch(r'argo-[0-9a-f]{12}', snapshot_id):
        raise HTTPException(422,detail={'message':'Invalid snapshot identity.'})
    if not refresh.LOCK.acquire(blocking=False):
        raise HTTPException(409,detail={'message':'A data import or snapshot switch is running. Try again when it finishes.'})
    try:
        current = read(refresh.TARGET)
        if current['snapshot_id'] != expected_current:
            raise HTTPException(409,detail={'message':'The active snapshot changed. Refresh the archive list before switching.'})
        if snapshot_id == current['snapshot_id']:
            return {'snapshot_id':snapshot_id,'changed':False}
        directory = refresh.ROOT/'data/processed/history'
        path = directory/f'{snapshot_id}.json'
        if not path.exists():
            raise HTTPException(404,detail={'message':'Archived snapshot not found.'})
        selected = read(path)
        if selected['snapshot_id'] != snapshot_id or selected['method_version'] != METHOD_VERSION:
            raise HTTPException(409,detail={'message':'This archive is incompatible with the current processing method.'})
        # Preserve the current snapshot before replacing the active dataset.
        backup = directory/f'{current["snapshot_id"]}.json'
        if backup.exists() and read(backup) != current:
            raise HTTPException(409,detail={'message':'The existing archive conflicts with the active snapshot. Switch cancelled to preserve both records.'})
        if not backup.exists():
            refresh.write_json(backup,current)
        refresh.write_json(refresh.TARGET,selected)
        return {'snapshot_id':snapshot_id,'changed':True}
    except (ValueError, KeyError, TypeError, OSError):
        raise HTTPException(409,detail={'message':'The archive could not be opened. No automatic fallback was selected.'})
    finally:
        refresh.LOCK.release()
