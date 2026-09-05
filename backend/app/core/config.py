import os
from pathlib import Path

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Climate Intelligence Platform (India)"
    API_V1_STR: str = "/api"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")
    WAQI_API_TOKEN: str = os.getenv("WAQI_API_TOKEN", "")
    SENTINEL_HUB_CLIENT_ID: str = os.getenv("SENTINEL_HUB_CLIENT_ID", "")
    SENTINEL_HUB_CLIENT_SECRET: str = os.getenv("SENTINEL_HUB_CLIENT_SECRET", "")
    SENTINEL_HUB_BASE_URL: str = os.getenv("SENTINEL_HUB_BASE_URL", "https://services.sentinel-hub.com")
    NASA_FIRMS_MAP_KEY: str = os.getenv("NASA_FIRMS_MAP_KEY", "")

    DATA_DB_PATH: str = os.getenv(
        "DATA_DB_PATH",
        str(Path(__file__).resolve().parents[3] / "data" / "platform.db")
    )

    ADMIN_ACCESS_TOKEN: str = os.getenv("ADMIN_ACCESS_TOKEN", "")

    ALERT_WEBHOOK_URL: str = os.getenv("ALERT_WEBHOOK_URL", "")
    ALERT_EMAIL_TO: str = os.getenv("ALERT_EMAIL_TO", "")
    ALERT_EMAIL_FROM: str = os.getenv("ALERT_EMAIL_FROM", "")
    ALERT_SMTP_HOST: str = os.getenv("ALERT_SMTP_HOST", "")
    ALERT_SMTP_PORT: int = int(os.getenv("ALERT_SMTP_PORT", "587"))
    ALERT_SMTP_USER: str = os.getenv("ALERT_SMTP_USER", "")
    ALERT_SMTP_PASSWORD: str = os.getenv("ALERT_SMTP_PASSWORD", "")
    ALERT_MIN_CONFIDENCE: float = float(os.getenv("ALERT_MIN_CONFIDENCE", "0.55"))
    ALERT_MIN_PM25: float = float(os.getenv("ALERT_MIN_PM25", "90"))
    ALERT_COOLDOWN_MINUTES: int = int(os.getenv("ALERT_COOLDOWN_MINUTES", "30"))

    CORS_ALLOW_ORIGINS: str = os.getenv("CORS_ALLOW_ORIGINS", "*")

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
