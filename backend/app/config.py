"""
OmniAid Backend — Application Settings
=======================================
Loaded via pydantic-settings from .env.
Any missing REQUIRED field causes a ValidationError at import time,
which propagates to a startup failure with a clear, descriptive message.
"""

import sys
from typing import Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All required environment variables for OmniAid.
    Fields without a default are REQUIRED — the app will not start without them.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # Silently ignore unknown env vars
        case_sensitive=False,    # GEMINI_API_KEY == gemini_api_key
    )

    # -----------------------------------------------------------------------
    # LLM Provider — Google Gemini (used for multimodal file extraction)
    # -----------------------------------------------------------------------
    GEMINI_API_KEY: str = Field(..., description="Google Gemini API key (required for image/audio extraction)")

    # -----------------------------------------------------------------------
    # LLM Provider — Groq (used for chat & text analysis — optional, falls back to Gemini)
    # -----------------------------------------------------------------------
    GROQ_API_KEY: str = Field(default="", description="Groq API key (optional — uses Gemini if not set)")

    # -----------------------------------------------------------------------
    # Fraud Verification APIs (all optional — app boots without them)
    # -----------------------------------------------------------------------
    GOOGLE_SAFE_BROWSING_KEY: str = Field(default="", description="Google Safe Browsing API v4 key (optional)")
    VIRUSTOTAL_API_KEY: str = Field(default="", description="VirusTotal API v3 key (optional)")
    IPQUALITYSCORE_API_KEY: str = Field(default="", description="IPQualityScore API key for phone checks (optional)")

    # -----------------------------------------------------------------------
    # Twilio SMS Alerts (optional — alerts disabled if not set)
    # -----------------------------------------------------------------------
    TWILIO_ACCOUNT_SID: str = Field(default="", description="Twilio Account SID (optional)")
    TWILIO_AUTH_TOKEN: str = Field(default="", description="Twilio Auth Token (optional)")
    TWILIO_FROM_NUMBER: str = Field(default="", description="Twilio sender phone number, e.g. +12345678900 (optional)")

    # -----------------------------------------------------------------------
    # Speech-to-Text (Google Cloud Speech or equivalent)
    # NOTE: The app uses Gemini multimodal directly for file extraction.
    # This key is kept for future dedicated speech API usage.
    # -----------------------------------------------------------------------
    SPEECH_TO_TEXT_API_KEY: str = Field(default="", description="Speech-to-text API key (optional — Gemini handles multimodal extraction)")

    # -----------------------------------------------------------------------
    # Google Places / Maps API (optional — used for nearby doctor/help map links in frontend)
    # -----------------------------------------------------------------------
    GOOGLE_PLACES_API_KEY: str = Field(default="", description="Google Places API key (optional — used for map feature)")

    # -----------------------------------------------------------------------
    # MongoDB (motor async driver)
    # -----------------------------------------------------------------------
    MONGODB_URL: str = Field(..., description="MongoDB connection string (required)")
    MONGODB_DB_NAME: str = Field(default="sumscale_local", description="MongoDB database name — defaults to sumscale_local for local dev")

    # -----------------------------------------------------------------------
    # JWT Authentication
    # -----------------------------------------------------------------------
    JWT_SECRET_KEY: str = Field(..., description="JWT signing secret — must be a long random string (required)")
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_EXPIRE_MINUTES: int = Field(default=10080, description="Token lifetime in minutes (default: 7 days)")

    # -----------------------------------------------------------------------
    # CORS — frontend origin only, never wildcard
    # -----------------------------------------------------------------------
    FRONTEND_URL: str = Field(..., description="Frontend origin for CORS, e.g. http://localhost:5173 (required)")

    # -----------------------------------------------------------------------
    # Application
    # -----------------------------------------------------------------------
    ENVIRONMENT: Literal["development", "production", "test"] = Field(default="development")
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")
    PORT: int = Field(default=8000, ge=1, le=65535)

    # -----------------------------------------------------------------------
    # Validators
    # -----------------------------------------------------------------------
    @field_validator("FRONTEND_URL")
    @classmethod
    def no_trailing_slash(cls, v: str) -> str:
        """Strip trailing slash to prevent CORS mismatches."""
        return v.rstrip("/")

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if v in ("your_very_strong_random_jwt_secret_here", "", "secret", "changeme"):
            raise ValueError(
                "JWT_SECRET_KEY is a placeholder. "
                "Generate a real secret: python -c \"import secrets; print(secrets.token_hex(64))\""
            )
        if len(v) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters long.")
        return v

    @field_validator("GEMINI_API_KEY")
    @classmethod
    def no_placeholder_keys(cls, v: str, info) -> str:
        if v.startswith("your_") or v in ("", "placeholder", "changeme"):
            raise ValueError(
                f"{info.field_name} contains a placeholder value. "
                "Please set a real API key in your .env file."
            )
        return v


def _load_settings() -> Settings:
    """
    Load settings and fail fast with a human-readable error on any problem.
    Called once at module level — the whole app fails at import if config is bad.
    """
    try:
        return Settings()
    except Exception as exc:  # pydantic ValidationError or any IO error
        print("\n" + "=" * 70, file=sys.stderr)
        print("  OmniAid STARTUP FAILED — Environment configuration error", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(f"\n{exc}\n", file=sys.stderr)
        print("  Fix: copy .env.example to .env and fill in all required values.", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        sys.exit(1)


settings: Settings = _load_settings()
