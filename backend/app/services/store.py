"""SQLite persistence for citizen submissions, authority decisions and dispatched alerts.

Uses the stdlib sqlite3 driver so the platform keeps state across restarts without adding
an external database dependency. All access goes through a single connection guarded by a
lock, which is adequate for the single-process uvicorn deployment this platform targets.
"""

import json
import math
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..core.config import settings

_lock = threading.Lock()
_connection: Optional[sqlite3.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS citizen_sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    pm25 REAL NOT NULL,
    pm10 REAL,
    temperature_c REAL,
    humidity_pct REAL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_readings_time ON citizen_sensor_readings(recorded_at);

CREATE TABLE IF NOT EXISTS citizen_image_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    lat REAL,
    lon REAL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    is_relevant INTEGER NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS authority_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    event_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    officer_id TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    event_id TEXT NOT NULL,
    region_id TEXT NOT NULL,
    region_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    composite_confidence REAL NOT NULL,
    pm25 REAL NOT NULL,
    channels TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_region ON alerts(region_id, created_at);

CREATE TABLE IF NOT EXISTS federated_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    completed_at TEXT NOT NULL,
    global_model_version TEXT NOT NULL,
    total_samples INTEGER NOT NULL,
    weighted_mae REAL NOT NULL,
    global_mae REAL NOT NULL,
    node_report TEXT NOT NULL
);
"""


def _cos_deg(degrees: float) -> float:
    return max(0.1, math.cos(math.radians(degrees)))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_connection() -> sqlite3.Connection:
    global _connection
    if _connection is None:
        db_path = Path(settings.DATA_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _connection = sqlite3.connect(str(db_path), check_same_thread=False)
        _connection.row_factory = sqlite3.Row
        _connection.executescript(SCHEMA)
        _connection.commit()
    return _connection


def _execute(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    with _lock:
        conn = get_connection()
        cursor = conn.execute(sql, params)
        conn.commit()
        return cursor


def _query(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def save_sensor_reading(reading: Dict[str, Any]) -> Dict[str, Any]:
    recorded_at = reading.get("recorded_at") or _now()
    cursor = _execute(
        """INSERT INTO citizen_sensor_readings
           (recorded_at, device_id, lat, lon, pm25, pm10, temperature_c, humidity_pct, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            recorded_at,
            reading["device_id"],
            reading["lat"],
            reading["lon"],
            reading["pm25"],
            reading.get("pm10"),
            reading.get("temperature_c"),
            reading.get("humidity_pct"),
            reading.get("notes"),
        ),
    )
    return {**reading, "id": cursor.lastrowid, "recorded_at": recorded_at}


def recent_sensor_readings(
    lat: float,
    lon: float,
    radius_km: float = 25.0,
    hours: int = 24,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Readings inside a bounding box around the coordinate, newest first.

    A degree box is used rather than a great-circle filter; at Indian latitudes the
    error is small relative to the neighbourhood-scale radius this is used for.
    """
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    lat_delta = radius_km / 111.0
    lon_delta = radius_km / max(1.0, 111.0 * abs(_cos_deg(lat)))
    return _query(
        """SELECT * FROM citizen_sensor_readings
           WHERE recorded_at >= ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
           ORDER BY recorded_at DESC LIMIT ?""",
        (since, lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta, limit),
    )


def save_image_report(report: Dict[str, Any]) -> None:
    _execute(
        """INSERT INTO citizen_image_reports
           (recorded_at, lat, lon, event_type, severity, confidence, is_relevant, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            _now(),
            report.get("lat"),
            report.get("lon"),
            report.get("event_type", "unrelated"),
            report.get("severity", "none"),
            float(report.get("confidence", 0.0)),
            1 if report.get("is_relevant") else 0,
            report.get("description") or report.get("plain_description"),
        ),
    )


def latest_image_report(lat: float, lon: float, radius_km: float = 25.0, hours: int = 6) -> Optional[Dict[str, Any]]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    lat_delta = radius_km / 111.0
    lon_delta = radius_km / max(1.0, 111.0 * abs(_cos_deg(lat)))
    rows = _query(
        """SELECT * FROM citizen_image_reports
           WHERE recorded_at >= ? AND is_relevant = 1
             AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
           ORDER BY recorded_at DESC LIMIT 1""",
        (since, lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta),
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "is_relevant": True,
        "event_type": row["event_type"],
        "severity": row["severity"],
        "confidence": row["confidence"],
        "plain_description": row["description"],
        "recorded_at": row["recorded_at"],
    }


def save_feedback(feedback: Dict[str, Any]) -> Dict[str, Any]:
    recorded_at = _now()
    cursor = _execute(
        """INSERT INTO authority_feedback (recorded_at, event_id, decision, notes, officer_id)
           VALUES (?, ?, ?, ?, ?)""",
        (
            recorded_at,
            feedback.get("event_id", "unknown"),
            feedback.get("decision", "unspecified"),
            feedback.get("notes"),
            feedback.get("officer_id", "duty_officer"),
        ),
    )
    return {**feedback, "id": cursor.lastrowid, "recorded_at": recorded_at}


def list_feedback(limit: int = 100) -> List[Dict[str, Any]]:
    return _query("SELECT * FROM authority_feedback ORDER BY id DESC LIMIT ?", (limit,))


def save_alert(alert: Dict[str, Any]) -> Dict[str, Any]:
    created_at = _now()
    cursor = _execute(
        """INSERT INTO alerts
           (created_at, event_id, region_id, region_name, severity, composite_confidence,
            pm25, channels, delivery_status, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            created_at,
            alert["event_id"],
            alert["region_id"],
            alert["region_name"],
            alert["severity"],
            alert["composite_confidence"],
            alert["pm25"],
            json.dumps(alert["channels"]),
            alert["delivery_status"],
            json.dumps(alert["payload"]),
        ),
    )
    return {**alert, "id": cursor.lastrowid, "created_at": created_at}


def last_alert_for_region(region_id: str) -> Optional[Dict[str, Any]]:
    rows = _query(
        "SELECT * FROM alerts WHERE region_id = ? ORDER BY id DESC LIMIT 1",
        (region_id,),
    )
    return rows[0] if rows else None


def list_alerts(limit: int = 50) -> List[Dict[str, Any]]:
    rows = _query("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,))
    for row in rows:
        row["channels"] = json.loads(row["channels"])
        row["payload"] = json.loads(row["payload"])
    return rows


def save_federated_round(round_result: Dict[str, Any]) -> None:
    _execute(
        """INSERT INTO federated_rounds
           (completed_at, global_model_version, total_samples, weighted_mae, global_mae, node_report)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            _now(),
            round_result["global_model_version"],
            round_result["total_samples_aggregated"],
            round_result["weighted_mae"],
            round_result["global_mae"],
            json.dumps(round_result["nodes"]),
        ),
    )


def list_federated_rounds(limit: int = 20) -> List[Dict[str, Any]]:
    rows = _query("SELECT * FROM federated_rounds ORDER BY id DESC LIMIT ?", (limit,))
    for row in rows:
        row["node_report"] = json.loads(row["node_report"])
    return rows


def federated_round_count() -> int:
    rows = _query("SELECT COUNT(*) AS count FROM federated_rounds")
    return int(rows[0]["count"]) if rows else 0


def last_federated_round() -> Optional[Dict[str, Any]]:
    rows = _query("SELECT * FROM federated_rounds ORDER BY id DESC LIMIT 1")
    if not rows:
        return None
    row = rows[0]
    row["node_report"] = json.loads(row["node_report"])
    return row
