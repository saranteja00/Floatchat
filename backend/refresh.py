"""Bounded, transactional GDAC refresh for the three tracked floats."""
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import tempfile
import threading
import subprocess
import sys
import os
import httpx
from backend.ingestion import ROOT, METHOD_VERSION, normalize_file

FLOATS = ('1902674', '1902675', '1902676')
BASE = 'https://data-argo.ifremer.fr/dac/incois'
LOCK = threading.Lock()
STATE = ROOT / 'data/processed/refresh-status.json'
TARGET = ROOT / 'data/processed/snapshot.json'

def now():
    return datetime.now(timezone.utc).isoformat()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, allow_nan=False, indent=2), encoding='utf-8')
    temp.replace(path)

def discover(html, wmo, cycles_per_float=3):
    if cycles_per_float not in (3, 12, 24):
        raise ValueError('Choose 3, 12 or 24 cycles per float')
    class Links(HTMLParser):
        def __init__(self):
            super().__init__(); self.names = set()
        def handle_starttag(self, tag, attrs):
            if tag == 'a':
                for key, value in attrs:
                    if key == 'href' and value and re.fullmatch(rf'[RD]{wmo}_\d{{3,4}}\.nc', value):
                        self.names.add(value)
    parser = Links(); parser.feed(html)
    cycles = {}
    for name in sorted(parser.names):
        cycle = int(name.split('_')[1].split('.')[0])
        if cycle not in cycles or name.startswith('D'):
            cycles[cycle] = name
    if not cycles:
        raise ValueError('No supported ascent profiles in GDAC listing')
    return [cycles[c] for c in sorted(cycles)[-cycles_per_float:]]

def fetch(url, limit):
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        with client.stream('GET', url) as response:
            response.raise_for_status()
            chunks = []; size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > limit:
                    raise ValueError('GDAC response exceeds download limit')
                chunks.append(chunk)
    return b''.join(chunks)

def status():
    value = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {'state':'never', 'message':'No GDAC update check yet.'}
    if value.get('state') == 'running' and not LOCK.locked():
        return value | {'state':'interrupted', 'message':'Previous refresh was interrupted. Cached snapshot remains available; check again.'}
    return value

