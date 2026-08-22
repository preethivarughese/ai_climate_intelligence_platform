from typing import List, Dict, Any
from datetime import datetime
from ..models.schemas import FederatedNodeStatus, FederatedAggregationResponse

class FederatedCoordinator:
    """
    Simulates decentralized, privacy-preserving Federated Averaging (FedAvg).
    Raw sensor readings and citizen data remain local to state nodes.
    Only model gradient weights and evaluation metrics are aggregated.
    """
    def __init__(self):
        self.nodes: Dict[str, Dict[str, Any]] = {
            "node_delhi": {
                "node_id": "node_delhi",
                "region_name": "Delhi NCR",
                "focus": "Inversion Smog & Industrial Exhaust",
                "local_samples": 5120,
                "local_model_version": "v1.4.1-delhi",
                "mean_absolute_error": 13.8,
                "local_accuracy": 89.1,
                "last_trained": "2026-08-21 08:30 IST",
                "status": "ONLINE - PRIVACY PRESERVED"
            },
            "node_karnataka": {
                "node_id": "node_karnataka",
                "region_name": "Karnataka (Bengaluru)",
                "focus": "Urban Traffic & Construction Dust",
                "local_samples": 2450,
                "local_model_version": "v1.4.1-kar",
                "mean_absolute_error": 6.8,
                "local_accuracy": 92.4,
                "last_trained": "2026-08-21 09:15 IST",
                "status": "ONLINE - PRIVACY PRESERVED"
            },
            "node_punjab": {
                "node_id": "node_punjab",
                "region_name": "Punjab Agro-Corridor",
                "focus": "Stubble & Biomass Burning Corridors",
                "local_samples": 3890,
                "local_model_version": "v1.4.1-pun",
                "mean_absolute_error": 17.5,
                "local_accuracy": 91.2,
                "last_trained": "2026-08-21 07:45 IST",
                "status": "ONLINE - PRIVACY PRESERVED"
            }
        }
        self.global_version = "v1.4.3-FedAvg-Global"

    def get_nodes(self) -> List[FederatedNodeStatus]:
        return [FederatedNodeStatus(**d) for d in self.nodes.values()]

    def run_federated_aggregation(self) -> FederatedAggregationResponse:
        total_samples = sum(n["local_samples"] for n in self.nodes.values())
        
        # Weighted FedAvg aggregation
        weighted_mae = sum(
            n["mean_absolute_error"] * n["local_samples"] for n in self.nodes.values()
        ) / total_samples

        # Advance global model version upon aggregation
        self.global_version = "v1.4.4-FedAvg-Global"
        
        # Sync updated weights to all local regional nodes
        for nid in self.nodes:
            self.nodes[nid]["local_model_version"] = self.global_version
            self.nodes[nid]["mean_absolute_error"] = round(weighted_mae * 0.96, 2)  # Shared generalization gain
            self.nodes[nid]["last_trained"] = datetime.now().strftime("%Y-%m-%d %H:%M IST")

        return FederatedAggregationResponse(
            global_model_version=self.global_version,
            participating_nodes=[n["region_name"] for n in self.nodes.values()],
            total_samples_aggregated=total_samples,
            weighted_mae=round(weighted_mae, 2),
            status="SUCCESS: Multi-state model weights synchronized without exposing raw local telemetry.",
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M IST")
        )

federated_coordinator = FederatedCoordinator()