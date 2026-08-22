"""Real hourly observation history used to train the forecasting and federated models.

PM2.5 comes from the CAMS air-quality reanalysis and the meteorology from the ERA5-backed
forecast archive, both served by Open-Meteo. Rows are shaped into the supervised frame the
models consume: given the last two hours of particulate history plus current meteorology,
predict PM2.5 one hour ahead.
"""

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

FEATURE_NAMES = ["prev_pm25", "rolling_pm25", "hour_of_day", "temperature_c", "humidity_pct", "wind_speed_kmh"]
CACHE_TTL_SECONDS = 3600
_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}


def _fetch_hourly(url: str, timeout: int = 20) -> Dict[str, List[Any]]:
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.json().get("hourly", {})


def fetch_hourly_history(lat: float, lon: float, days: int = 30) -> List[Dict[str, Any]]:
    """Aligned hourly PM2.5 and meteorology for a coordinate, oldest first."""
    cache_key = f"{round(lat, 2)}:{round(lon, 2)}:{days}"
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    past_days = max(1, min(days, 92))
    air = _fetch_hourly(
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}&hourly=pm2_5&past_days={past_days}&forecast_days=1&timezone=UTC"
    )
    weather = _fetch_hourly(
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"
        f"&past_days={past_days}&forecast_days=1&timezone=UTC"
    )

    weather_by_time = {
        stamp: (temp, humidity, wind)
        for stamp, temp, humidity, wind in zip(
            weather.get("time", []),
            weather.get("temperature_2m", []),
            weather.get("relative_humidity_2m", []),
            weather.get("wind_speed_10m", []),
        )
    }

    rows: List[Dict[str, Any]] = []
    for stamp, pm25 in zip(air.get("time", []), air.get("pm2_5", [])):
        met = weather_by_time.get(stamp)
        if pm25 is None or met is None or any(v is None for v in met):
            continue
        temperature, humidity, wind = met
        rows.append(
            {
                "time": stamp,
                "pm25": float(pm25),
                "temperature_c": float(temperature),
                "humidity_pct": float(humidity),
                "wind_speed_kmh": float(wind),
                "hour_of_day": int(stamp[11:13]),
            }
        )

    _cache[cache_key] = (time.time(), rows)
    return rows


def build_supervised_frame(rows: List[Dict[str, Any]]) -> Tuple[List[List[float]], List[float]]:
    """Turn an hourly history into (features, next-hour PM2.5 targets)."""
    features: List[List[float]] = []
    targets: List[float] = []
    for index in range(2, len(rows)):
        previous = rows[index - 1]
        rolling = (rows[index - 1]["pm25"] + rows[index - 2]["pm25"]) / 2.0
        current = rows[index]
        features.append(
            [
                previous["pm25"],
                rolling,
                float(current["hour_of_day"]),
                current["temperature_c"],
                current["humidity_pct"],
                current["wind_speed_kmh"],
            ]
        )
        targets.append(current["pm25"])
    return features, targets


def fetch_supervised_frame(lat: float, lon: float, days: int = 30) -> Optional[Tuple[List[List[float]], List[float]]]:
    """Supervised training frame for a coordinate, or None when the upstream archive is unreachable."""
    try:
        rows = fetch_hourly_history(lat, lon, days)
    except Exception as exc:
        logger.warning("Hourly history unavailable for %s,%s: %s", lat, lon, exc)
        return None

    features, targets = build_supervised_frame(rows)
    if len(features) < 48:
        logger.warning("Insufficient history for %s,%s (%d usable hours)", lat, lon, len(features))
        return None
    return features, targets
