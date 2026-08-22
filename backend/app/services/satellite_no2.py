"""Tropospheric NO2 column retrieval for a given coordinate.

Primary source is the Copernicus Sentinel-5P TROPOMI NO2 product served through the
Sentinel Hub Statistical API (requires SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET).
When those credentials are absent or the request fails, a CAMS surface NO2 series from the
open Open-Meteo air-quality API is used to derive an estimated column so the platform still
reports a measured (rather than hardcoded) anomaly, flagged with a lower-fidelity source.
"""

import logging
import math
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..core.config import settings

logger = logging.getLogger(__name__)

AVOGADRO = 6.02214076e23
NO2_MOLAR_MASS_G = 46.0055
# Effective mixing height (m) used to translate a surface concentration into an
# approximate tropospheric column when TROPOMI retrievals are unavailable.
PROXY_MIXING_HEIGHT_M = 300.0

BASELINE_DAYS = 30
CACHE_TTL_SECONDS = 1800
_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

S5P_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{bands: ["NO2", "dataMask"]}],
    output: [
      {id: "no2", bands: 1, sampleType: "FLOAT32"},
      {id: "dataMask", bands: 1}
    ]
  };
}
function evaluatePixel(sample) {
  return {no2: [sample.NO2], dataMask: [sample.dataMask]};
}
"""


def _mean_std(values: List[float]) -> Tuple[float, float]:
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return mean, math.sqrt(variance)


def _zscore(current: float, baseline: List[float]) -> Tuple[float, float, float]:
    """Returns (zscore, baseline_mean, baseline_std) for the trailing baseline window."""
    if len(baseline) < 3:
        return 0.0, current, 0.0
    mean, std = _mean_std(baseline)
    # Guard against a degenerate baseline producing an unbounded z-score.
    std = max(std, abs(mean) * 0.05, 1e-30)
    return (current - mean) / std, mean, std


def _sentinel_hub_token() -> Optional[str]:
    if not (settings.SENTINEL_HUB_CLIENT_ID and settings.SENTINEL_HUB_CLIENT_SECRET):
        return None
    res = requests.post(
        f"{settings.SENTINEL_HUB_BASE_URL}/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": settings.SENTINEL_HUB_CLIENT_ID,
            "client_secret": settings.SENTINEL_HUB_CLIENT_SECRET,
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json().get("access_token")


def _fetch_sentinel5p_series(lat: float, lon: float, days: int) -> List[Tuple[str, float]]:
    """Daily mean tropospheric NO2 column (mol/m²) over the last `days` days."""
    token = _sentinel_hub_token()
    if not token:
        return []

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    half_box = 0.25
    payload = {
        "input": {
            "bounds": {
                "bbox": [lon - half_box, lat - half_box, lon + half_box, lat + half_box],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{"type": "sentinel-5p-l2", "dataFilter": {"timeliness": "OFFL"}}],
        },
        "aggregation": {
            "timeRange": {"from": start.strftime("%Y-%m-%dT00:00:00Z"), "to": end.strftime("%Y-%m-%dT23:59:59Z")},
            "aggregationInterval": {"of": "P1D"},
            "resx": 0.05,
            "resy": 0.05,
            "evalscript": S5P_EVALSCRIPT,
        },
    }
    res = requests.post(
        f"{settings.SENTINEL_HUB_BASE_URL}/api/v1/statistics",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=25,
    )
    res.raise_for_status()

    series: List[Tuple[str, float]] = []
    for interval in res.json().get("data", []):
        stats = interval.get("outputs", {}).get("no2", {}).get("bands", {}).get("B0", {}).get("stats", {})
        mean = stats.get("mean")
        if mean is None or stats.get("sampleCount", 0) == 0:
            continue
        series.append((interval.get("interval", {}).get("from", ""), float(mean)))
    return series


def _fetch_cams_surface_series(lat: float, lon: float, days: int) -> List[Tuple[str, float]]:
    """Daily mean surface NO2 (µg/m³) from the CAMS reanalysis exposed by Open-Meteo."""
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}&hourly=nitrogen_dioxide"
        f"&past_days={min(days, 92)}&forecast_days=1&timezone=UTC"
    )
    res = requests.get(url, timeout=10)
    res.raise_for_status()
    hourly = res.json().get("hourly", {})
    times = hourly.get("time", [])
    values = hourly.get("nitrogen_dioxide", [])

    buckets: Dict[str, List[float]] = {}
    for stamp, value in zip(times, values):
        if value is None:
            continue
        buckets.setdefault(stamp[:10], []).append(float(value))
    return [(day, sum(vals) / len(vals)) for day, vals in sorted(buckets.items())]


def _column_from_surface(concentration_ugm3: float) -> float:
    """Approximate tropospheric column (molec/cm²) from a surface concentration."""
    mol_per_m3 = (concentration_ugm3 * 1e-6) / NO2_MOLAR_MASS_G
    molecules_per_m2 = mol_per_m3 * AVOGADRO * PROXY_MIXING_HEIGHT_M
    return molecules_per_m2 / 1e4


def _unavailable(reason: str) -> Dict[str, Any]:
    return {
        "satellite_no2_available": False,
        "satellite_no2_zscore": 0.0,
        "column_molec_cm2": None,
        "column_display": "Unavailable",
        "baseline_mean_molec_cm2": None,
        "observation_date": None,
        "source": "Copernicus Sentinel-5P TROPOMI",
        "is_direct_satellite_retrieval": False,
        "status_detail": reason,
    }


def _build_result(
    series: List[Tuple[str, float]],
    source: str,
    direct: bool,
    to_column: Any,
    status_detail: str,
) -> Optional[Dict[str, Any]]:
    if len(series) < 4:
        return None
    columns = [(day, to_column(value)) for day, value in series]
    observation_date, current = columns[-1]
    zscore, baseline_mean, _ = _zscore(current, [c for _, c in columns[:-1]][-BASELINE_DAYS:])
    return {
        "satellite_no2_available": True,
        "satellite_no2_zscore": round(zscore, 2),
        "column_molec_cm2": current,
        "column_display": format_column(current),
        "baseline_mean_molec_cm2": baseline_mean,
        "observation_date": observation_date,
        "source": source,
        "is_direct_satellite_retrieval": direct,
        "status_detail": status_detail,
    }


def format_column(column_molec_cm2: Optional[float]) -> str:
    """Human readable column density, e.g. '1.8 × 10¹⁵ molec/cm²'."""
    if not column_molec_cm2 or column_molec_cm2 <= 0:
        return "Unavailable"
    exponent = int(math.floor(math.log10(column_molec_cm2)))
    mantissa = column_molec_cm2 / (10 ** exponent)
    superscripts = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")
    return f"{mantissa:.1f} × 10{str(exponent).translate(superscripts)} molec/cm²"


def get_tropospheric_no2(lat: float, lon: float, days: int = BASELINE_DAYS) -> Dict[str, Any]:
    """Latest tropospheric NO2 column for a coordinate plus its z-score against a trailing baseline."""
    cache_key = f"{round(lat, 2)}:{round(lon, 2)}:{days}"
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    result: Optional[Dict[str, Any]] = None
    if settings.SENTINEL_HUB_CLIENT_ID and settings.SENTINEL_HUB_CLIENT_SECRET:
        try:
            result = _build_result(
                _fetch_sentinel5p_series(lat, lon, days),
                source="Copernicus Sentinel-5P TROPOMI (Sentinel Hub Statistical API)",
                direct=True,
                to_column=lambda mol_per_m2: mol_per_m2 * AVOGADRO / 1e4,
                status_detail="Direct TROPOMI L2 tropospheric NO2 column retrieval.",
            )
            if result is None:
                logger.warning("Sentinel-5P returned too few valid days for %s,%s; falling back to CAMS.", lat, lon)
        except Exception as exc:
            logger.warning("Sentinel Hub NO2 retrieval failed for %s,%s: %s", lat, lon, exc)
    else:
        logger.info("SENTINEL_HUB_CLIENT_ID/SECRET not configured; using CAMS surface NO2 proxy.")

    if result is None:
        try:
            result = _build_result(
                _fetch_cams_surface_series(lat, lon, days),
                source="CAMS surface NO2 via Open-Meteo (estimated column)",
                direct=False,
                to_column=_column_from_surface,
                status_detail=(
                    "Estimated column derived from CAMS surface NO2 with a "
                    f"{PROXY_MIXING_HEIGHT_M:.0f} m effective mixing height; configure Sentinel Hub "
                    "credentials for direct TROPOMI retrievals."
                ),
            )
        except Exception as exc:
            logger.warning("CAMS NO2 fallback failed for %s,%s: %s", lat, lon, exc)

    if result is None:
        result = _unavailable("No NO2 observations available for this coordinate.")

    _cache[cache_key] = (time.time(), result)
    return result
