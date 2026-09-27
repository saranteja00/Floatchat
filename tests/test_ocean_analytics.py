"""Unit tests for FloatChat ocean analytics and GeoJSON export endpoints."""
import json
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.ocean_analytics import (
    compute_potential_density,
    classify_water_mass,
    calculate_profile_mld,
    analyze_marine_heatwaves,
    compute_ocean_analytics,
)

client = TestClient(app)


def test_potential_density_calculation():
    # Pure surface water at 15°C, 35 PSU should yield ~26.4 kg/m^3 sigma_theta
    sigma = compute_potential_density(15.0, 35.0)
    assert 25.0 <= sigma <= 27.5

    # Cold saline water (5°C, 34.5 PSU) should be denser (~27.2 kg/m^3)
    sigma_deep = compute_potential_density(5.0, 34.5)
    assert sigma_deep > sigma


def test_water_mass_classification():
    # Bay of Bengal Surface Water (high temp, low sal)
    wm_bbw = classify_water_mass(28.0, 33.5, 10.0)
    assert wm_bbw == "Bay of Bengal Water (BBW)"

    # Arabian Sea High Salinity Water (high temp, high sal)
    wm_ashw = classify_water_mass(24.0, 36.2, 20.0)
    assert wm_ashw == "Arabian Sea High Salinity Water (ASHW)"

    # Deep Water
    wm_deep = classify_water_mass(2.5, 34.7, 2000.0)
    assert wm_deep == "Deep & Bottom Water (DBW)"


def test_mld_estimation():
    obs = [
        {"depth_m": 5.0, "temperature": 28.5, "salinity": 34.0},
        {"depth_m": 15.0, "temperature": 28.4, "salinity": 34.0},
        {"depth_m": 35.0, "temperature": 28.1, "salinity": 34.1},
        {"depth_m": 55.0, "temperature": 27.5, "salinity": 34.5},  # T drops > 0.2 °C here
        {"depth_m": 100.0, "temperature": 22.0, "salinity": 35.0},
    ]
    mld = calculate_profile_mld(obs)
    assert mld["mld_temp_m"] == 35.0
    assert mld["mld_density_m"] is not None


def test_ocean_analytics_endpoint():
    plan = {
        "snapshot_id": "argo-c3c036a19d04",
        "float_ids": [],
        "start_date": "2025-05-01",
        "end_date": "2025-05-31",
        "min_depth": 0,
        "max_depth": 2000,
        "variables": ["temperature", "salinity"],
        "qc": "strict",
        "bounds": None,
    }
    response = client.post("/api/query/ocean-analytics", json=plan)
    assert response.status_code == 200
    data = response.json()

    assert "profile_count" in data
    assert "water_masses" in data
    assert "mld" in data
    assert "mhw" in data
    assert "executive_summary" in data
    assert len(data["executive_summary"]) > 20


def test_geojson_export_endpoint():
    plan = {
        "snapshot_id": "argo-c3c036a19d04",

        "float_ids": [],
        "start_date": "2025-05-01",
        "end_date": "2025-05-31",
        "min_depth": 0,
        "max_depth": 2000,
        "variables": ["temperature", "salinity"],
        "qc": "strict",
        "bounds": None,
    }
    response = client.post("/api/query/geojson", json=plan)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/geo+json"
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) > 0
    props = data["features"][0]["properties"]
    assert "mld_temp_m" in props
    assert "mhw_severity" in props
