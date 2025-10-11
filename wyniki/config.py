"""Application configuration and environment helpers."""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "download")


def normalize_overlay_id(value: Any) -> Optional[str]:
    """Normalize overlay identifiers coming from various sources."""
    if not value:
        return None
    if isinstance(value, (tuple, list)):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("overlay") or value.get("id") or value.get("app") or value.get("appId")
    if isinstance(value, bytes):
        value = value.decode("utf-8", "ignore")
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"(?:^|[^A-Za-z0-9])app_([A-Za-z0-9]+)", text, re.IGNORECASE)
    if match:
        return f"app_{match.group(1).lower()}"
    match = re.search(r"(?:^|[^A-Za-z0-9])([A-F0-9]{32})", text, re.IGNORECASE)
    if match:
        return f"app_{match.group(1).lower()}"
    return None


def _load_overlay_ids() -> Dict[str, str]:
    ids: Dict[str, str] = {}
    for key, value in os.environ.items():
        match = re.fullmatch(r"KORT(\d+)_ID", key)
        if match and value and value.strip():
            raw_idx = match.group(1)
            try:
                norm_idx = str(int(raw_idx))
            except ValueError:
                norm_idx = raw_idx.lstrip("0") or raw_idx or "0"
            ids[norm_idx] = value.strip()
    if not ids:
        for idx in range(1, 5):
            val = os.environ.get(f"KORT{idx}_ID", "").strip()
            if val:
                ids[str(idx)] = val
    return dict(sorted(ids.items(), key=lambda kv: int(kv[0])))


@dataclass(frozen=True)
class Settings:
    """Collection of runtime configuration values."""

    overlay_base: str = os.environ.get("UNO_BASE", "https://app.overlays.uno/apiv2/controlapps")
    uno_auth_bearer: str = os.environ.get("UNO_AUTH_BEARER", "").strip()
    admin_password: str = os.environ.get("ADMIN_PASSWORD", "").strip()
    secret_key: str = (
        os.environ.get("FLASK_SECRET_KEY")
        or os.environ.get("SECRET_KEY")
        or os.environ.get("APP_SECRET_KEY")
        or "wyniki-secret-key"
    )
    rpm_per_court: int = int(os.environ.get("RPM_PER_COURT", "55"))
    burst: int = int(os.environ.get("BURST", "8"))
    db_path: str = os.environ.get("DB_PATH", "wyniki_archive.sqlite3")
    port: int = int(os.environ.get("PORT", "8080"))
    delete_password: str = (os.environ.get("HISTORY_DELETE_PASSWORD") or os.environ.get("DELETE_PASSWORD") or "").strip()
    state_log_size: int = int(os.environ.get("STATE_LOG_SIZE", "200"))
    match_history_size: int = int(os.environ.get("MATCH_HISTORY_SIZE", "50"))
    overlay_ids: Dict[str, str] = field(default_factory=dict)
    overlay_id_to_kort: Dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:  # type: ignore[override]
        object.__setattr__(self, "overlay_ids", {
            key: (normalize_overlay_id(value) or value)
            for key, value in _load_overlay_ids().items()
        })
        object.__setattr__(self, "overlay_id_to_kort", {
            value: key for key, value in self.overlay_ids.items() if value
        })

    @property
    def auth_header(self) -> Dict[str, str]:
        header = {"Content-Type": "application/json"}
        if self.uno_auth_bearer:
            header["Authorization"] = f"Bearer {self.uno_auth_bearer}"
        return header


settings = Settings()


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("wyniki")

__all__ = [
    "BASE_DIR",
    "STATIC_DIR",
    "DOWNLOAD_DIR",
    "Settings",
    "log",
    "normalize_overlay_id",
    "settings",
]
