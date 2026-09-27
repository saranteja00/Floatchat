'''Satellite data proxy for Floatchat.

Provides:
- /api/satellite/config   → static layer metadata
- /api/satellite/tile     → PNG tile for a given layer & date (proxy to NOAA ERDDAP WMS)

Caching is optional and lives under data/satellite_cache with a 1‑hour TTL.
'''

from __future__ import annotations

import datetime as dt
import pathlib
import urllib.parse
from typing import Literal, TypedDict

import httpx
from fastapi import HTTPException, Response

# Configuration – change only here if you switch providers
ERDDAP_BASE = "https://coastwatch.noaa.gov/erddap/wms"
SST_DATASET = "noaacwLEOACSPOSSTL3SnrtCDaily"          # near‑real‑time SST
SSTA_DATASET = "noaacwLEOACSPOSSTL3SnrtCAnomaly"      # SST anomaly
VARIABLE_SST = "sst"
VARIABLE_SSTA = "sst_anomaly"

# Cache settings (set CACHE_DIR to a non‑existent path to disable)
CACHE_DIR = pathlib.Path(__file__).resolve().parents[1] / "data" / "satellite_cache"
CACHE_TTL_SECONDS = 60 * 60  # 1 hour
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Types
class LayerConfig(TypedDict):
    id: Literal["sst", "ssta"]
    name: str
    description: str
    default_opacity: float
    dataset: str
    variable: str

# Helper utilities
def _transparent_png() -> bytes:
    """1×1 transparent PNG – used when the remote service fails."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
        b"\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
    )

def validate_date(date_str: str | None) -> str:
    """Return an ISO‑8601 date string. Raise 400 if malformed."""
    if not date_str:
        return dt.datetime.utcnow().isoformat()
    try:
        dt_obj = dt.datetime.fromisoformat(date_str)
    except Exception as exc:
        raise HTTPException(400, detail="Invalid date format; use ISO‑8601.") from exc
    return dt_obj.isoformat()

def get_wms_url(dataset: str, variable: str, iso_time: str) -> str:
    """Construct a GetMap URL for the NOAA ERDDAP WMS service."""
    base = f"{ERDDAP_BASE}/{dataset}/request"
    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetMap",
        "layers": f"{dataset}:{variable}",
        "bbox": "-180,-90,180,90",  # global extent
        "crs": "EPSG:4326",
        "width": "960",
        "height": "430",
        "format": "image/png",
        "transparent": "true",
        "time": iso_time,
    }
    return f"{base}?{urllib.parse.urlencode(params)}"

def _cache_path(layer: str, iso_date: str) -> pathlib.Path:
    """File path for cached PNG."""
    safe_date = iso_date.replace(":", "-")
    return CACHE_DIR / layer / f"{safe_date}.png"

def maybe_cache(layer: str, iso_date: str, url: str) -> bytes:
    """Return cached PNG if fresh; otherwise fetch from remote and cache."""
    cache_file = _cache_path(layer, iso_date)
    if cache_file.is_file():
        age = dt.datetime.utcnow().timestamp() - cache_file.stat().st_mtime
        if age < CACHE_TTL_SECONDS:
            return cache_file.read_bytes()
    try:
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
        data = resp.content
    except Exception as exc:
        print(f"[satellite] error fetching {url}: {exc}")
        return _transparent_png()
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_bytes(data)
    return data

# Public API
def list_layers() -> list[LayerConfig]:
    """Static description of the two layers we expose."""
    return [
        {
            "id": "sst",
            "name": "Satellite SST",
            "description": "Near‑real‑time sea surface temperature (°C).",
            "default_opacity": 0.7,
            "dataset": SST_DATASET,
            "variable": VARIABLE_SST,
        },
        {
            "id": "ssta",
            "name": "Satellite SST‑A",
            "description": "Sea surface temperature anomaly (°C).",
            "default_opacity": 0.6,
            "dataset": SSTA_DATASET,
            "variable": VARIABLE_SSTA,
        },
    ]

def fetch_tile(layer: Literal["sst", "ssta"], iso_date: str) -> bytes:
    """Return PNG bytes for the requested layer/date (uses cache)."""
    cfg = next(l for l in list_layers() if l["id"] == layer)
    url = get_wms_url(cfg["dataset"], cfg["variable"], iso_date)
    return maybe_cache(layer, iso_date, url)
