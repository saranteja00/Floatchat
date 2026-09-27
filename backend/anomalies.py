"""Monthly WOA23 departures. Pure JSON computation: no NetCDF work in the API."""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path
from pydantic import BaseModel, ConfigDict, Field
from backend.queries import QueryPlan

REFERENCE_PATH = Path(__file__).resolve().parents[1] / 'data/reference/woa23.json'
METHOD = 'woa23-monthly-nearest-v1'
NOTE = ('Observed minus WOA23 1991–2020 monthly objectively analyzed mean. '
        'Nearest 1-degree cell and nearest standard depth within tolerance; no interpolation by FloatChat. '
        'WOA is already objectively analyzed. Depth and location mismatch affect departures. '
        'These are not significance tests, climate trends, forecasts or marine-heatwave detections.')

class AnomalyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    plan: QueryPlan
    depth_tolerance_m: float = Field(default=25, ge=0, le=50)

def cell_key(variable, month, latitude, longitude):
    # WOA 1-degree cell centres. Normalize the antimeridian consistently.
    lat = min(89.5, max(-89.5, math.floor(latitude) + .5))
    lon = math.floor((longitude + 180) % 360 - 180) + .5
    return f'{variable}:{month:02}:{lat:.1f}:{lon:.1f}'

_REF_CACHE: dict = {'data': None, 'mtime': 0}

def load_reference():
    if not REFERENCE_PATH.exists():
        return None
    mtime = REFERENCE_PATH.stat().st_mtime
    if _REF_CACHE['data'] is None or _REF_CACHE['mtime'] != mtime:
        data = json.loads(REFERENCE_PATH.read_text(encoding='utf-8'))
        if data.get('method') != METHOD or data.get('period') != '1991-2020':
            raise ValueError('Unsupported reference cache. Rebuild the WOA23 cache.')
        _REF_CACHE['data'] = data
        _REF_CACHE['mtime'] = mtime
    return _REF_CACHE['data']

def compare(result, reference, tolerance=25):
    cells = reference['cells'] if reference else {}
    rows = []
    for profile in result['profiles']:
        p = profile['profile']
        month = int(p['timestamp'][5:7])
        for variable in result['plan']['variables']:
            key = cell_key(variable, month, p['latitude'], p['longitude'])
            cell = cells.get(key)
            for sample in profile['observations']:
                value = sample[variable]
                if value is None or not math.isfinite(value):
                    continue
                row = dict(profile_id=p['id'], source_level=sample['source_level'],
                           variable=variable, observed=value, depth_m=sample['depth_m'],
                           month=month, baseline=None, departure=None, reference=None)
                if not cell:
                    row['status'] = 'baseline_unavailable'
                elif not cell['depths'] or not cell['depths'][0] <= sample['depth_m'] <= cell['depths'][-1]:
                    row['status'] = 'outside_reference_depth'
                else:
                    i = min(range(len(cell['depths'])), key=lambda i: (abs(cell['depths'][i]-sample['depth_m']), cell['depths'][i]))
                    z = cell['depths'][i]
                    row['reference'] = dict(source_id=cell['source_id'], latitude=cell['latitude'],
                        longitude=cell['longitude'], depth_m=z, depth_index=i,
                        depth_offset_m=sample['depth_m']-z,
                        latitude_offset_degrees=p['latitude']-cell['latitude'],
                        longitude_offset_degrees=(p['longitude']-cell['longitude']+180)%360-180)
                    if abs(z-sample['depth_m']) > tolerance:
                        row['status'] = 'depth_tolerance_exceeded'
                    elif cell['values'][i] is None:
                        row['status'] = 'reference_masked'
                    else:
                        row.update(status='matched', baseline=cell['values'][i], departure=value-cell['values'][i])
                rows.append(row)
    counts = {k:sum(r['status']==k for r in rows) for k in
              ['matched','baseline_unavailable','outside_reference_depth','depth_tolerance_exceeded','reference_masked']}
    identity = [METHOD, result['query_id'], reference.get('reference_id') if reference else None, tolerance]
    return dict(analysis_id=hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:16],
                method=METHOD, query=result, reference_id=reference.get('reference_id') if reference else None,
                period='1991-2020', depth_tolerance_m=tolerance, note=NOTE, counts=counts, rows=rows,
                sources=reference['sources'] if reference else {},
                setup='Run python -m backend.reference_import --months 5 6 7 8 9 to download NOAA reference files for the current snapshot.')
