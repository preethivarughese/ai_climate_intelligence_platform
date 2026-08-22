"""PM2.5 forecasting model.

The model is a RandomForest regressor trained on real hourly CAMS/ERA5 history pooled from
several Indian cities (see `observations`). Training happens lazily on first use and is
refreshed hourly; when the upstream archive is unreachable the engine falls back to a
synthetic diurnal training set and says so through `training_data_source`, so a forecast is
never silently presented as observation-trained when it is not.
"""

import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from .observations import fetch_supervised_frame

logger = logging.getLogger(__name__)

TRAINING_CITIES = [
    (28.6139, 77.2090),  # Delhi NCR
    (19.0760, 72.8777),  # Mumbai
    (22.5726, 88.3639),  # Kolkata
    (12.9716, 77.5946),  # Bengaluru
    (30.9010, 75.8573),  # Ludhiana
]
RETRAIN_INTERVAL_SECONDS = 3600
TRAINING_DAYS = 30


class AirQualityMLEngine:
    def __init__(self):
        self.model_version = "v2.0-RF-Observational"
        self.training_data_source = "untrained"
        self.training_samples = 0
        self.holdout_mae: Optional[float] = None
        self.trained_at: Optional[str] = None
        self.model: Optional[RandomForestRegressor] = None
        self._lock = threading.Lock()
        self._trained_at_monotonic = 0.0

    def ensure_trained(self, force: bool = False) -> None:
        with self._lock:
            fresh = self.model is not None and time.time() - self._trained_at_monotonic < RETRAIN_INTERVAL_SECONDS
            if fresh and not force:
                return

            features, targets, source = self._collect_training_data()
            model = RandomForestRegressor(n_estimators=80, max_depth=10, random_state=42, n_jobs=-1)

            x = np.array(features)
            y = np.array(targets)
            split = int(len(x) * 0.85)
            model.fit(x[:split], y[:split])
            self.holdout_mae = (
                round(float(np.mean(np.abs(model.predict(x[split:]) - y[split:]))), 2)
                if len(x) - split >= 10
                else None
            )

            model.fit(x, y)
            self.model = model
            self.training_samples = len(x)
            self.training_data_source = source
            self.trained_at = datetime.now().strftime("%Y-%m-%d %H:%M")
            self._trained_at_monotonic = time.time()
            logger.info(
                "Forecast model trained on %d samples from %s (holdout MAE %s)",
                self.training_samples,
                source,
                self.holdout_mae,
            )

    def _collect_training_data(self) -> Tuple[List[List[float]], List[float], str]:
        features: List[List[float]] = []
        targets: List[float] = []
        cities_used = 0
        for lat, lon in TRAINING_CITIES:
            frame = fetch_supervised_frame(lat, lon, TRAINING_DAYS)
            if frame is None:
                continue
            features.extend(frame[0])
            targets.extend(frame[1])
            cities_used += 1

        if cities_used:
            return features, targets, f"CAMS/ERA5 hourly observations, {cities_used} cities, {TRAINING_DAYS}d"

        logger.warning("No observational history available; training forecaster on synthetic diurnal data.")
        return (*self._synthetic_training_data(), "synthetic diurnal fallback (no upstream archive)")

    @staticmethod
    def _synthetic_training_data() -> Tuple[List[List[float]], List[float]]:
        rng = np.random.default_rng(42)
        features, targets = [], []
        for _ in range(600):
            hour = int(rng.integers(0, 24))
            temperature = 20 + 12 * np.sin((hour - 6) / 24 * 2 * np.pi) + rng.normal(0, 2)
            humidity = 70 - 25 * np.sin((hour - 6) / 24 * 2 * np.pi) + rng.normal(0, 5)
            wind = float(rng.uniform(3, 18))
            diurnal_factor = 1.3 if (8 <= hour <= 11 or 19 <= hour <= 23) else 0.8
            previous = float(rng.uniform(40, 180)) * diurnal_factor
            rolling = previous + rng.normal(0, 10)
            target = max(15.0, previous * 0.7 + rolling * 0.3 - wind * 2.2 + humidity * 0.2 + rng.normal(0, 12))
            features.append([previous, rolling, float(hour), float(temperature), float(humidity), wind])
            targets.append(float(target))
        return features, targets

    def forecast_next_hours(
        self,
        current_pm25: float,
        current_temp: float,
        current_hum: float,
        current_wind: float,
        hours_ahead: int = 8,
    ) -> List[Dict[str, Any]]:
        self.ensure_trained()
        assert self.model is not None

        now = datetime.now()
        results: List[Dict[str, Any]] = []
        running_pm = current_pm25
        running_rolling = current_pm25

        for step in range(1, hours_ahead + 1):
            future_time = now + timedelta(hours=step)
            hour = future_time.hour
            temperature = current_temp + (2 if 10 <= hour <= 16 else -2)
            humidity = min(98.0, max(20.0, current_hum + (-5 if 10 <= hour <= 16 else 8)))
            wind = max(2.0, current_wind)
            features = np.array([[running_pm, running_rolling, hour, temperature, humidity, wind]])

            tree_predictions = np.array([tree.predict(features)[0] for tree in self.model.estimators_])
            predicted = float(np.mean(tree_predictions))
            spread = float(np.std(tree_predictions))

            risk = (
                "Severe Spike" if predicted > 250
                else "Unhealthy" if predicted > 150
                else "Moderate" if predicted > 90
                else "Good"
            )
            explanation = (
                "Air will be thick with smoke and dust." if predicted > 250
                else "Air quality will worsen." if predicted > 150
                else "Air quality is expected to remain acceptable."
            )

            results.append(
                {
                    "timestamp": future_time.strftime("%Y-%m-%d %H:%M"),
                    "predicted_pm25": round(predicted, 1),
                    "lower_bound": round(float(np.percentile(tree_predictions, 10)), 1),
                    "upper_bound": round(float(np.percentile(tree_predictions, 90)), 1),
                    "confidence": round(float(np.clip(1.0 - spread / (predicted + 1e-4), 0.65, 0.95)), 2),
                    "risk_level": risk,
                    "plain_explanation": explanation,
                    "model_version": self.model_version,
                }
            )
            running_rolling = (running_rolling * 2 + predicted) / 3
            running_pm = predicted
        return results

    def detect_anomaly(self, current_pm25: float, historical_baseline_pm25: float) -> Dict[str, Any]:
        baseline = max(historical_baseline_pm25, 1.0)
        deviation = ((current_pm25 - baseline) / baseline) * 100.0
        return {
            "is_anomaly": deviation >= 35.0,
            "current_pm25": round(current_pm25, 1),
            "baseline_pm25": round(baseline, 1),
            "deviation_percent": round(deviation, 1),
            "severity": "Critical Anomaly" if deviation >= 80 else ("Elevated Anomaly" if deviation >= 35 else "Normal"),
            "source": "CPCB 30-Day Rolling Baseline Model",
            "explanation": f"Current PM2.5 is {deviation:.1f}% relative to historical seasonal baseline.",
        }

    def status(self) -> Dict[str, Any]:
        return {
            "model_version": self.model_version,
            "training_data_source": self.training_data_source,
            "training_samples": self.training_samples,
            "holdout_mae_ugm3": self.holdout_mae,
            "trained_at": self.trained_at,
            "is_observation_trained": self.training_data_source.startswith("CAMS"),
        }


ml_engine = AirQualityMLEngine()
