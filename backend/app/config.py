from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    # Core Secrets (Required)
    DATABASE_URL: str
    OPENAI_API_KEY: str
    
    # Environment
    ENVIRONMENT: str = "development" # development, production, test
    
    # Security & Networking
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AI Calendar Backend"
    ENFORCE_HTTPS: bool = False
    ALLOWED_HOSTS: list[str] = ["localhost", "127.0.0.1", "0.0.0.0"]
    
    # Google Auth (Required for login)
    GOOGLE_CLIENT_ID: str = ""
    
    model_config = SettingsConfigDict(
        # In production, we prefer environment variables over .env files
        env_file=".env" if ENVIRONMENT == "development" else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def get_safe_settings(self) -> dict:
        """Returns a dict of settings with sensitive values redacted."""
        data = self.model_dump()
        secrets = ["OPENAI_API_KEY", "DATABASE_URL"]
        for secret in secrets:
            if data.get(secret):
                val = data[secret]
                if len(val) > 8:
                    data[secret] = f"{val[:4]}...{val[-4:]}"
                else:
                    data[secret] = "********"
        return data

@lru_cache
def get_settings():
    return Settings()

settings = get_settings()

# Security sanity check
if settings.is_production() and not settings.ENFORCE_HTTPS:
    import warnings
    warnings.warn("SECURITY WARNING: Running in production mode without ENFORCE_HTTPS=True")
