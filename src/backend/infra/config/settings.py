"""Validated configuration; environment variables override the local dotenv file."""
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8",
        extra="ignore", hide_input_in_errors=True,
    )
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./data/nexo.db"
    redis_url: SecretStr = SecretStr("redis://localhost:6379/0")
    qdrant_url: str | None = "https://qdrant-production-3e50f.up.railway.app"
    qdrant_api_key: SecretStr | None = None
    qdrant_timeout_seconds: float = Field(default=5, gt=0, le=30)
    maps_url: str | None = "https://nexo-production-52a1.up.railway.app"
    maps_api_key: SecretStr | None = None
    maps_timeout_seconds: float = Field(default=20, gt=0, le=60)
    # Video rendering (HyperFrames) and the Groq key that writes the compositions from a prompt. Everything is
    # optional: a route that cannot work answers 503; nothing fails at startup. By default the backend runs the
    # render server itself, as a child process of video-server/ (Node + Chrome + FFmpeg are in the Docker image).
    # VIDEO_URL + VIDEO_SECRET point to an external render server instead.
    video_url: str | None = None
    video_secret: SecretStr | None = None
    video_embedded: bool = True
    video_server_dir: Path = PROJECT_ROOT / "video-server"
    video_max_concurrent_renders: int = Field(default=1, ge=1, le=4)
    # Narration (Kokoro, on this machine): the folder with kokoro-v1.0.int8.onnx and voices-v1.0.bin. Empty = no narration.
    tts_model_dir: Path | None = None
    tts_voice: str = "pf_dora"
    tts_lang: str = "pt-br"
    video_timeout_seconds: float = Field(default=900, gt=0, le=3600)
    groq_api_key: SecretStr | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    groq_url: str = "https://api.groq.com/openai/v1"
    groq_timeout_seconds: float = Field(default=90, gt=0, le=300)
    admin_name: str = "Brayan"
    email: EmailStr | None = None
    password: SecretStr | None = None
    resend_key: SecretStr | None = None
    resend_from: EmailStr | None = None
    url_email_n8n: str | None = None
    secret_email_n8n: SecretStr | None = None
    vapid_subject: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: SecretStr | None = None
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    jwt_secret_key: SecretStr
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_expire_minutes: int = Field(default=30, ge=1)
    auth_cookie_name: str = "nexo_access_token"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cors_origins: list[str] = ["http://localhost:5173"]
    frontend_url: str = "http://localhost:5173"
    cache_ttl_seconds: int = Field(default=60, ge=1)
    email_code_ttl_seconds: int = Field(default=600, ge=1)
    email_code_resend_cooldown_seconds: int = Field(default=60, ge=1, le=3600)
    email_code_max_attempts: int = Field(default=5, ge=1, le=20)
    redis_timeout_seconds: float = Field(default=3, gt=0, le=30)
    sqlite_timeout_seconds: float = Field(default=5, gt=0, le=60)
    email_timeout_seconds: float = Field(default=10, gt=0, le=60)
    email_queue_limit: int = Field(default=32, ge=1, le=1000)
    email_max_workers: int = Field(default=2, ge=1, le=16)
    global_rate_limit: int = Field(default=1000, ge=1)
    global_rate_limit_window_seconds: int = Field(default=60, ge=1)
    rate_limit: int = Field(default=60, ge=1)
    rate_limit_window_seconds: int = Field(default=60, ge=1)
    auth_rate_limit: int = Field(default=10, ge=1)
    auth_rate_limit_window_seconds: int = Field(default=60, ge=1)
    upload_dir: Path = Path("data/uploads")
    chat_media_max_bytes: int = Field(default=10485760, ge=1, le=52428800)
    ws_connections_per_user: int = Field(default=3, ge=1, le=10)
    ws_message_limit: int = Field(default=60, ge=1)
    document_max_bytes: int = Field(default=10485760, ge=1, le=52428800)
    profile_photo_max_pixels: int = Field(default=10000000, ge=1, le=20000000)
    profile_photo_max_bytes: int = Field(default=2097152, ge=1)
    forwarded_allow_ips: str = "127.0.0.1"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)

    @field_validator("email", "resend_from", "password", "resend_key", "secret_email_n8n",
                     "google_client_id", "google_client_secret", "qdrant_url", "qdrant_api_key",
                     "maps_url", "maps_api_key", "video_url", "video_secret", "groq_api_key", "tts_model_dir", mode="before")
    @classmethod
    def empty_optional(cls, value):
        return None if value == "" else value

    @field_validator("jwt_secret_key")
    @classmethod
    def strong_jwt_secret(cls, value: SecretStr):
        if len(value.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters")
        return value

    @field_validator("redis_url")
    @classmethod
    def redis_address(cls, value: SecretStr):
        try:
            parsed = urlsplit(value.get_secret_value())
            valid = parsed.scheme in {"redis", "rediss"} and parsed.hostname and parsed.port != 0
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("REDIS_URL must be a valid redis:// or rediss:// URL")
        return value

    @field_validator("url_email_n8n")
    @classmethod
    def secure_n8n_email_webhook(cls, value: str | None):
        if value is None:
            return None
        try:
            parsed = urlsplit(value)
            valid = (parsed.scheme == "https" and parsed.hostname and not parsed.username
                     and not parsed.password and not parsed.fragment)
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("URL_EMAIL_N8N must be a valid HTTPS URL")
        return value

    @field_validator("database_url")
    @classmethod
    def sqlite_database(cls, value: str):
        if not value.startswith("sqlite:///") or not value.removeprefix("sqlite:///"):
            raise ValueError("DATABASE_URL must identify a SQLite database")
        return value

    @field_validator("admin_name")
    @classmethod
    def valid_admin_name(cls, value: str):
        value = value.strip()
        if not value or len(value) > 120:
            raise ValueError("ADMIN_NAME must contain 1 to 120 characters")
        return value

    @field_validator("auth_cookie_name")
    @classmethod
    def valid_cookie_name(cls, value: str):
        if (not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", value)
                or value in {"nexo_google_flow", "nexo_google_profile"}):
            raise ValueError("AUTH_COOKIE_NAME must be a valid, non-reserved cookie name")
        return value

    @staticmethod
    def _http_address(value: str):
        try:
            parsed = urlsplit(value)
            if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                    or "*" in parsed.hostname or parsed.port == 0
                    or parsed.username is not None or parsed.password is not None
                    or parsed.query or parsed.fragment
                    or any(character.isspace() or ord(character) < 32 for character in value)):
                raise ValueError
        except ValueError:
            raise ValueError("An absolute HTTP(S) URL without credentials, query or fragment is required") from None
        return parsed

    @field_validator("frontend_url", "google_redirect_uri")
    @classmethod
    def http_url(cls, value: str):
        cls._http_address(value)
        return value.rstrip("/") if value.endswith("/") else value

    @field_validator("qdrant_url", "maps_url", "video_url")
    @classmethod
    def qdrant_address(cls, value: str | None):
        if value is None:
            return None
        cls._http_address(value)
        return value.rstrip("/")

    @field_validator("groq_url")
    @classmethod
    def groq_address(cls, value: str):
        cls._http_address(value)
        return value.rstrip("/")

    @field_validator("cors_origins")
    @classmethod
    def explicit_origins(cls, values: list[str]):
        if not values:
            raise ValueError("At least one explicit CORS origin is required")
        for value in values:
            parsed = cls._http_address(value)
            if parsed.path not in {"", "/"}:
                raise ValueError("CORS origins must be absolute origins, without paths or wildcards")
        return [value.rstrip("/") for value in values]

    @model_validator(mode="after")
    def coherent_configuration(self):
        for left, right in [(self.email, self.password),
                            (self.google_client_id, self.google_client_secret),
                            (self.url_email_n8n, self.secret_email_n8n)]:
            if bool(left) != bool(right):
                raise ValueError("Configure both values of each credential pair")
        if self.password:
            password = self.password.get_secret_value()
            try:
                valid = len(password) >= 12 and len(password.encode("utf-8")) <= 72
            except UnicodeError:
                valid = False
            if not valid:
                raise ValueError("PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes")
        if bool(self.video_url) != bool(self.video_secret):
            raise ValueError("Configure both VIDEO_URL and VIDEO_SECRET")
        if self.auth_cookie_name.startswith(("__Host-", "__Secure-")) and not self.cookie_secure:
            raise ValueError("Prefixed auth cookies require COOKIE_SECURE=true")
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("SameSite=None requires COOKIE_SECURE=true")
        if self.environment == "production":
            if not self.cookie_secure:
                raise ValueError("Production requires COOKIE_SECURE=true")
            if not self.email or not self.password:
                raise ValueError("Production requires EMAIL and PASSWORD for the administrator")
            if not self.resend_key:
                raise ValueError("Production requires RESEND_KEY for email delivery")
            urls = [self.frontend_url, *self.cors_origins]
            if self.google_client_id:
                urls.append(self.google_redirect_uri)
            if any(urlsplit(url).scheme != "https" for url in urls):
                raise ValueError("Production requires HTTPS frontend, origins and OAuth callback")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
