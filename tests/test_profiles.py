"""Scientific boundary checks against real source files and explicit edge cases."""
import copy
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

from fastapi.testclient import TestClient
import netCDF4
import numpy as np
import pytest
import xarray as xr

from backend import main
from backend.ingestion import normalize_file
from backend.main import Selection, app, result_for

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def data():
    if not main.SNAPSHOT_PATH.exists():
        pytest.fail('Real-data snapshot is required: run python -m backend.ingestion first.')
    return main.snapshot()


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def test_all_displayed_values_match_original_netcdf(data):
    compared = 0
    for profile in data['profiles']:
        path = ROOT / 'data/raw' / profile['source']['filename']
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != profile['source']['sha256']:
            path = ROOT / 'data/raw/refresh' / (profile['source']['sha256'] + '.nc')
        assert hashlib.sha256(path.read_bytes()).hexdigest() == profile['source']['sha256']
        result = result_for(data, profile, Selection())
        with netCDF4.Dataset(path) as source:
            for observation in result['observations']:
                index = (profile['source_profile_index'], observation['source_level'])
                for field, parameter in [('temperature', 'TEMP'), ('salinity', 'PSAL'), ('pressure_dbar', 'PRES')]:
                    variable = parameter if profile['data_mode'] == 'R' else parameter + '_ADJUSTED'
                    assert profile['source_variables'][parameter] == variable
                    if observation[field] is not None:
                        assert observation[field] == float(source.variables[variable][index])
                        compared += 1
                assert observation['depth_m'] >= 0
                # At these latitudes, hydrostatic depth is close to (but not equal to) pressure.
                assert .96 * observation['pressure_dbar'] <= observation['depth_m'] <= 1.01 * observation['pressure_dbar']
    assert compared > 2000


def test_quality_filter_preserves_independent_variables(data):
    profile = copy.deepcopy(data['profiles'][0])
    sample = profile['levels'][0]
    sample['TEMP_QC'] = '4'
    sample['PSAL_QC'] = '1'
    result = result_for(data, profile, Selection())
    observed = next(o for o in result['observations'] if o['source_level'] == 0)
    assert observed['temperature'] is None
    assert observed['salinity'] == sample['PSAL']


def test_exploratory_policy_includes_only_qc_two_in_addition(data):
    profile = copy.deepcopy(data['profiles'][0])
    profile['levels'][0]['TEMP_QC'] = '2'
    profile['levels'][0]['PSAL_QC'] = '2'
    strict = result_for(data, profile, Selection())
    expanded = result_for(data, profile, Selection(qc='expanded'))
    assert 0 not in [o['source_level'] for o in strict['observations']]
    assert 0 in [o['source_level'] for o in expanded['observations']]
    assert strict['result_id'] != expanded['result_id']


@pytest.mark.parametrize('field', ['position_qc', 'time_qc'])
def test_bad_location_or_time_prevents_scientific_result(data, field):
    profile = copy.deepcopy(data['profiles'][0])
    profile[field] = '4'
    result = result_for(data, profile, Selection())
    assert not result['observations']
    assert 'Position or time quality' in result['warnings'][1]


def test_bad_pressure_excludes_level(data):
    profile = copy.deepcopy(data['profiles'][0])
    profile['levels'][0]['PRES_QC'] = '4'
    result = result_for(data, profile, Selection(qc='expanded'))
    assert 0 not in [o['source_level'] for o in result['observations']]


def test_no_raw_fallback_when_adjusted_variable_missing(data, tmp_path):
    original = data['profiles'][0]
    with xr.open_dataset(ROOT / 'data/raw' / original['source']['filename']) as source:
        incomplete = source.drop_vars(['PSAL_ADJUSTED']).load()
    path = tmp_path / 'missing-adjusted.nc'
    incomplete.to_netcdf(path)
    profile = normalize_file(path, original['source'])[0]
    assert profile['source_variables']['PSAL'] == 'PSAL_ADJUSTED'
    assert all(level['PSAL'] is None for level in profile['levels'])


def test_depth_selection_is_bounded_and_stable(data, client):
    profile_id = data['profiles'][0]['id']
    url = f'/api/profiles/{profile_id}?min_depth=200&max_depth=1000'
    result = client.get(url).json()
    assert result['observations']
    assert all(200 <= p['depth_m'] <= 1000 for p in result['observations'])
    assert result['result_id'] == client.get(url).json()['result_id']
    assert client.get(f'/api/profiles/{profile_id}?min_depth=1000&max_depth=200').status_code == 422
    assert client.get(f'/api/profiles/{profile_id}?max_depth=-1').status_code == 422
    assert client.get(f'/api/profiles/{profile_id}?qc=anything').status_code == 422


def test_empty_depth_band_has_no_invented_measurements(data, client):
    result = client.get(f'/api/profiles/{data["profiles"][0]["id"]}?min_depth=5000&max_depth=6000').json()
    assert result['observations'] == []
    assert result['warnings'] == ['No usable observations for these filters.']


def test_export_is_same_result_as_api(data, client):
    profile_id = data['profiles'][0]['id']
    query = '?min_depth=200&max_depth=1000&qc=strict'
    expected = client.get(f'/api/profiles/{profile_id}{query}').json()
    response = client.get(f'/api/profiles/{profile_id}/export{query}')
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        evidence = json.loads(archive.read('evidence.json'))
        assert evidence == expected
        rows = list(csv.DictReader(io.StringIO(archive.read('observations.csv').decode())))
        assert len(rows) == expected['counts']['retained_levels']
        for row, observation in zip(rows, expected['observations']):
            assert int(row['source_level']) == observation['source_level']
            assert float(row['depth_m']) == observation['depth_m']


def test_missing_snapshot_and_profile_are_explicit(client, monkeypatch, tmp_path):
    assert client.get('/api/profiles/not-a-profile').status_code == 404
    monkeypatch.setattr(main, 'SNAPSHOT_PATH', tmp_path / 'missing.json')
    response = client.get('/api/catalog')
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'SNAPSHOT_UNAVAILABLE'
