"""Active fire (thermal anomaly) detections around a coordinate.

Source is NASA FIRMS VIIRS near-real-time detections, which is the satellite signal behind
stubble-burning and open-waste-burning episodes. FIRMS requires a free MAP_KEY; without one
the panel reports that it is unconfigured rather than showing an invented anomaly value.
"""

import csv
import io
import logging
import math
import time
from typing import Any, Dict, Tuple

import requests

from ..core.config import settings

logger = logging.getLogger(__name__)

FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCE_DATASET = "VIIRS_SNPP_NRT"
LOOKBACK_DAYS = 2
SEARCH_RADIUS_KM = 60.0
CACHE_TTL_SECONDS = 1800
_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def _unconfigured() -> Dict[str, Any]:
    return {
        "available": False,
        "active_fire_count": None,
        "max_frp_mw": None,
        "display": "Not configured",
        "source": "NASA FIRMS VIIRS",
        "status_detail": "Set NASA_FIRMS_MAP_KEY to enable active fire detection (free key from firms.modaps.eosdis.nasa.gov).",
    }


def get_active_fires(lat: float, lon: float, radius_km: float = SEARCH_RADIUS_KM) -> Dict[str, Any]:
    """Count and summarise VIIRS thermal anomalies within `radius_km` of the coordinate."""
    if not settings.NASA_FIRMS_MAP_KEY:
        return _unconfigured()

    cache_key = f"{round(lat, 2)}:{round(lon, 2)}:{radius_km}"
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    lat_delta = radius_km / 111.0
    lon_delta = radius_km / max(1.0, 111.0 * math.cos(math.radians(lat)))
    bbox = f"{lon - lon_delta:.4f},{lat - lat_delta:.4f},{lon + lon_delta:.4f},{lat + lat_delta:.4f}"

    try:
        response = requests.get(
            f"{FIRMS_URL}/{settings.NASA_FIRMS_MAP_KEY}/{SOURCE_DATASET}/{bbox}/{LOOKBACK_DAYS}",
            timeout=15,
        )
        response.raise_for_status()
        detections = list(csv.DictReader(io.StringIO(response.text)))
    except Exception as exc:
        logger.warning("FIRMS active fire lookup failed for %s,%s: %s", lat, lon, exc)
        return {
            **_unconfigured(),
            "status_detail": f"FIRMS request failed: {exc}",
        }

    frps = [float(row["frp"]) for row in detections if row.get("frp") not in (None, "")]
    count = len(detections)
    result = {
        "available": True,
        "active_fire_count": count,
        "max_frp_mw": round(max(frps), 1) if frps else None,
        "display": (
            f"{count} active fire{'s' if count != 1 else ''} within {radius_km:.0f} km"
            if count
            else f"No detections within {radius_km:.0f} km"
        ),
        "source": f"NASA FIRMS {SOURCE_DATASET} ({LOOKBACK_DAYS}d)",
        "status_detail": f"{count} VIIRS thermal anomaly detection(s) in the last {LOOKBACK_DAYS} days.",
        "detections": [
            {
                "lat": float(row["latitude"]),
                "lon": float(row["longitude"]),
                "acquired": f"{row.get('acq_date', '')} {row.get('acq_time', '')}".strip(),
                "frp_mw": float(row["frp"]) if row.get("frp") else None,
                "confidence": row.get("confidence"),
            }
            for row in detections[:20]
        ],
    }
    _cache[cache_key] = (time.time(), result)
    return result
