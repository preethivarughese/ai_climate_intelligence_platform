"""Federated learning across state nodes.

Each node trains a ridge regressor on its own local hourly history (plus any citizen sensor
readings submitted in its area) and publishes only a `ModelUpdate` — coefficients, intercept,
sample count and local error. The coordinator never receives raw observations; it performs
FedAvg by sample-weighted averaging of those coefficients and evaluates the resulting global
model back on each node's local holdout.

A node whose local data cannot be fetched is reported as OFFLINE and excluded from the round
rather than contributing placeholder metrics.
"""

import logging
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.linear_model import Ridge

from . import store
from .observations import FEATURE_NAMES, build_supervised_frame, fetch_hourly_history

logger = logging.getLogger(__name__)

TRAINING_DAYS = 30
HOLDOUT_FRACTION = 0.2


@dataclass
class ModelUpdate:
    """The only artefact a node shares with the coordinator."""

    node_id: str
    coefficients: List[float]
    intercept: float
    n_samples: int
    local_mae: float


@dataclass
class NodeDefinition:
    node_id: str
    region_name: str
    focus: str
    lat: float
    lon: float


NODE_DEFINITIONS = [
    NodeDefinition("node_delhi", "Delhi NCR", "Inversion Smog & Industrial Exhaust", 28.6139, 77.2090),
    NodeDefinition("node_karnataka", "Karnataka (Bengaluru)", "Urban Traffic & Construction Dust", 12.9716, 77.5946),
    NodeDefinition("node_punjab", "Punjab Agro-Corridor", "Stubble & Biomass Burning Corridors", 30.9010, 75.8573),
]


class LocalNode:
    """A state-level participant. Its raw data never leaves this object."""

    def __init__(self, definition: NodeDefinition):
        self.definition = definition
        self.local_mae: Optional[float] = None
        self.global_mae: Optional[float] = None
        self.n_samples = 0
        self.model_version = "untrained"
        self.last_trained: Optional[str] = None
        self.status = "PENDING FIRST ROUND"
        self._holdout: Optional[Tuple[np.ndarray, np.ndarray]] = None

    def _load_local_data(self) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        try:
            rows = fetch_hourly_history(self.definition.lat, self.definition.lon, TRAINING_DAYS)
        except Exception as exc:
            logger.warning("Node %s could not load local history: %s", self.definition.node_id, exc)
            return None

        features, targets = build_supervised_frame(rows)
        features, targets = self._augment_with_citizen_readings(features, targets, rows)
        if len(features) < 48:
            return None
        return np.array(features), np.array(targets)

    def _augment_with_citizen_readings(
        self,
        features: List[List[float]],
        targets: List[float],
        rows: List[Dict[str, Any]],
    ) -> Tuple[List[List[float]], List[float]]:
        """Fold locally submitted citizen sensor readings into this node's training set."""
        if not rows:
            return features, targets

        readings = store.recent_sensor_readings(self.definition.lat, self.definition.lon, radius_km=60.0, hours=24 * 7)
        if not readings:
            return features, targets

        latest = rows[-1]
        for reading in readings:
            hour = int(reading["recorded_at"][11:13]) if len(reading["recorded_at"]) > 12 else latest["hour_of_day"]
            features.append(
                [
                    reading["pm25"],
                    reading["pm25"],
                    float(hour),
                    reading.get("temperature_c") if reading.get("temperature_c") is not None else latest["temperature_c"],
                    reading.get("humidity_pct") if reading.get("humidity_pct") is not None else latest["humidity_pct"],
                    latest["wind_speed_kmh"],
                ]
            )
            targets.append(reading["pm25"])
        logger.info("Node %s folded in %d citizen sensor readings", self.definition.node_id, len(readings))
        return features, targets

    def train_local(self) -> Optional[ModelUpdate]:
        data = self._load_local_data()
        if data is None:
            self.status = "OFFLINE - LOCAL DATA UNAVAILABLE"
            self._holdout = None
            return None

        x, y = data
        split = max(1, int(len(x) * (1 - HOLDOUT_FRACTION)))
        model = Ridge(alpha=1.0)
        model.fit(x[:split], y[:split])

        x_holdout, y_holdout = x[split:], y[split:]
        self._holdout = (x_holdout, y_holdout) if len(x_holdout) else None
        self.local_mae = (
            round(float(np.mean(np.abs(model.predict(x_holdout) - y_holdout))), 2) if self._holdout else 0.0
        )
        self.n_samples = int(split)
        self.last_trained = datetime.now().strftime("%Y-%m-%d %H:%M")
        self.status = "ONLINE - PRIVACY PRESERVED"

        return ModelUpdate(
            node_id=self.definition.node_id,
            coefficients=[float(c) for c in model.coef_],
            intercept=float(model.intercept_),
            n_samples=self.n_samples,
            local_mae=self.local_mae or 0.0,
        )

    def evaluate_global(self, coefficients: np.ndarray, intercept: float, version: str) -> None:
        """Score the aggregated model against this node's private holdout."""
        if self._holdout is None:
            return
        x_holdout, y_holdout = self._holdout
        predictions = x_holdout @ coefficients + intercept
        self.global_mae = round(float(np.mean(np.abs(predictions - y_holdout))), 2)
        self.model_version = version

    def snapshot(self) -> Dict[str, Any]:
        return {
            "node_id": self.definition.node_id,
            "region_name": self.definition.region_name,
            "focus": self.definition.focus,
            "local_samples": self.n_samples,
            "local_model_version": self.model_version,
            "local_mae": self.local_mae,
            "mean_absolute_error": self.global_mae if self.global_mae is not None else (self.local_mae or 0.0),
            "global_mae": self.global_mae,
            "last_trained": self.last_trained,
            "status": self.status,
        }


