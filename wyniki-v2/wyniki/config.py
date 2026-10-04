"""Application configuration using Pydantic Settings."""
from __future__ import annotations

import logging
from datetime import datetime, UTC
from pathlib import Path

import structlog
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with validation."""
    
    # Flask settings
    secret_key: str = "dev-secret-key-change-in-production"
    flask_env: str = "production"
    debug: bool = False
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8088
    
    # Database
    database_path: str = "/data/wyniki.sqlite3"
    
    # Admin
    admin_password: str | None = None
    admin_session_ttl_hours: int = 72
    office_session_ttl_hours: int = 168

    # API authorization rollout
    court_session_ttl_hours: int = 24
    court_auth_grace_until: datetime = datetime(2026, 8, 8, tzinfo=UTC)

    # AI-assisted player import parsing
    import_players_ai_api_key: str | None = None
    import_players_ai_model: str = "gemini-2.5-flash"
    import_players_ai_timeout_seconds: int = 20
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"  # "json" or "console"
    
    # Public-site features still being tried out, comma separated (e.g. "court-next").
    # Set per stack in compose; production leaves it empty.
    public_features: str = ""

    # History
    match_history_size: int = 100
    log_entries_per_court: int = 50
    live_rehydrate_max_age_hours: int = 12
    overlay_snapshot_path: str = "/data/overlay_snapshot.json"
    overlay_snapshot_max_age_seconds: int = 1800

    # Web Push for the public site. Both keys empty = the feature is off, which
    # is the default: the private key belongs in the prod env, never in the repo.
    # Generate a pair with scripts/generate_vapid_keys.py (py_vapid hands back
    # cryptography objects, not the base64url strings the browser and pywebpush
    # want, so the serialisation has to be done by hand).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:kontakt@vestmedia.pl"
    # Off switch for the periodic reminder pass, for a host that should not send.
    reminder_loop_enabled: bool = True

    # WhatsApp alerts for the umpire panic button. Empty URL or key = the
    # feature answers 503 and sends nothing. The key stays in the host .env.
    waha_url: str = ""
    waha_api_key: str = ""
    waha_session: str = "default"
    panic_cooldown_seconds: int = 60
    
    # Paths
    base_dir: Path = Path(__file__).parent.parent.parent
    static_dir: Path = Path(__file__).parent / "static"  # wyniki/static
    download_dir: Path = Path(__file__).parent.parent.parent / "download"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure paths are Path objects
        if isinstance(self.base_dir, str):
            self.base_dir = Path(self.base_dir)
        if isinstance(self.static_dir, str):
            self.static_dir = Path(self.static_dir)
        if isinstance(self.download_dir, str):
            self.download_dir = Path(self.download_dir)


# Global settings instance
settings = Settings()


def setup_logging():
    """Configure structured logging."""
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    
    processors = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]
    
    if settings.log_format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
    )


# Initialize logging
setup_logging()
logger = structlog.get_logger()

