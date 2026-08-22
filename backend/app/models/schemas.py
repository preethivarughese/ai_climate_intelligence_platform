from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class DataStatus(str, Enum):
    REAL = "REAL"
    SIMULATED_PROTOTYPE = "SIMULATED PROTOTYPE"
    UNAVAILABLE = "UNAVAILABLE"

class RegionStatus(str, Enum):
    NORMAL = "Normal"
    WATCH = "Watch"
    ELEVATED = "Elevated"
    CRITICAL = "Critical"

class EnvironmentalObservation(BaseModel):
    metric: str
    value: Optional[float]
    unit: str
    source: str
    timestamp: str
    status: DataStatus
    plain_language_meaning: str

class RegionSummary(BaseModel):
    id: str
    name: str
    state: str
    lat: float
    lon: float
    current_aqi: int
    risk_level: RegionStatus
    primary_pollutant: str
    active_events: int
    data_source: str
    last_updated: str
    status: DataStatus
    plain_summary: str

class ForecastPoint(BaseModel):
    timestamp: str
    predicted_pm25: float
    lower_bound: float
    upper_bound: float
    confidence: float
    risk_level: str
    plain_explanation: str
    model_version: str

class AnomalyResult(BaseModel):
    is_anomaly: bool
    current_pm25: float
    baseline_pm25: float
    deviation_percent: float
    severity: str
    source: str
    explanation: str

class ImageAnalysisResult(BaseModel):
    is_relevant: bool
    event_type: str
    visual_evidence: List[str]
    severity: str
    confidence: float
    possible_non_pollution_explanation: Optional[str] = None
    plain_description: str

class EvidenceSourceItem(BaseModel):
    name: str
    status: str
    confidence_contribution: float
    description: str
    raw_source: str
    data_status: DataStatus

class FusedHotspotEvent(BaseModel):
    event_id: str
    region_id: str
    location_name: str
    lat: float
    lon: float
    detection_time: str
    composite_confidence: float
    severity: str
    likely_event_type: str
    evidence_breakdown: List[EvidenceSourceItem]
    wind_direction_deg: float
    wind_speed_kmh: float
    downwind_impact_zones: List[str]
    simple_story: str
    plain_health_advice: str

class AuthorityRecommendationRequest(BaseModel):
    event_id: str
    location_name: str
    composite_confidence: float
    likely_event_type: str
    current_pm25: float
    predicted_pm25_next_4h: float
    wind_direction_deg: float
    wind_speed_kmh: float
    downwind_zones: List[str]
    language: str = "en"

class AuthorityRecommendationResponse(BaseModel):
    event_id: str
    summary: str
    urgency: str
    recommended_actions: List[str]
    potential_area_to_inspect: str
    generated_at: str
    language: str
    is_attribution_definitive: bool = False
    disclaimer: str

class AuthorityFeedbackRequest(BaseModel):
    event_id: str
    decision: str
    notes: Optional[str] = None
    officer_id: Optional[str] = "Gov_Duty_Officer_01"

class FederatedNodeStatus(BaseModel):
    node_id: str
    region_name: str
    local_samples: int
    local_model_version: str
    mean_absolute_error: float
    last_trained: str
    status: str

class FederatedAggregationResponse(BaseModel):
    global_model_version: str
    participating_nodes: List[str]
    total_samples_aggregated: int
    weighted_mae: float
    status: str
    timestamp: str
