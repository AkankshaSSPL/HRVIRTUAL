from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = "Agentic HRMS"
    app_version: str = "0.1.0"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+psycopg://hrms:hrms@localhost:5432/hrms",
        validation_alias="DATABASE_URL",
    )

    jwt_secret_key: str = Field(default="change-me-before-production", validation_alias="JWT_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = Field(default=7, validation_alias="REFRESH_TOKEN_EXPIRE_DAYS")

    admin_email: str = Field(default="admin@example.com", validation_alias="ADMIN_EMAIL")
    admin_password: str = Field(default="ChangeMe123!", validation_alias="ADMIN_PASSWORD")
    admin_name: str = Field(default="Super Admin", validation_alias="ADMIN_NAME")

    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_intent_model: str = Field(default="gpt-4o-mini", validation_alias="OPENAI_INTENT_MODEL")
    openai_intent_enabled: bool = Field(default=True, validation_alias="OPENAI_INTENT_ENABLED")
    intent_confidence_threshold: float = Field(default=0.55, validation_alias="INTENT_CONFIDENCE_THRESHOLD")
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    resume_storage_dir: str = Field(default="storage/resumes", validation_alias="RESUME_STORAGE_DIR")
    max_resume_upload_mb: int = Field(default=10, validation_alias="MAX_RESUME_UPLOAD_MB")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
