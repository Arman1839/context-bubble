from typing import List, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=["backend/.env", ".env"],
        env_file_encoding="utf-8",
        extra="ignore"
    )

    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

    # Google Cloud & Firebase
    GOOGLE_CLOUD_PROJECT: str = "context-bubble-dev"
    FIRESTORE_DATABASE: str = "(default)"
    FIRESTORE_EMULATOR_HOST: str | None = None
    FIREBASE_STORAGE_EMULATOR_HOST: str | None = None
    FIREBASE_AUTH_EMULATOR_HOST: str | None = None
    GCS_BUCKET_NAME: str = "context-bubble-artifacts"
    CLOUD_TASKS_QUEUE_PATH: str = "projects/context-bubble-dev/locations/us-central1/queues/bubble-timers"
    CLOUD_TASKS_HANDLER_URL: str = "http://localhost:8000/api/v1/pop/tasks/execute"

    # LLM Settings
    LLM_PROVIDER: Literal["gemini", "anthropic"] = "gemini"
    GEMINI_API_KEY: str = Field(default="", description="Google Gemini API key")
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic Claude API key")
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"

    # Security & Verification
    FIREBASE_APP_CHECK_ENFORCE: bool = False
    SERVER_INTERNAL_SECRET: str = "dev-internal-secret-for-cloud-tasks-and-schedulers"

    # Bubble Constraints & Debouncing
    BUBBLE_MAX_PARTICIPANTS: int = 10
    BUBBLE_DEFAULT_TOKEN_BUDGET: int = 250000
    DEBOUNCE_TRAILING_SECONDS: float = 3.0
    DEBOUNCE_MAX_WAIT_SECONDS: float = 10.0
    RATE_LIMIT_PER_USER_RPM: int = 30
    AI_QUIET_PERIOD_SECONDS: float = 2.5


settings = Settings()
