"""Utility helpers shared across the application."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from flask import render_template_string

from .config import BASE_DIR


def render_file_template(relative_path: str, **context: Any):
    path = os.path.join(BASE_DIR, relative_path)
    with open(path, "r", encoding="utf-8") as handle:
        template = handle.read()
    return render_template_string(template, **context)


def shorten(data: Any, limit: int = 120) -> str:
    try:
        text = json.dumps(data, ensure_ascii=False)
    except TypeError:
        text = str(data)
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def surname(full: Optional[str]) -> str:
    if not full:
        return "-"
    parts = str(full).strip().split()
    return parts[-1] if parts else "-"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "on", "visible", "show", "shown", "active", "enabled"}:
        return True
    if text in {"false", "0", "no", "off", "hidden", "hide", "invisible", "inactive", "disabled"}:
        return False
    return None


def step_points(current: Any, delta: int, sequence: Optional[List[str]] = None) -> str:
    sequence = sequence or ["0", "15", "30", "40", "ADV"]
    current_value = str(current or sequence[0]).strip().upper()
    if current_value not in sequence:
        current_value = sequence[0]
    index = sequence.index(current_value)
    index = max(0, min(len(sequence) - 1, index + delta))
    return sequence[index]


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default


def safe_copy(data: Any) -> Any:
    if data is None:
        return None
    if isinstance(data, (str, int, float, bool)):
        return data
    if isinstance(data, dict):
        return {str(key): safe_copy(value) for key, value in data.items()}
    if isinstance(data, (list, tuple, set)):
        return [safe_copy(value) for value in data]
    try:
        return json.loads(json.dumps(data))
    except (TypeError, ValueError):
        return str(data)


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        if value.endswith("Z"):
            try:
                return datetime.fromisoformat(value[:-1] + "+00:00")
            except ValueError:
                return None
    return None


def format_duration(seconds: int) -> str:
    seconds = max(0, int(seconds))
    minutes, _ = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}"


def ensure_list(value: Iterable[Any]) -> List[Any]:
    return list(value)


__all__ = [
    "as_int",
    "ensure_list",
    "format_duration",
    "now_iso",
    "parse_iso_datetime",
    "render_file_template",
    "safe_copy",
    "shorten",
    "step_points",
    "surname",
    "to_bool",
]
