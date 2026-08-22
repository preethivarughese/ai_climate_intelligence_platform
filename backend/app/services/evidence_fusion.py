"""Weighted fusion of ground telemetry, citizen evidence, satellite signals and meteorology."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..models.schemas import DataStatus, EvidenceSourceItem, FusedHotspotEvent

COMPASS_POINTS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]

WEIGHTS = {
    "ground": 0.35,
    "image": 0.20,
    "sensors": 0.10,
    "satellite_no2": 0.15,
    "fire": 0.10,
    "meteorology": 0.10,
}


def _compass(bearing_deg: float) -> str:
    return COMPASS_POINTS[int((bearing_deg % 360) / 22.5 + 0.5) % 16]


def downwind_zones(region_name: str, wind_direction_deg: float, wind_speed_kmh: float) -> List[str]:
    """Plume-carry zones derived from the wind vector rather than fixed placeholder sectors.

    Meteorological wind direction is the direction the wind blows *from*, so the plume travels
    towards the reciprocal bearing. Distances assume the plume drifts with the wind for 1-3 hours.
    """
    bearing = (wind_direction_deg + 180.0) % 360.0
    heading = _compass(bearing)
    return [
        f"{max(1, round(wind_speed_kmh * 1)):d} km {heading} of {region_name}",
        f"{max(2, round(wind_speed_kmh * 2)):d} km {heading} of {region_name}",
        f"{max(3, round(wind_speed_kmh * 3)):d} km {heading} corridor",
    ]


def fuse_environmental_signals(
    region_id: str,
    region_name: str,
    lat: float,
    lon: float,
    current_pm25: float,
    baseline_pm25: float,
    image_result: Optional[Dict[str, Any]],
    satellite_no2_available: bool,
    satellite_no2_zscore: float,
    wind_speed_kmh: float,
    wind_direction_deg: float,
    weather_inversion: bool,
    satellite_source: str = "Copernicus Sentinel-5P",
    satellite_is_direct: bool = True,
    citizen_sensor_readings: Optional[List[Dict[str, Any]]] = None,
    fire_activity: Optional[Dict[str, Any]] = None,
) -> FusedHotspotEvent:
    evidence_items: List[EvidenceSourceItem] = []
    achievable_weight = 0.0

    deviation = max(0.0, (current_pm25 - baseline_pm25) / max(baseline_pm25, 1.0))
    evidence_items.append(EvidenceSourceItem(
        name="CPCB Continuous Ground Telemetry",
        status=f"Active ({current_pm25} µg/m³, +{deviation * 100:.0f}% over baseline)",
        confidence_contribution=round(WEIGHTS["ground"] * min(deviation, 1.0), 3),
        description=f"Direct sensor reading shows PM2.5 levels exceeding the seasonal baseline ({baseline_pm25} µg/m³).",
        raw_source="CPCB CAAQMS Grid / CAMS reanalysis",
        data_status=DataStatus.REAL,
    ))
    achievable_weight += WEIGHTS["ground"]

    likely_event = "unspecified_ground_anomaly"
    if image_result and image_result.get("is_relevant"):
        likely_event = image_result.get("event_type", likely_event)
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Image Optical Confirmation",
            status=f"Verified ({likely_event})",
            confidence_contribution=round(WEIGHTS["image"] * float(image_result.get("confidence", 0.0)), 3),
            description=str(image_result.get("plain_description", "Vision model confirmed a visible plume.")),
            raw_source="Citizen Portal / Gemini Vision",
            data_status=DataStatus.REAL,
        ))
        achievable_weight += WEIGHTS["image"]
    else:
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Image Optical Confirmation",
            status="No matching image in the last 6 hours",
            confidence_contribution=0.0,
            description="No citizen photo of this area was verified within the fusion window.",
            raw_source="Citizen Portal",
            data_status=DataStatus.UNAVAILABLE,
        ))

    readings = citizen_sensor_readings or []
    if readings:
        mean_reading = sum(float(r["pm25"]) for r in readings) / len(readings)
        corroboration = max(0.0, min(1.0, (mean_reading - baseline_pm25) / max(baseline_pm25, 1.0)))
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Low-Cost Sensor Network",
            status=f"{len(readings)} reading(s), mean {mean_reading:.1f} µg/m³",
            confidence_contribution=round(WEIGHTS["sensors"] * corroboration, 3),
            description="Community-submitted sensor readings within 25 km corroborate the official station grid.",
            raw_source="Citizen sensor intake (/api/citizen/sensor)",
            data_status=DataStatus.REAL,
        ))
        achievable_weight += WEIGHTS["sensors"]
    else:
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Low-Cost Sensor Network",
            status="No community readings in the last 24 hours",
            confidence_contribution=0.0,
            description="No citizen-operated sensor submitted a reading near this coordinate.",
            raw_source="Citizen sensor intake (/api/citizen/sensor)",
            data_status=DataStatus.UNAVAILABLE,
        ))

    if satellite_no2_available:
        evidence_items.append(EvidenceSourceItem(
            name="Sentinel-5P TROPOMI NO2 Column",
            status=(
                f"Elevated Plume Detected ({satellite_no2_zscore:+.1f}σ)" if satellite_no2_zscore > 0
                else f"No Column Anomaly ({satellite_no2_zscore:+.1f}σ)"
            ),
            confidence_contribution=round(WEIGHTS["satellite_no2"] * min(max(satellite_no2_zscore / 2.5, 0.0), 1.0), 3),
            description="Orbital spectrometer indicates a tropospheric column density anomaly against a 30-day baseline.",
            raw_source=satellite_source,
            data_status=DataStatus.REAL if satellite_is_direct else DataStatus.SIMULATED_PROTOTYPE,
        ))
        achievable_weight += WEIGHTS["satellite_no2"]

    if fire_activity and fire_activity.get("available"):
        fire_count = int(fire_activity.get("active_fire_count") or 0)
        if fire_count and likely_event == "unspecified_ground_anomaly":
            likely_event = "biomass_burning"
        evidence_items.append(EvidenceSourceItem(
            name="VIIRS Active Fire Detections",
            status=str(fire_activity.get("display")),
            confidence_contribution=round(WEIGHTS["fire"] * min(fire_count / 5.0, 1.0), 3),
            description="Satellite thermal anomalies indicate open burning upwind of or within the monitored area.",
            raw_source=str(fire_activity.get("source")),
            data_status=DataStatus.REAL,
        ))
        achievable_weight += WEIGHTS["fire"]

    evidence_items.append(EvidenceSourceItem(
        name="Meteorological Dispersion Index",
        status=f"Wind {wind_speed_kmh} km/h from {_compass(wind_direction_deg)} (Inversion: {weather_inversion})",
        confidence_contribution=round(WEIGHTS["meteorology"] * (0.85 if weather_inversion or wind_speed_kmh < 6 else 0.35), 3),
        description="Atmospheric boundary layer stagnation status governing how fast the plume disperses.",
        raw_source="Open-Meteo / ERA5 automated weather",
        data_status=DataStatus.REAL,
    ))
    achievable_weight += WEIGHTS["meteorology"]

    total_contribution = sum(item.confidence_contribution for item in evidence_items)
    composite_confidence = round(total_contribution / max(achievable_weight, 1e-6), 2)
    zones = downwind_zones(region_name, wind_direction_deg, wind_speed_kmh)
    detection_time = datetime.now()

    if composite_confidence >= 0.8 and current_pm25 > 150:
        severity = "CRITICAL"
    elif composite_confidence >= 0.5 or current_pm25 > 90:
        severity = "ELEVATED"
    else:
        severity = "WATCH"

    return FusedHotspotEvent(
        event_id=f"EVT-{region_id.upper()}-{detection_time.strftime('%Y%m%d%H%M')}",
        region_id=region_id,
        location_name=region_name,
        lat=lat,
        lon=lon,
        detection_time=detection_time.strftime("%Y-%m-%d %H:%M"),
        composite_confidence=composite_confidence,
        severity=severity,
        likely_event_type=likely_event,
        evidence_breakdown=evidence_items,
        wind_direction_deg=wind_direction_deg,
        wind_speed_kmh=wind_speed_kmh,
        downwind_impact_zones=zones,
        simple_story=(
            f"Air sensors in {region_name} are reading {current_pm25} µg/m³ of dust/smoke "
            f"(+{deviation * 100:.0f}% above normal). With wind at {wind_speed_kmh} km/h, the plume is "
            f"drifting towards {zones[0]}."
        ),
        plain_health_advice=(
            "Keep windows closed. Wear an N95 mask if outdoors and avoid morning workouts near the affected area."
        ),
    )
