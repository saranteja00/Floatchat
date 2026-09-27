"""Reproducible, bounded ingestion of core Argo profile files.

Raw and adjusted values are never mixed: DATA_MODE controls the chosen variables.
Original level indices survive normalization. Quality filtering happens at query time.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request

import gsw
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
METHOD_VERSION = 'core-profile-v1'
SOURCES = [
    f'https://data-argo.ifremer.fr/dac/incois/{wmo}/profiles/D{wmo}_{cycle:03d}.nc'
    for wmo, cycles in [('1902674', [47, 48, 49]), ('1902675', [48, 49, 50]), ('1902676', [47, 48, 49])]
    for cycle in cycles
]


def text(value) -> str:
    array = np.asarray(value).ravel()
    return ''.join(v.decode('utf-8') if isinstance(v, bytes) else str(v) for v in array).strip()


def number(value):
    value = float(value)
    return value if np.isfinite(value) else None


def source_variable(mode: str, parameter: str) -> str:
    if mode not in ('R', 'A', 'D'):
        raise ValueError(f'Unsupported core data mode: {mode!r}')
    return parameter if mode == 'R' else f'{parameter}_ADJUSTED'


def normalize_file(path: Path, source: dict) -> list[dict]:
    profiles = []
    with xr.open_dataset(path, engine='netcdf4') as ds:
        for profile_index in range(ds.sizes['N_PROF']):
            row = ds.isel(N_PROF=profile_index)
            mode = text(row.DATA_MODE.values)
            wmo = text(row.PLATFORM_NUMBER.values)
            cycle = int(row.CYCLE_NUMBER.values)
            direction = text(row.DIRECTION.values)
            latitude, longitude = number(row.LATITUDE.values), number(row.LONGITUDE.values)
            if latitude is None or longitude is None or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                continue
            if np.isnat(row.JULD.values):
                continue
            timestamp = np.datetime_as_string(row.JULD.values, unit='s') + 'Z'
            variables = {p: source_variable(mode, p) for p in ('PRES', 'TEMP', 'PSAL')}
            levels = []
            for level_index in range(row.sizes['N_LEVELS']):
                level = {'source_level': level_index}
                for parameter, chosen in variables.items():
                    value = number(row[chosen].values[level_index]) if chosen in row else None
                    flag = text(row[chosen + '_QC'].values[level_index]) if chosen + '_QC' in row else '9'
                    level[parameter] = value
                    level[parameter + '_QC'] = flag or '9'
                pressure = level['PRES']
                level['depth_m'] = float(-gsw.z_from_p(pressure, latitude)) if pressure is not None and pressure >= 0 else None
                levels.append(level)
            profiles.append({
                'id': f'{wmo}-{cycle:03d}-{direction}-{profile_index}',
                'wmo': wmo, 'cycle': cycle, 'direction': direction,
                'source_profile_index': profile_index,
                'latitude': latitude, 'longitude': longitude, 'timestamp': timestamp,
                'position_qc': text(row.POSITION_QC.values),
                'time_qc': text(row.JULD_QC.values),
                'data_mode': mode, 'source_variables': variables,
                'source': source, 'levels': levels,
            })
    return profiles


def build_snapshot(offline: bool = False):
    raw_dir = ROOT / 'data/raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / 'data/manifests/demo.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'sources': []}
    previous = {s['filename']: s for s in old['sources']}
    sources, profiles = [], []
    for url in SOURCES:
        filename = url.rsplit('/', 1)[1]
        path = raw_dir / filename
        if not path.exists():
            if offline:
                raise FileNotFoundError(f'Missing cached source: {filename}. Run ingestion online once.')
            print(f'Downloading {filename}', flush=True)
            with urllib.request.urlopen(url, timeout=60) as response:
                payload = response.read(10_000_001)
            if len(payload) > 10_000_000:
                raise ValueError('Source exceeds the 10 MB per-file limit')
            partial = path.with_suffix('.part')
            partial.write_bytes(payload)
            partial.replace(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = previous.get(filename)
        if expected and expected['sha256'] != digest:
            raise ValueError(f'Source checksum changed: {filename}. Review before accepting a new snapshot.')
        source = {
            'url': url, 'filename': filename, 'sha256': digest,
            'acquired_at': expected['acquired_at'] if expected else datetime.now(timezone.utc).isoformat(),
        }
        sources.append(source)
        profiles.extend(normalize_file(path, source))
    identity = METHOD_VERSION + ''.join(s['sha256'] for s in sources)
    snapshot_id = 'argo-' + hashlib.sha256(identity.encode()).hexdigest()[:12]
    snapshot = {
        'snapshot_id': snapshot_id,
        'method_version': METHOD_VERSION,
        'created_at': max(s['acquired_at'] for s in sources),
        'title': 'Indian Ocean · INCOIS',
        'attribution': 'Argo (2000). Argo float data and metadata from Global Data Assembly Centres (Argo GDAC).',
        'doi': 'https://doi.org/10.17882/42182',
        'profiles': sorted(profiles, key=lambda p: (p['timestamp'], p['id'])),
    }
    destination = ROOT / 'data/processed/snapshot.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {k: v for k, v in snapshot.items() if k != 'profiles'} | {'sources': sources}
    # Readers see the old complete snapshot until this replacement succeeds.
    partial = destination.with_suffix('.tmp')
    partial.write_text(json.dumps(snapshot, allow_nan=False), encoding='utf-8')
    partial.replace(destination)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Published {snapshot_id}: {len(profiles)} profiles, {len(sources)} source files', flush=True)
    for profile in profiles:
        print(profile['id'], profile['timestamp'], profile['latitude'], profile['longitude'], len(profile['levels']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true', help='Rebuild only from verified local NetCDF files')
    build_snapshot(parser.parse_args().offline)
