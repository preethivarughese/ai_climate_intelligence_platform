import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Climate Intelligence Platform (India)"
    API_V1_STR: str = "/api"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    WAQI_API_TOKEN: str = os.getenv("WAQI_API_TOKEN", "")
    SENTINEL_HUB_CLIENT_ID: str = os.getenv("SENTINEL_HUB_CLIENT_ID", "")
    SENTINEL_HUB_CLIENT_SECRET: str = os.getenv("SENTINEL_HUB_CLIENT_SECRET", "")
    SENTINEL_HUB_BASE_URL: str = os.getenv("SENTINEL_HUB_BASE_URL", "https://services.sentinel-hub.com")

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
