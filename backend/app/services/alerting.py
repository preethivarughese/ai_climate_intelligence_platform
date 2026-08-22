"""Alert dispatch to the authorities responsible for an area.

Two delivery channels are supported and both are optional: an HTTP webhook (Slack-compatible
JSON) and SMTP email. When no channel is configured the alert is still evaluated, persisted
and returned with a `NO_CHANNEL_CONFIGURED` status, so the operator can see exactly which
interventions would have been dispatched instead of the platform pretending it sent one.
"""

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Dict, List

import requests

from ..core.config import settings
from . import store

logger = logging.getLogger(__name__)


def _should_dispatch(composite_confidence: float, pm25: float, severity: str) -> bool:
    return (
        severity.upper() in {"CRITICAL", "SEVERE"}
        or (composite_confidence >= settings.ALERT_MIN_CONFIDENCE and pm25 >= settings.ALERT_MIN_PM25)
    )


def _in_cooldown(region_id: str) -> bool:
    last = store.last_alert_for_region(region_id)
    if not last:
        return False
    try:
        created_at = datetime.fromisoformat(last["created_at"])
    except ValueError:
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created_at < timedelta(minutes=settings.ALERT_COOLDOWN_MINUTES)


def _format_body(payload: Dict[str, Any]) -> str:
    actions = "\n".join(f"  - {action}" for action in payload["recommended_actions"])
    return (
        f"AIR POLLUTION INTERVENTION ALERT — {payload['severity']}\n"
        f"Location : {payload['region_name']} ({payload['lat']:.4f}, {payload['lon']:.4f})\n"
        f"Event    : {payload['likely_event_type']} (event {payload['event_id']})\n"
        f"PM2.5    : {payload['pm25']} µg/m³ | AQI {payload['aqi']}\n"
        f"Confidence: {payload['composite_confidence']:.0%} from fused evidence\n"
        f"Downwind : {', '.join(payload['downwind_zones'])}\n\n"
        f"{payload['summary']}\n\nRecommended actions:\n{actions}\n"
    )


def _send_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    body = _format_body(payload)
    response = requests.post(
        settings.ALERT_WEBHOOK_URL,
        json={"text": body, "alert": payload},
        timeout=10,
    )
    response.raise_for_status()
    return {"channel": "webhook", "status": "SENT", "detail": f"HTTP {response.status_code}"}


def _send_email(payload: Dict[str, Any]) -> Dict[str, Any]:
    recipients = [address.strip() for address in settings.ALERT_EMAIL_TO.split(",") if address.strip()]
    message = EmailMessage()
    message["Subject"] = f"[{payload['severity']}] Air pollution intervention — {payload['region_name']}"
    message["From"] = settings.ALERT_EMAIL_FROM or settings.ALERT_SMTP_USER
    message["To"] = ", ".join(recipients)
    message.set_content(_format_body(payload))

    with smtplib.SMTP(settings.ALERT_SMTP_HOST, settings.ALERT_SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if settings.ALERT_SMTP_USER:
            smtp.login(settings.ALERT_SMTP_USER, settings.ALERT_SMTP_PASSWORD)
        smtp.send_message(message)
    return {"channel": "email", "status": "SENT", "detail": f"{len(recipients)} recipient(s)"}


def configured_channels() -> List[str]:
    channels = []
    if settings.ALERT_WEBHOOK_URL:
        channels.append("webhook")
    if settings.ALERT_SMTP_HOST and settings.ALERT_EMAIL_TO:
        channels.append("email")
    return channels


def dispatch_alert(
    event: Dict[str, Any],
    aqi: int,
    pm25: float,
    recommendation: Dict[str, Any],
    force: bool = False,
) -> Dict[str, Any]:
    """Evaluate the trigger rules for a fused event and deliver the alert on every configured channel."""
    severity = str(event.get("severity", "ELEVATED"))
    confidence = float(event.get("composite_confidence", 0.0))
    region_id = str(event.get("region_id", "unknown"))

    if not force and not _should_dispatch(confidence, pm25, severity):
        return {
            "dispatched": False,
            "reason": (
                f"Below dispatch threshold (confidence {confidence:.2f} < {settings.ALERT_MIN_CONFIDENCE} "
                f"or PM2.5 {pm25} < {settings.ALERT_MIN_PM25} µg/m³)."
            ),
            "delivery_status": "NOT_TRIGGERED",
            "results": [],
        }

    if not force and _in_cooldown(region_id):
        return {
            "dispatched": False,
            "reason": f"An alert for {region_id} was already sent within the last {settings.ALERT_COOLDOWN_MINUTES} minutes.",
            "delivery_status": "SUPPRESSED_COOLDOWN",
            "results": [],
        }

    payload = {
        "event_id": event.get("event_id"),
        "region_id": region_id,
        "region_name": event.get("location_name"),
        "lat": float(event.get("lat", 0.0)),
        "lon": float(event.get("lon", 0.0)),
        "severity": severity,
        "composite_confidence": confidence,
        "likely_event_type": event.get("likely_event_type"),
        "pm25": pm25,
        "aqi": aqi,
        "downwind_zones": event.get("downwind_impact_zones", []),
        "summary": recommendation.get("summary", ""),
        "recommended_actions": recommendation.get("recommended_actions", []),
        "issued_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    channels = configured_channels()
    results: List[Dict[str, Any]] = []
    for channel in channels:
        try:
            results.append(_send_webhook(payload) if channel == "webhook" else _send_email(payload))
        except Exception as exc:
            logger.exception("Alert delivery failed on channel %s", channel)
            results.append({"channel": channel, "status": "FAILED", "detail": str(exc)})

    if not channels:
        delivery_status = "NO_CHANNEL_CONFIGURED"
    elif all(result["status"] == "SENT" for result in results):
        delivery_status = "SENT"
    elif any(result["status"] == "SENT" for result in results):
        delivery_status = "PARTIAL"
    else:
        delivery_status = "FAILED"

    stored = store.save_alert(
        {
            "event_id": str(payload["event_id"]),
            "region_id": region_id,
            "region_name": str(payload["region_name"]),
            "severity": severity,
            "composite_confidence": confidence,
            "pm25": pm25,
            "channels": channels,
            "delivery_status": delivery_status,
            "payload": payload,
        }
    )

    return {
        "dispatched": delivery_status in {"SENT", "PARTIAL"},
        "reason": (
            "No delivery channel configured — set ALERT_WEBHOOK_URL or the ALERT_SMTP_* variables "
            "to actually notify authorities."
            if delivery_status == "NO_CHANNEL_CONFIGURED"
            else "Alert triggered by fused evidence thresholds."
        ),
        "delivery_status": delivery_status,
        "alert_id": stored["id"],
        "created_at": stored["created_at"],
        "channels": channels,
        "results": results,
        "payload": payload,
    }
