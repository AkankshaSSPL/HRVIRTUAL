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
    # --- SMTP settings ---
    smtp_host: str = Field(default="smtp.gmail.com", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_password: str = Field(default="", validation_alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="", validation_alias="SMTP_FROM")
    email_enabled: bool = Field(default=True, validation_alias="EMAIL_ENABLED")
    # --- Face authentication ---
    face_models_dir: str = Field(default="data/face_models", validation_alias="FACE_MODELS_DIR")
    face_distance_threshold: float = Field(default=1.4, validation_alias="FACE_DISTANCE_THRESHOLD")
    # --- Employee activation / invite links (NEW) ---
    frontend_url: str = Field(default="http://localhost:5173", validation_alias="FRONTEND_URL")
    activation_token_expire_hours: int = Field(default=72, validation_alias="ACTIVATION_TOKEN_EXPIRE_HOURS")
    # --- Knowledge base RAG ---
    knowledge_answer_model: str = Field(default="gpt-4o-mini", validation_alias="KNOWLEDGE_ANSWER_MODEL")
    knowledge_top_k: int = Field(default=5, validation_alias="KNOWLEDGE_TOP_K")
    knowledge_candidate_k: int = Field(default=25, validation_alias="KNOWLEDGE_CANDIDATE_K")
    knowledge_chunk_size: int = Field(default=800, validation_alias="KNOWLEDGE_CHUNK_SIZE")
    knowledge_chunk_overlap: int = Field(default=150, validation_alias="KNOWLEDGE_CHUNK_OVERLAP")
    knowledge_query_expansion: bool = Field(default=True, validation_alias="KNOWLEDGE_QUERY_EXPANSION")
    knowledge_bm25_rerank: bool = Field(default=False, validation_alias="KNOWLEDGE_BM25_RERANK")
@lru_cache
def get_settings() -> Settings:
    return Settings()
settings = get_settings()