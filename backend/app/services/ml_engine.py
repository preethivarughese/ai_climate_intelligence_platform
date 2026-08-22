import numpy as np
from sklearn.ensemble import RandomForestRegressor
from typing import List, Dict, Any
from datetime import datetime, timedelta

class AirQualityMLEngine:
    def __init__(self):
        self.model_version = "v1.4.2-RF-Explainable"
        self.model = RandomForestRegressor(n_estimators=60, max_depth=6, random_state=42)
        self._train_baseline_model()

    def _train_baseline_model(self):
        np.random.seed(42)
        X, y = [], []
        for _ in range(600):
            hr = np.random.randint(0, 24)
            temp = 20 + 12 * np.sin((hr - 6) / 24 * 2 * np.pi) + np.random.normal(0, 2)
            hum = 70 - 25 * np.sin((hr - 6) / 24 * 2 * np.pi) + np.random.normal(0, 5)
            wind = np.random.uniform(3, 18)
            diurnal_factor = 1.3 if (8 <= hr <= 11 or 19 <= hr <= 23) else 0.8
            base_pm = np.random.uniform(40, 180)
            prev_pm = base_pm * diurnal_factor
            rolling_pm = prev_pm + np.random.normal(0, 10)
            target = max(15.0, prev_pm * 0.7 + (rolling_pm * 0.3) - (wind * 2.2) + (hum * 0.2) + np.random.normal(0, 12))
            X.append([prev_pm, rolling_pm, hr, temp, hum, wind])
            y.append(target)
        self.model.fit(np.array(X), np.array(y))

    def forecast_next_hours(self, current_pm25: float, current_temp: float, current_hum: float, current_wind: float, hours_ahead: int = 8) -> List[Dict[str, Any]]:
        now = datetime.now()
        results, running_pm, running_rolling = [], current_pm25, current_pm25
        for i in range(1, hours_ahead + 1):
            future_time = now + timedelta(hours=i)
            hr = future_time.hour
            temp = current_temp + (2 if 10 <= hr <= 16 else -2)
            hum = min(98, max(20, current_hum + (-5 if 10 <= hr <= 16 else 8)))
            wind = max(2.0, current_wind + np.random.normal(0, 1))
            features = np.array([[running_pm, running_rolling, hr, temp, hum, wind]])
            
            tree_preds = np.array([tree.predict(features)[0] for tree in self.model.estimators_])
            pred_val = float(np.mean(tree_preds))
            lower_bound = float(np.percentile(tree_preds, 10))
            upper_bound = float(np.percentile(tree_preds, 90))
            conf = float(np.clip(1.0 - (np.std(tree_preds) / (pred_val + 1e-4)), 0.65, 0.95))
            
            risk = "Severe Spike" if pred_val > 250 else ("Unhealthy" if pred_val > 150 else ("Moderate" if pred_val > 90 else "Good"))
            plain = "Air will be thick with smoke and dust." if pred_val > 250 else ("Air quality will worsen." if pred_val > 150 else "Air quality is expected to remain acceptable.")
            
            results.append({
                "timestamp": future_time.strftime("%Y-%m-%d %H:%M"),
                "predicted_pm25": round(pred_val, 1),
                "lower_bound": round(lower_bound, 1),
                "upper_bound": round(upper_bound, 1),
                "confidence": round(conf, 2),
                "risk_level": risk,
                "plain_explanation": plain,
                "model_version": self.model_version
            })
            running_rolling = (running_rolling * 2 + pred_val) / 3
            running_pm = pred_val
        return results

    def detect_anomaly(self, current_pm25: float, historical_baseline_pm25: float) -> Dict[str, Any]:
        deviation = ((current_pm25 - historical_baseline_pm25) / historical_baseline_pm25) * 100.0
        return {
            "is_anomaly": deviation >= 35.0,
            "current_pm25": round(current_pm25, 1),
            "baseline_pm25": round(historical_baseline_pm25, 1),
            "deviation_percent": round(deviation, 1),
            "severity": "Critical Anomaly" if deviation >= 80 else ("Elevated Anomaly" if deviation >= 35 else "Normal"),
            "source": "CPCB 30-Day Rolling Baseline Model",
            "explanation": f"Current PM2.5 is {deviation:.1f}% relative to historical seasonal baseline."
        }

ml_engine = AirQualityMLEngine()
