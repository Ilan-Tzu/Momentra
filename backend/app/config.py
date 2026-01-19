from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    DATABASE_URL: str
    OPENAI_API_KEY: str
    
    # Optional settings with defaults
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AI Calendar Backend"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # Ignore variables irrelevant to this model
    )

@lru_cache
def get_settings():
    return Settings()

settings = get_settings()
