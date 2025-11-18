"""Application configuration using Pydantic Settings."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

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
    database_path: str = "/data/wyniki_test.sqlite3"
    
    # Admin
    admin_password: Optional[str] = None
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"  # "json" or "console"
    
    # History
    match_history_size: int = 100
    log_entries_per_court: int = 50
    
    # Paths
    base_dir: Path = Path(__file__).parent.parent.parent
    static_dir: Path = Path(__file__).parent.parent / "static"  # Changed for Docker
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

