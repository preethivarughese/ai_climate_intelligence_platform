from typing import Dict, Any, List, Optional
from ..models.schemas import EvidenceSourceItem, FusedHotspotEvent, DataStatus

def fuse_environmental_signals(region_id: str, region_name: str, lat: float, lon: float, current_pm25: float, baseline_pm25: float, image_result: Optional[Dict[str, Any]], satellite_no2_available: bool, satellite_no2_zscore: float, wind_speed_kmh: float, wind_direction_deg: float, weather_inversion: bool, satellite_source: str = "Copernicus Sentinel-5P", satellite_is_direct: bool = True) -> FusedHotspotEvent:
    evidence_items = []
    
    deviation = max(0.0, (current_pm25 - baseline_pm25) / baseline_pm25)
    evidence_items.append(EvidenceSourceItem(
        name="CPCB Continuous Ground Telemetry",
        status=f"Active ({current_pm25} µg/m³, +{deviation*100:.0f}% over baseline)",
        confidence_contribution=round(0.40 * min(deviation, 1.0), 3),
        description=f"Direct sensor reading shows PM2.5 levels exceeding seasonal baseline ({baseline_pm25} µg/m³).",
        raw_source="CPCB CAAQMS Grid",
        data_status=DataStatus.REAL
    ))

    if image_result and image_result.get("is_relevant", False):
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Image Optical Confirmation",
            status=f"Verified ({image_result.get('event_type')})",
            confidence_contribution=round(0.25 * float(image_result.get("confidence", 0.0)), 3),
            description=f"Vision model confirmed visual smoke plume.",
            raw_source="Citizen Browser Upload / Gemini Vision",
            data_status=DataStatus.REAL
        ))
        likely_event = image_result.get("event_type")
    else:
        evidence_items.append(EvidenceSourceItem(
            name="Citizen Image Optical Confirmation",
            status="No matching image uploaded",
            confidence_contribution=0.0,
            description="Ground photo validation was not submitted for this time window.",
            raw_source="Citizen Portal",
            data_status=DataStatus.UNAVAILABLE
        ))
        likely_event = "unspecified_ground_anomaly"

    if satellite_no2_available:
        evidence_items.append(EvidenceSourceItem(
            name="Sentinel-5P TROPOMI NO2 Column",
            status=(
                f"Elevated Plume Detected ({satellite_no2_zscore:+.1f}σ)" if satellite_no2_zscore > 0
                else f"No Column Anomaly ({satellite_no2_zscore:+.1f}σ)"
            ),
            confidence_contribution=round(0.20 * min(max(satellite_no2_zscore / 2.5, 0.0), 1.0), 3),
            description="Orbital spectrometer indicates tropospheric column density anomaly.",
            raw_source=satellite_source,
            data_status=DataStatus.REAL if satellite_is_direct else DataStatus.SIMULATED_PROTOTYPE
        ))

    evidence_items.append(EvidenceSourceItem(
        name="IMD Meteorological Dispersion Index",
        status=f"Wind {wind_speed_kmh} km/h (Inversion: {weather_inversion})",
        confidence_contribution=round(0.15 * (0.85 if weather_inversion or wind_speed_kmh < 6 else 0.35), 3),
        description="Atmospheric boundary layer stagnation status.",
        raw_source="IMD Automated Weather Station",
        data_status=DataStatus.REAL
    ))

    active_weights = sum(item.confidence_contribution for item in evidence_items)
    normalized_confidence = round(active_weights / (0.40 + (0.25 if image_result else 0.0) + 0.20 + 0.15), 2)
    zones = [f"{region_name} Sector 4", f"{region_name} Downwind Corridor", "Outer Ring Belt"]

    return FusedHotspotEvent(
        event_id=f"EVT-{region_id.upper()}-2026",
        region_id=region_id,
        location_name=region_name,
        lat=lat,
        lon=lon,
        detection_time="2026-08-21 11:30 IST",
        composite_confidence=normalized_confidence,
        severity="CRITICAL" if normalized_confidence >= 0.8 and current_pm25 > 150 else "ELEVATED",
        likely_event_type=likely_event,
        evidence_breakdown=evidence_items,
        wind_direction_deg=wind_direction_deg,
        wind_speed_kmh=wind_speed_kmh,
        downwind_impact_zones=zones,
        simple_story=f"Air sensors in {region_name} are reading {current_pm25} µg/m³ of dust/smoke (+{deviation*100:.0f}% above normal). Because wind is low ({wind_speed_kmh} km/h), smoke is slowly drifting toward {zones[0]} and {zones[1]}.",
        plain_health_advice="Keep windows closed. Wear an N95 mask if outdoors and avoid morning workouts near the affected area."
    )
