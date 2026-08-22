"""API tests that exercise persistence, validation and dispatch gating without hitting paid upstreams."""
import os
import tempfile

os.environ.setdefault("DATA_DB_PATH", os.path.join(tempfile.mkdtemp(), "test_platform.db"))
os.environ.setdefault("ADMIN_ACCESS_TOKEN", "test-token")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import store
from app.services.alerting import dispatch_alert

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


def test_sensor_reading_is_validated_and_persisted():
    payload = {"device_id": "sds011-01", "lat": 28.61, "lon": 77.21, "pm25": 180.5, "pm10": 240.0}
    res = client.post("/api/citizen/sensor", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["computed_aqi"] > 300
    assert body["aqi_category"] == "Very Poor"

    listed = client.get("/api/citizen/sensor", params={"lat": 28.61, "lon": 77.21, "radius_km": 10})
    assert listed.status_code == 200
    assert any(r["device_id"] == "sds011-01" for r in listed.json()["readings"])


def test_sensor_reading_rejects_out_of_range_values():
    res = client.post(
        "/api/citizen/sensor",
        json={"device_id": "bad", "lat": 28.61, "lon": 77.21, "pm25": -5},
    )
    assert res.status_code == 422


def test_authority_endpoints_require_the_admin_token():
    assert client.post("/api/authority/dispatch", json={"city": "Delhi"}).status_code == 401
    assert client.post("/api/authority/feedback", json={"decision": "CONFIRMED"}).status_code == 401
    assert client.get("/api/authority/session", headers=AUTH).status_code == 200


def test_feedback_survives_in_the_database():
    res = client.post(
        "/api/authority/feedback",
        json={"event_id": "EVT-TEST-1", "region_name": "Delhi", "decision": "CONFIRMED"},
        headers=AUTH,
    )
    assert res.status_code == 200
    feedback_id = res.json()["feedback_id"]
    assert any(f["id"] == feedback_id for f in store.list_feedback())


def test_dispatch_without_channels_reports_it_rather_than_pretending():
    event = {
        "event_id": "EVT-TEST-2",
        "region_id": "test_region",
        "region_name": "Test City",
        "lat": 28.61,
        "lon": 77.21,
        "severity": "SEVERE",
        "composite_confidence": 0.9,
        "likely_cause": "industrial_emission",
        "downwind_impact_zones": ["5 km E of Test City"],
    }
    recommendation = {"summary": "Test summary", "actions": ["Inspect the source"]}
    result = dispatch_alert(event, aqi=320, pm25=210.0, recommendation=recommendation)
    assert result["delivery_status"] == "NO_CHANNEL_CONFIGURED"
    assert store.last_alert_for_region("test_region") is not None


def test_dispatch_respects_the_confidence_and_pm25_thresholds():
    event = {
        "event_id": "EVT-TEST-3",
        "region_id": "quiet_region",
        "region_name": "Quiet City",
        "lat": 12.9,
        "lon": 77.5,
        "severity": "BASELINE",
        "composite_confidence": 0.1,
        "likely_cause": "none",
        "downwind_impact_zones": [],
    }
    result = dispatch_alert(event, aqi=40, pm25=12.0, recommendation={"summary": "", "actions": []})
    assert result["delivery_status"] == "NOT_TRIGGERED"


def test_seismic_feed_is_gone_from_the_api_surface():
    paths = client.get("/openapi.json").json()["paths"]
    assert not any("seismic" in path for path in paths)
    assert "/api/forecast" in paths
    assert "/api/federated/status" in paths


@pytest.mark.network
def test_forecast_reports_model_provenance():
    res = client.get("/api/forecast", params={"city": "Delhi", "lat": 28.61, "lon": 77.21, "hours": 6})
    assert res.status_code == 200
    body = res.json()
    assert len(body["forecast"]) == 6
    assert body["model"]["training_samples"] > 0


@pytest.mark.network
def test_federated_round_aggregates_and_persists():
    res = client.post("/api/federated/sync")
    assert res.status_code == 200
    body = res.json()
    assert body["participating_nodes"]
    assert body["total_samples_aggregated"] > 0
    rounds = client.get("/api/federated/rounds").json()["rounds"]
    assert rounds and rounds[0]["global_model_version"] == body["global_model_version"]
