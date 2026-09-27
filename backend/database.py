"""SQLite Database integration for FloatChat Ocean Analytics.

Provides real database storage, SQL querying capabilities, live dataset synchronization,
and database status telemetry for real oceanographic research operations.
"""
from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / 'data/floatchat.db'
SNAPSHOT_PATH = ROOT / 'data/processed/snapshot.json'


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_database(force_rebuild: bool = False) -> None:
    """Initialize SQLite database schema and sync current snapshot profiles/observations."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS profiles (
                    id TEXT PRIMARY KEY,
                    wmo TEXT NOT NULL,
                    cycle INTEGER NOT NULL,
                    direction TEXT,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    data_mode TEXT NOT NULL,
                    position_qc TEXT,
                    time_qc TEXT,
                    max_depth_m REAL
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS observations (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    source_level INTEGER NOT NULL,
                    depth_m REAL,
                    pressure_dbar REAL,
                    pressure_qc TEXT,
                    temperature REAL,
                    temperature_qc TEXT,
                    salinity REAL,
                    salinity_qc TEXT,
                    FOREIGN KEY (profile_id) REFERENCES profiles(id)
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS ocean_analytics_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query_id TEXT NOT NULL,
                    computed_at TEXT NOT NULL,
                    profile_count INTEGER,
                    observation_count INTEGER,
                    avg_mld_thermal_m REAL,
                    avg_mld_density_m REAL,
                    mean_drift_speed_cms REAL,
                    mhw_exceeding_count INTEGER,
                    dominant_water_mass TEXT
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS db_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS user_bookmarks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    plan_json TEXT NOT NULL
                )
            ''')

            # Populate database if empty or force_rebuild requested
            cursor = conn.execute('SELECT COUNT(*) FROM profiles')
            count = cursor.fetchone()[0]

            if count == 0 or force_rebuild:
                _populate_from_snapshot(conn)

    finally:
        conn.close()


def _populate_from_snapshot(conn: sqlite3.Connection) -> None:
    if not SNAPSHOT_PATH.exists():
        return

    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding='utf-8'))
    profiles = snapshot.get('profiles', [])

    conn.execute('DELETE FROM observations')
    conn.execute('DELETE FROM profiles')

    for p in profiles:
        depths = [lvl['depth_m'] for lvl in p.get('levels', []) if lvl.get('depth_m') is not None]
        max_depth = max(depths) if depths else 0.0

        conn.execute('''
            INSERT OR REPLACE INTO profiles (id, wmo, cycle, direction, latitude, longitude, timestamp, data_mode, position_qc, time_qc, max_depth_m)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            p['id'], p['wmo'], p['cycle'], p.get('direction', 'A'),
            p['latitude'], p['longitude'], p['timestamp'],
            p['data_mode'], p.get('position_qc', '1'), p.get('time_qc', '1'), max_depth
        ))

        for lvl in p.get('levels', []):
            obs_id = f"{p['id']}-L{lvl['source_level']}"
            conn.execute('''
                INSERT OR REPLACE INTO observations (id, profile_id, source_level, depth_m, pressure_dbar, pressure_qc, temperature, temperature_qc, salinity, salinity_qc)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                obs_id, p['id'], lvl['source_level'],
                lvl.get('depth_m'), lvl.get('PRES'), lvl.get('PRES_QC', '1'),
                lvl.get('TEMP'), lvl.get('TEMP_QC', '1'),
                lvl.get('PSAL'), lvl.get('PSAL_QC', '1')
            ))

    conn.execute('INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)', ('snapshot_id', snapshot.get('snapshot_id', 'unknown')))
    conn.execute('INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)', ('last_sync', snapshot.get('created_at', 'unknown')))
    conn.execute('INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)', ('db_engine', 'SQLite 3 (floatchat.db)'))
    conn.commit()


def get_db_status() -> Dict[str, Any]:
    """Returns live connection status, table row counts, and storage metrics."""
    if not DB_PATH.exists():
        init_database()

    conn = get_db_connection()
    try:
        profile_count = conn.execute('SELECT COUNT(*) FROM profiles').fetchone()[0]
        obs_count = conn.execute('SELECT COUNT(*) FROM observations').fetchone()[0]
        analytics_count = conn.execute('SELECT COUNT(*) FROM ocean_analytics_log').fetchone()[0]
        
        meta = {row['key']: row['value'] for row in conn.execute('SELECT key, value FROM db_metadata')}

        file_size_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
        bookmarks_count = conn.execute('SELECT COUNT(*) FROM user_bookmarks').fetchone()[0]

        return {
            'status': 'connected',
            'engine': 'SQLite 3 (ACID compliant)',
            'database_path': str(DB_PATH.resolve()),
            'file_size_kb': round(file_size_bytes / 1024, 2),
            'tables': {
                'profiles': profile_count,
                'observations': obs_count,
                'ocean_analytics_log': analytics_count,
                'user_bookmarks': bookmarks_count,
            },
            'metadata': meta,
        }
    finally:
        conn.close()


def save_bookmark(id_str: str, name: str, created_at: str, plan: dict) -> Dict[str, Any]:
    """Save or update a user bookmark in SQLite."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('''
                INSERT OR REPLACE INTO user_bookmarks (id, name, created_at, plan_json)
                VALUES (?, ?, ?, ?)
            ''', (id_str, name, created_at, json.dumps(plan)))
        return {'status': 'success', 'id': id_str}
    finally:
        conn.close()


def list_bookmarks() -> List[Dict[str, Any]]:
    """List all user bookmarks stored in SQLite."""
    conn = get_db_connection()
    try:
        rows = conn.execute('SELECT id, name, created_at, plan_json FROM user_bookmarks ORDER BY created_at DESC').fetchall()
        result = []
        for r in rows:
            result.append({
                'id': r['id'],
                'name': r['name'],
                'created_at': r['created_at'],
                'plan': json.loads(r['plan_json'])
            })
        return result
    finally:
        conn.close()


def delete_bookmark(id_str: str) -> Dict[str, Any]:
    """Delete a user bookmark by ID."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('DELETE FROM user_bookmarks WHERE id = ?', (id_str,))
        return {'status': 'success', 'id': id_str}
    finally:
        conn.close()


def run_safe_query(sql_query: str) -> List[Dict[str, Any]]:
    """Runs read-only SELECT queries safely."""
    clean_sql = sql_query.strip()
    if not clean_sql.upper().startswith('SELECT'):
        raise ValueError('Only read-only SELECT queries are allowed.')

    conn = get_db_connection()
    try:
        cursor = conn.execute(clean_sql)
        columns = [column[0] for column in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        conn.close()