def refresh(cycles_per_float=3):
    if cycles_per_float not in (3, 12, 24):
        raise ValueError('Choose 3, 12 or 24 cycles per float')
    if not LOCK.acquire(blocking=False):
        return {'state':'running', 'message':'A refresh is already running.'}
    started = now()
    try:
        progress = {'state':'running','started_at':started,'cycles_per_float':cycles_per_float,'files_checked':0,'file_limit':len(FLOATS)*cycles_per_float,'message':f'Checking latest {cycles_per_float} ascent cycles for each tracked float.'}
        write_json(STATE, progress)
        old = json.loads(TARGET.read_text(encoding='utf-8'))
        merged = {p['id']:p for p in old['profiles']}
        old_hashes = {p['id']:p['source']['sha256'] for p in old['profiles']}
        existing_sources = {p['source']['sha256']:p['source'] for p in old['profiles']}
        checked = []; received = []
        with tempfile.TemporaryDirectory(prefix='floatchat-refresh-') as directory:
            for wmo in FLOATS:
                prefix = f'{BASE}/{wmo}/profiles/'
                names = discover(fetch(prefix, 2_000_000).decode('utf-8'), wmo, cycles_per_float)
                for name in names:
                    payload = fetch(prefix + name, 10_000_000)
                    digest = hashlib.sha256(payload).hexdigest()
                    source = {'url':prefix+name,'filename':name,'sha256':digest,'acquired_at':existing_sources.get(digest,{}).get('acquired_at',now())}
                    path = Path(directory)/name; path.write_bytes(payload)
                    profiles = normalize_file(path, source)
                    if not profiles or any(p['wmo'] != wmo or p['direction'] != 'A' or p['cycle'] != int(name.split('_')[1].split('.')[0]) for p in profiles):
                        raise ValueError('Downloaded profile identity does not match the tracked float/ascent')
                    for profile in profiles:
                        merged[profile['id']] = profile
                    checked.append(source); received.append((digest, path))
                    write_json(STATE, progress | {'files_checked':len(checked),'message':f'Validated {len(checked)} files; checking up to {len(FLOATS)*cycles_per_float}.'})
            profiles = sorted(merged.values(), key=lambda p:(p['timestamp'],p['id']))
            if len(profiles) > 100:
                raise ValueError('Snapshot limit reached (100 profiles); archive old coverage before refreshing')
            identity = METHOD_VERSION + json.dumps(sorted((p['id'],p['source']['sha256']) for p in profiles))
            changed = any(old_hashes.get(p['id']) != p['source']['sha256'] for p in profiles)
            new = old | {'profiles':profiles,'method_version':METHOD_VERSION}
            if changed:
                new.update(snapshot_id='argo-'+hashlib.sha256(identity.encode()).hexdigest()[:12],created_at=now())
            # Immutable cached files and old snapshot remain available for reproducibility.
            archive = ROOT/'data/raw/refresh'; archive.mkdir(parents=True,exist_ok=True)
            for digest,path in received:
                cached = archive/f'{digest}.nc'
                if not cached.exists(): cached.write_bytes(path.read_bytes())
            if changed:
                backup = ROOT/'data/processed/history'/f'{old["snapshot_id"]}.json'
                if not backup.exists(): write_json(backup,old)
                write_json(TARGET,new)
        outcome = {'state':'ready','started_at':started,'checked_at':now(),'snapshot_id':new['snapshot_id'],'changed':changed,'profile_count':len(profiles),'files_checked':len(checked),'cycles_per_float':cycles_per_float,'latest_observation':max(p['timestamp'] for p in profiles),'scope':list(FLOATS),'message':'Snapshot updated. Reload the workspace to use it.' if changed else 'No changes in the latest tracked cycles. Cached snapshot is current for this check.'}
        write_json(STATE,outcome)
        return outcome
    except Exception as error:
        # Provider responses and local paths are not exposed through status.
        outcome = {'state':'error','started_at':started,'checked_at':now(),'message':'Refresh failed. The last published snapshot remains available. Retry when the GDAC is reachable.','error_type':type(error).__name__}
        write_json(STATE,outcome)
        return outcome
    finally:
        LOCK.release()

def refresh_isolated(cycles_per_float=3):
    """Keep native NetCDF processing out of the API process."""
    if cycles_per_float not in (3, 12, 24):
        raise ValueError('Choose 3, 12 or 24 cycles per float')
    if not LOCK.acquire(blocking=False):
        return {'state':'running', 'message':'A refresh is already running.'}
    started = now()
    try:
        write_json(STATE, {'state':'running','started_at':started,'cycles_per_float':cycles_per_float,'files_checked':0,'message':'Starting isolated GDAC import worker.'})
        environment = {k:v for k,v in os.environ.items() if k not in ('GEMINI_API_KEY','GROQ_API_KEY','OPENAI_API_KEY')}
        log_path = ROOT / 'artifacts/import-worker.log'
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open('w', encoding='utf-8') as log:
            subprocess.run([sys.executable, '-m', 'backend.refresh', '--cycles', str(cycles_per_float)], cwd=ROOT, env=environment, stdout=subprocess.DEVNULL, stderr=log, timeout=1800, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        result = json.loads(STATE.read_text(encoding='utf-8'))
        if result.get('state') not in ('ready','error'):
            raise RuntimeError('Worker exited without a final result')
        return result
    except (subprocess.SubprocessError, OSError, ValueError, RuntimeError) as error:
        result = {'state':'error','started_at':started,'checked_at':now(),'cycles_per_float':cycles_per_float,'message':'The import worker stopped before confirming completion. Reload to inspect the last published snapshot, then retry.','error_type':type(error).__name__}
        write_json(STATE,result)
        return result
    finally:
        LOCK.release()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--cycles', type=int, choices=(3,12,24), default=3)
    print(json.dumps(refresh(parser.parse_args().cycles),indent=2))
