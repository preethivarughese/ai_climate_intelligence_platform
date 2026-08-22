"""Gemini Vision API integration for pollution image analysis."""

import base64
import json
from typing import Optional, Dict, Any
from google import genai
from google.genai import types

from ..core.config import settings


class GeminiImageAnalyzer:
    """Analyze images for pollution indicators using Gemini Vision."""

    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model = "gemini-2.0-flash"

    def analyze_pollution_image(self, image_base64: str) -> Dict[str, Any]:
        """
        Analyze an image for pollution indicators.
        
        Args:
            image_base64: Base64-encoded image data
            
        Returns:
            Dict with analysis results including:
            - is_valid: Whether the image shows pollution
            - pollution_type: Type of pollution detected
            - confidence: Confidence score (0-1)
            - indicators: Specific visual indicators
            - recommendations: Health/action recommendations
        """
        try:
            # Prepare the image part
            image_part = types.Part.from_data(
                mime_type="image/jpeg",
                data=base64.b64decode(image_base64)
            )

            # Create analysis prompt
            prompt = """Analyze this image for air pollution indicators. Provide a structured assessment with:

1. **Is Valid**: Determine if the image shows actual pollution (smoke, dust, haze, etc.) vs unrelated content.
2. **Pollution Type**: Classify the type if visible (e.g., industrial smoke, dust storm, vehicle emissions, agricultural burning, etc.)
3. **Confidence**: Your confidence level (0.0-1.0) that this is genuine pollution.
4. **Visual Indicators**: List specific visual markers (e.g., visible smoke plumes, dust clouds, haze density, discolored sky).
5. **Severity Level**: Estimate severity as 'low' (light haze), 'medium' (visible haze), 'high' (strong signs), or 'critical' (emergency).
6. **Estimated PM2.5 Range**: Rough estimate of potential PM2.5 levels (low: <50, medium: 50-150, high: 150-300, critical: >300).
7. **Recommendations**: Immediate health/action recommendations.

Respond in JSON format:
{
    "is_valid": boolean,
    "pollution_type": string or null,
    "confidence": number,
    "visual_indicators": [list of indicators],
    "severity": "low|medium|high|critical|unknown",
    "pm25_range": {"min": number, "max": number},
    "recommendations": [list of recommendations],
    "explanation": "brief explanation of analysis"
}"""

            # Call Gemini API
            response = self.client.models.generate_content(
                model=self.model,
                contents=[image_part, prompt]
            )

            # Parse response
            response_text = response.text.strip()
            
            # Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()

            result = json.loads(response_text)
            return result

        except json.JSONDecodeError as e:
            return {
                "is_valid": False,
                "pollution_type": None,
                "confidence": 0.0,
                "visual_indicators": [],
                "severity": "unknown",
                "pm25_range": {"min": 0, "max": 0},
                "recommendations": ["Image analysis error: Could not parse response"],
                "explanation": f"JSON parsing error: {str(e)}"
            }
        except Exception as e:
            return {
                "is_valid": False,
                "pollution_type": None,
                "confidence": 0.0,
                "visual_indicators": [],
                "severity": "unknown",
                "pm25_range": {"min": 0, "max": 0},
                "recommendations": ["Image analysis failed"],
                "explanation": f"Error: {str(e)}"
            }

    def analyze_pollution_report(self, 
                                description: str, 
                                location: str,
                                image_base64: Optional[str] = None) -> Dict[str, Any]:
        """
        Comprehensive analysis combining text description and optional image.
        
        Args:
            description: Citizen's written description
            location: Location of the pollution event
            image_base64: Optional base64-encoded image
            
        Returns:
            Dict with combined analysis results
        """
        try:
            parts = []
            
            if image_base64:
                # Add image if provided
                image_part = types.Part.from_data(
                    mime_type="image/jpeg",
                    data=base64.b64decode(image_base64)
                )
                parts.append(image_part)
            
            # Create comprehensive analysis prompt
            prompt = f"""As an air quality expert, analyze this pollution report and provide actionable insights:

Location: {location}
Description: {description}
{'[Image attached for visual confirmation]' if image_base64 else '[No image provided]'}

Provide a structured assessment:
1. **Event Type**: Classify the pollution event (industrial, vehicular, agricultural burning, dust storm, etc.)
2. **Affected Areas**: Estimate the spatial extent and downwind impact zones
3. **Affected Population**: Estimate number of people potentially affected
4. **Health Risk Level**: Rate risk level (low/medium/high/critical)
5. **Recommendations**: Specific action items for authorities
6. **Monitoring Priority**: Should this be prioritized for satellite monitoring?
7. **Predicted Duration**: Estimated duration of the pollution event

Respond in JSON format:
{{
    "event_type": string,
    "affected_areas": [list of areas],
    "estimated_affected_population": number,
    "health_risk_level": "low|medium|high|critical",
    "authority_recommendations": [list of actions],
    "monitoring_priority": boolean,
    "predicted_duration_hours": number,
    "confidence_score": number,
    "additional_notes": string
}}"""

            parts.append(prompt)

            # Call Gemini API
            response = self.client.models.generate_content(
                model=self.model,
                contents=parts
            )

            # Parse response
            response_text = response.text.strip()
            
            # Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()

            result = json.loads(response_text)
            return result

        except Exception as e:
            return {
                "event_type": "unknown",
                "affected_areas": [],
                "estimated_affected_population": 0,
                "health_risk_level": "unknown",
                "authority_recommendations": ["Analysis failed"],
                "monitoring_priority": False,
                "predicted_duration_hours": 0,
                "confidence_score": 0.0,
                "additional_notes": f"Error: {str(e)}"
            }


# Singleton instance
_analyzer: Optional[GeminiImageAnalyzer] = None


def get_analyzer() -> GeminiImageAnalyzer:
    """Get or create the Gemini analyzer instance."""
    global _analyzer
    if _analyzer is None:
        _analyzer = GeminiImageAnalyzer()
    return _analyzer