class FederatedCoordinator:
    """Runs FedAvg rounds over the state nodes and keeps the aggregated model."""

    def __init__(self):
        self.nodes: Dict[str, LocalNode] = {d.node_id: LocalNode(d) for d in NODE_DEFINITIONS}
        self.global_coefficients: Optional[np.ndarray] = None
        self.global_intercept: float = 0.0
        self.feature_names = FEATURE_NAMES
        self._lock = threading.Lock()

    @property
    def round_number(self) -> int:
        return store.federated_round_count()

    @property
    def global_model_version(self) -> str:
        return f"v2.0-FedAvg-r{self.round_number}"

    def get_nodes(self) -> List[Dict[str, Any]]:
        return [node.snapshot() for node in self.nodes.values()]

    def predict(self, features: List[float]) -> Optional[float]:
        """Next-hour PM2.5 from the aggregated model, or None before the first round."""
        if self.global_coefficients is None:
            return None
        return float(np.array(features) @ self.global_coefficients + self.global_intercept)

    def run_federated_aggregation(self) -> Dict[str, Any]:
        with self._lock:
            updates = [update for update in (node.train_local() for node in self.nodes.values()) if update]

            if not updates:
                return {
                    "global_model_version": self.global_model_version,
                    "participating_nodes": [],
                    "total_samples_aggregated": 0,
                    "weighted_mae": 0.0,
                    "global_mae": 0.0,
                    "round_number": self.round_number,
                    "nodes": self.get_nodes(),
                    "feature_names": self.feature_names,
                    "status": "FAILED: no node could load its local training data; nothing was aggregated.",
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
                }

            total_samples = sum(update.n_samples for update in updates)
            coefficient_matrix = np.array([update.coefficients for update in updates])
            weights = np.array([update.n_samples for update in updates], dtype=float) / total_samples

            self.global_coefficients = coefficient_matrix.T @ weights
            self.global_intercept = float(sum(u.intercept * w for u, w in zip(updates, weights)))
            weighted_local_mae = float(sum(u.local_mae * w for u, w in zip(updates, weights)))

            version = f"v2.0-FedAvg-r{self.round_number + 1}"
            for update in updates:
                self.nodes[update.node_id].evaluate_global(self.global_coefficients, self.global_intercept, version)

            global_maes = [n.global_mae for n in self.nodes.values() if n.global_mae is not None]
            global_mae = round(float(np.mean(global_maes)), 2) if global_maes else 0.0

            result = {
                "global_model_version": version,
                "participating_nodes": [self.nodes[u.node_id].definition.region_name for u in updates],
                "total_samples_aggregated": total_samples,
                "weighted_mae": round(weighted_local_mae, 2),
                "global_mae": global_mae,
                "nodes": self.get_nodes(),
                "feature_names": self.feature_names,
                "global_coefficients": [round(float(c), 4) for c in self.global_coefficients],
                "global_intercept": round(self.global_intercept, 4),
                "status": (
                    f"SUCCESS: {len(updates)} node update(s) averaged over {total_samples} local samples "
                    "without any raw telemetry leaving a node."
                ),
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
            }
            store.save_federated_round(result)
            result["round_number"] = self.round_number
            return result

    def status(self) -> Dict[str, Any]:
        last_round = store.last_federated_round()
        return {
            "global_model_version": self.global_model_version,
            "round_number": self.round_number,
            "is_aggregated": self.global_coefficients is not None,
            "feature_names": self.feature_names,
            "nodes": self.get_nodes(),
            "last_round_completed_at": last_round["completed_at"] if last_round else None,
            "last_round_global_mae": last_round["global_mae"] if last_round else None,
        }


federated_coordinator = FederatedCoordinator()
