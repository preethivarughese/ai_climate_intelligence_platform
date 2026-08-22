import json
from typing import Dict, Any
from ..core.config import settings

class GeminiClimateService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY

    def analyze_pollution_image(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
        return {
            "is_relevant": True,
            "event_type": "open_waste_burning",
            "visual_evidence": ["Visible dark smoke plume rising from ground level", "Combustion pile visible"],
            "severity": "high",
            "confidence": 0.88,
            "possible_non_pollution_explanation": None,
            "plain_description": "Roadside waste combustion detected, emitting localized toxic particulate smoke."
        }

    def generate_authority_recommendation(self, location_name: str, likely_event_type: str, composite_confidence: float, current_pm25: float, predicted_pm25_next_4h: float, wind_direction_deg: float, wind_speed_kmh: float, downwind_zones: list, language: str = "en") -> Dict[str, Any]:
        if language == "hi":
            return {
                "summary": f"{location_name} में {likely_event_type} के कारण वायु प्रदूषण का गंभीर खतरा। {', '.join(downwind_zones)} की ओर धुआं फैलने की संभावना।",
                "urgency": "high",
                "recommended_actions": [
                    "प्रभावित क्षेत्र में तुरंत स्थानीय नगर निगम निरीक्षण दल भेजें।",
                    f"हवा की दिशा वाले क्षेत्रों ({', '.join(downwind_zones)}) में पानी के छिड़काव का निर्देश दें।",
                    "संवेदनशील नागरिकों के लिए इनडोर रहने का परामर्श जारी करें।"
                ],
                "potential_area_to_inspect": f"{location_name} का 2 किमी दायरा"
            }
        elif language == "kn":
            return {
                "summary": f"{location_name} ವ್ಯಾಪ್ತಿಯಲ್ಲಿ {likely_event_type} ಕಾರಣದಿಂದ ವಾಯುಮಾಲಿನ್ಯದ ತೀವ್ರ ಹೆಚ್ಚಳ ಕಂಡುಬಂದಿದೆ. {', '.join(downwind_zones)} ಪ್ರದೇಶಗಳಿಗೂ ಹರಡುವ ಸಾಧ್ಯತೆ ಇದೆ.",
                "urgency": "high",
                "recommended_actions": [
                    "ತಕ್ಷಣವೇ ಸ್ಥಳೀಯ ಮಾಲಿನ್ಯ ನಿಯಂತ್ರಣ ಪರಿಶೀಲನಾ ತಂಡವನ್ನು ಸ್ಥಳಕ್ಕೆ ರವಾನಿಸಿ.",
                    f"ಗಾಳಿ ಬೀಸುವ ದಿಕ್ಕಿನ ಪ್ರದೇಶಗಳಲ್ಲಿ ({', '.join(downwind_zones)}) ನೀರಿನ ಸಿಂಪಡಣೆ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ.",
                    "ಸಾರ್ವಜನಿಕ ಆರೋಗ್ಯ ಎಚ್ಚರಿಕೆ ರವಾನಿಸಿ."
                ],
                "potential_area_to_inspect": f"{location_name} ಸುತ್ತಮುತ್ತಲಿನ 2 ಕಿ.ಮೀ ಪ್ರದೇಶ"
            }
        else:
            return {
                "summary": f"Elevated pollution alert at {location_name} triggered by suspected {likely_event_type}. Telemetry indicates PM2.5 at {current_pm25} µg/m³ drifting toward {', '.join(downwind_zones)}.",
                "urgency": "high",
                "recommended_actions": [
                    "Deploy municipal flying squad to verify and halt unauthorized open burning or emissions.",
                    f"Mobilize anti-smog mist cannons along the downwind trajectory corridor: {', '.join(downwind_zones)}.",
                    "Issue localized public health advisory recommending masks and restricted outdoor activities."
                ],
                "potential_area_to_inspect": f"Within 2.0 km radius of {location_name}"
            }

gemini_service = GeminiClimateService()
