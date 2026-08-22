import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Climate Intelligence Platform (India)"
    API_V1_STR: str = "/api"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    WAQI_API_TOKEN: str = os.getenv("WAQI_API_TOKEN", "")

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()