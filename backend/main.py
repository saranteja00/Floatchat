"""Read-only profile API for the first FloatChat vertical slice."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
from typing import Annotated, Literal
import zipfile

from fastapi import FastAPI, HTTPException, Query, Request
from backend import satellite
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from backend.queries import QueryPlan, InterpretRequest, execute_query, interpret, GenerateAnswerRequest
from backend.anomalies import AnomalyRequest
from backend.sofar import sofar_depth
from backend.assistant import ChatRequest, chat_completion

SNAPSHOT_PATH = Path(__file__).resolve().parents[1] / 'data/processed/snapshot.json'
app = FastAPI(title='FloatChat', version='0.1.0', description='Source-linked Argo profile exploration')
QCPolicy = Literal['strict', 'expanded']


class Selection(BaseModel):
    min_depth: float = Field(default=0, ge=0, le=6000)
    max_depth: float = Field(default=2100, ge=0, le=6000)
    qc: QCPolicy = 'strict'

    @model_validator(mode='after')
    def check_depth(self):
        if self.min_depth > self.max_depth:
            raise ValueError('Minimum depth must not exceed maximum depth')
        return self


_SNAPSHOT_CACHE: dict = {'data': None, 'mtime': 0}


def snapshot():
    if not SNAPSHOT_PATH.exists():
        raise HTTPException(503, detail={'code': 'SNAPSHOT_UNAVAILABLE', 'message': 'Run python -m backend.ingestion to prepare the real Argo snapshot.'})
    mtime = SNAPSHOT_PATH.stat().st_mtime
    if _SNAPSHOT_CACHE['data'] is None or _SNAPSHOT_CACHE['mtime'] != mtime:
        _SNAPSHOT_CACHE['data'] = json.loads(SNAPSHOT_PATH.read_text(encoding='utf-8'))
        _SNAPSHOT_CACHE['mtime'] = mtime
    return _SNAPSHOT_CACHE['data']


def summarize(profile):
    depths = [p['depth_m'] for p in profile['levels'] if p['depth_m'] is not None and p['PRES_QC'] == '1']
    return {k: profile[k] for k in ['id', 'wmo', 'cycle', 'latitude', 'longitude', 'timestamp', 'data_mode', 'position_qc', 'time_qc']} | {
        'max_depth_m': max(depths, default=0),
        'level_count': len(profile['levels']),
        'temperature_count': sum(p['TEMP'] is not None and p['TEMP_QC'] == '1' and p['PRES_QC'] == '1' for p in profile['levels']),
        'salinity_count': sum(p['PSAL'] is not None and p['PSAL_QC'] == '1' and p['PRES_QC'] == '1' for p in profile['levels']),
    }


def get_profile(data, profile_id):
    for profile in data['profiles']:
        if profile['id'] == profile_id:
            return profile
    raise HTTPException(404, detail={'code': 'PROFILE_NOT_FOUND', 'message': 'This profile is not in the current snapshot.'})


def result_for(data, profile, selection: Selection):
    accepted = {'1'} if selection.qc == 'strict' else {'1', '2'}
    observations = []
    metadata_accepted = profile['position_qc'] in accepted and profile['time_qc'] in accepted
    for sample in profile['levels']:
        depth = sample['depth_m']
        if not metadata_accepted or depth is None or sample['PRES_QC'] not in accepted:
            continue
        if not selection.min_depth <= depth <= selection.max_depth:
            continue
        temperature = sample['TEMP'] if sample['TEMP_QC'] in accepted else None
        salinity = sample['PSAL'] if sample['PSAL_QC'] in accepted else None
        if temperature is None and salinity is None:
            continue
        observations.append({
            'source_level': sample['source_level'], 'depth_m': depth,
            'pressure_dbar': sample['PRES'], 'pressure_qc': sample['PRES_QC'],
            'temperature': temperature, 'temperature_qc': sample['TEMP_QC'],
            'salinity': salinity, 'salinity_qc': sample['PSAL_QC'],
        })
    observations.sort(key=lambda p: (p['depth_m'], p['source_level']))
    plan = {'profile_id': profile['id'], **selection.model_dump()}
    identity = json.dumps([data['snapshot_id'], data['method_version'], plan], sort_keys=True)
    return {
        'result_id': hashlib.sha256(identity.encode()).hexdigest()[:16],
        'snapshot_id': data['snapshot_id'], 'method_version': data['method_version'],
        'plan': plan, 'profile': summarize(profile),
        'source': profile['source'] | {'profile_index': profile['source_profile_index'], 'variables': profile['source_variables']},
        'units': {'temperature': '°C', 'salinity': 'PSS-78 (dimensionless)', 'pressure': 'dbar', 'depth': 'm'},
        'methods': {'depth': 'Positive-down depth = -gsw.z_from_p(selected pressure, latitude); no dynamic-height correction.', 'values': 'Raw for mode R; adjusted for modes A/D. No raw fallback.', 'qc': 'Accepted flags: ' + ', '.join(sorted(accepted)), 'interpolation': 'None. Chart lines connect observed levels; missing variable values break the line.'},
        'counts': {'source_levels': len(profile['levels']), 'retained_levels': len(observations), 'excluded_levels': len(profile['levels']) - len(observations), 'temperature': sum(p['temperature'] is not None for p in observations), 'salinity': sum(p['salinity'] is not None for p in observations)},
        'observations': observations,
        'warnings': (['Real-time mode R: preliminary quality control; values may be revised by delayed-mode processing.'] if profile['data_mode'] == 'R' else []) + ([] if observations else ['No usable observations for these filters.']) + ([] if metadata_accepted else ['Position or time quality does not meet the selected policy.']),
    }


@app.get('/api/health')
def health():
    return {'status': 'ok', 'snapshot_ready': SNAPSHOT_PATH.exists()}


@app.get('/api/catalog')
def catalog():
    data = snapshot()
    return {k: v for k, v in data.items() if k != 'profiles'} | {'profiles': [summarize(p) for p in data['profiles']]}


@app.post('/api/query')
def query_profiles(plan: QueryPlan):
    return execute_query(snapshot(), plan)


@app.post('/api/interpret')
def interpret_question(request: InterpretRequest):
    from backend.assistant import interpret_assisted
    return interpret_assisted(request, snapshot())

@app.post('/api/generate_answer')
def generate_answer(request: GenerateAnswerRequest):
    from backend.assistant import generate_detailed_answer
    return generate_detailed_answer(request)


@app.post('/api/query/export')
def export_query(plan: QueryPlan):
    result = execute_query(snapshot(), plan)
    stream = io.StringIO(newline='')
    fields = ['profile_id', 'wmo', 'timestamp', 'latitude', 'longitude', 'source_file', 'source_level', 'depth_m', 'pressure_dbar', 'pressure_qc', 'temperature', 'temperature_qc', 'salinity', 'salinity_qc']
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for profile_result in result['profiles']:
        profile = profile_result['profile']
        for observation in profile_result['observations']:
            writer.writerow({'profile_id': profile['id'], **{k: profile[k] for k in ['wmo', 'timestamp', 'latitude', 'longitude']}, 'source_file': profile_result['source']['filename'], **observation})
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('observations.csv', stream.getvalue())
        bundle.writestr('evidence.json', json.dumps(result, indent=2, allow_nan=False))
        bundle.writestr('README.txt', 'FloatChat multi-profile query. Dates inclusive in UTC. Blank variable cells are unrequested or unavailable, never zero. Source level/profile indices are zero-based. Evidence contains the full plan, source checksums, units and methods. Argo: https://doi.org/10.17882/42182')
    return Response(archive.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="floatchat-query-{result["query_id"]}.zip"'})


@app.get('/api/profiles/{profile_id}')
def profile(profile_id: str, selection: Annotated[Selection, Query()]):
    data = snapshot()
    return result_for(data, get_profile(data, profile_id), selection)


@app.get('/api/profiles/{profile_id}/export')
def export(profile_id: str, selection: Annotated[Selection, Query()]):
    data = snapshot()
    result = result_for(data, get_profile(data, profile_id), selection)
    csv_buffer = io.StringIO(newline='')
    columns = ['source_level', 'depth_m', 'pressure_dbar', 'pressure_qc', 'temperature', 'temperature_qc', 'salinity', 'salinity_qc']
    writer = csv.DictWriter(csv_buffer, fieldnames=columns)
    writer.writeheader()
    writer.writerows(result['observations'])
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('observations.csv', csv_buffer.getvalue())
        bundle.writestr('evidence.json', json.dumps(result, indent=2, allow_nan=False))
        bundle.writestr('README.txt', 'FloatChat observed profile export\nCSV blanks are missing/rejected values, never zeros.\nsource_level is zero-based in the original NetCDF profile.\nSee evidence.json for exact query, source URL, SHA-256, units and methods.\nArgo data: https://doi.org/10.17882/42182\n')
    return Response(archive.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="floatchat-{result["result_id"]}.zip"'})


@app.get("/api/assistant/status")
def assistant_status():
    from backend.assistant import configuration
    return configuration()


@app.post('/api/query/report')
def query_report(plan: QueryPlan):
    from backend.report import render_report
    result = execute_query(snapshot(), plan)
    return Response(render_report(result), media_type='text/html', headers={
        'Content-Disposition': f'attachment; filename="floatchat-report-{result["query_id"]}.html"',
        'X-Content-Type-Options': 'nosniff',
    })


@app.get('/api/data/status')
def data_status():
    from backend.refresh import status
    return status() | {'active_snapshot_id': snapshot()['snapshot_id']}


@app.post('/api/data/refresh')
def refresh_data(request: Request, cycles: int = 3):
    from backend.refresh import refresh_isolated
    # Custom same-origin header prevents cross-site HTML forms triggering downloads.
    if request.headers.get('x-floatchat-refresh') != '1':
        raise HTTPException(403, detail='Use the workspace refresh control.')
    if cycles not in (3, 12, 24):
        raise HTTPException(422, detail='Choose 3, 12 or 24 cycles per float.')
    return refresh_isolated(cycles)


@app.post('/api/query/quality-comparison')
def query_quality_comparison(plan: QueryPlan):
    from backend.quality import compare_quality
    return compare_quality(snapshot(), plan)


@app.get('/api/query/sofar')
def sofar_endpoint():
    """Return SOFAR channel depth and sound-speed profile per profile."""
    data = snapshot()
    results = []
    for profile in data['profiles']:
        info = sofar_depth(profile)
        results.append({
            'profile_id': profile['id'],
            'wmo': profile['wmo'],
            'cycle': profile['cycle'],
            'latitude': profile['latitude'],
            'longitude': profile['longitude'],
            **info,
        })
    return results



class SnapshotSwitch(BaseModel):
    snapshot_id: str = Field(pattern=r'^argo-[0-9a-f]{12}$')
    expected_current: str = Field(pattern=r'^argo-[0-9a-f]{12}$')


@app.get('/api/data/snapshots')
def archived_snapshots():
    from backend.archive import list_snapshots
    return list_snapshots()


@app.post('/api/data/snapshots/activate')
def activate_snapshot(body: SnapshotSwitch, request: Request):
    if request.headers.get('x-floatchat-refresh') != '1':
        raise HTTPException(403, detail={'message':'Use the workspace archive control.'})
    from backend.archive import activate
    return activate(body.snapshot_id, body.expected_current)

@app.post('/api/query/anomalies')
def query_anomalies(body: AnomalyRequest):
    from backend.anomalies import compare, load_reference
    result = execute_query(snapshot(), body.plan)
    try:
        reference = load_reference()
    except (ValueError, OSError) as exc:
        raise HTTPException(503, detail={'message': 'Reference cache is unreadable. Rebuild the WOA23 cache.'}) from exc
    return compare(result, reference, body.depth_tolerance_m)


@app.post('/api/query/ocean-analytics')
def query_ocean_analytics(plan: QueryPlan):
    from backend.ocean_analytics import compute_ocean_analytics
    result = execute_query(snapshot(), plan)
    return compute_ocean_analytics(result)


@app.post('/api/query/geojson')
def export_geojson_query(plan: QueryPlan):
    from backend.ocean_analytics import export_geojson
    result = execute_query(snapshot(), plan)
    geojson_data = export_geojson(result)
    return Response(
        content=json.dumps(geojson_data, indent=2),
        media_type='application/geo+json',
        headers={'Content-Disposition': f'attachment; filename="floatchat-query-{result["query_id"]}.geojson"'}
    )


class SQLQueryRequest(BaseModel):
    query: str


@app.get('/api/database/status')
@app.get('/api/db/status')
def get_database_status():
    from backend.database import get_db_status
    return get_db_status()

@app.get('/api/satellite/config')
def satellite_config():
    """Return static layer metadata for satellite overlays."""
    return satellite.list_layers()

@app.get('/api/satellite/tile')
def satellite_tile(layer: str, date: str):
    """Proxy tile PNG for given layer and ISO date.
    Returns image/png response.
    """
    # Validate layer against known ids
    if layer not in ('sst', 'ssta'):
        raise HTTPException(400, detail='Invalid layer id')
    # Validate date format via satellite.validate_date
    iso_date = satellite.validate_date(date)
    data = satellite.fetch_tile(layer, iso_date)
    return Response(content=data, media_type='image/png')



@app.post('/api/database/query')
def execute_sql_query(body: SQLQueryRequest):
    from backend.database import run_safe_query
    try:
        results = run_safe_query(body.query)
        return {'status': 'success', 'count': len(results), 'data': results}
    except Exception as exc:
        raise HTTPException(400, detail={'code': 'SQL_ERROR', 'message': str(exc)})


@app.post('/api/database/sync')
def sync_database():
    from backend.database import init_database, get_db_status
    init_database(force_rebuild=True)
    return {'status': 'success', 'message': 'Database synchronized with snapshot.', 'db': get_db_status()}


class BookmarkPayload(BaseModel):
    id: str | None = None
    name: str
    created_at: str | None = None
    plan: dict

@app.get('/api/bookmarks')
def get_user_bookmarks():
    from backend.database import list_bookmarks
    return list_bookmarks()

@app.post('/api/bookmarks')
def save_user_bookmark(body: BookmarkPayload):
    import uuid, datetime
    from backend.database import save_bookmark
    id_str = body.id or str(uuid.uuid4())[:8]
    created_at = body.created_at or datetime.datetime.utcnow().isoformat() + 'Z'
    return save_bookmark(id_str, body.name, created_at, body.plan)

@app.delete('/api/bookmarks/{bookmark_id}')
def delete_user_bookmark(bookmark_id: str):
    from backend.database import delete_bookmark
    return delete_bookmark(bookmark_id)


# Initialize SQLite DB schema on app module load
try:
    from backend.database import init_database
    init_database()
except Exception as err:
        print(f"Database init warning: {err}")


