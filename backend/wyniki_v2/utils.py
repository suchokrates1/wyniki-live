"""Utility functions."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


def format_duration(seconds: int) -> str:
    """Format seconds as MM:SS."""
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes:02d}:{secs:02d}"


def parse_iso_datetime(iso_string: str) -> datetime:
    """Parse ISO datetime string."""
    return datetime.fromisoformat(iso_string.replace("Z", "+00:00"))


def safe_copy(data: Any) -> Any:
    """Deep copy data safely."""
    from copy import deepcopy
    return deepcopy(data)


def surname(full_name: Optional[str]) -> str:
    """Extract surname from full name."""
    if not full_name:
        return "-"
    parts = str(full_name).strip().split()
    return parts[-1] if parts else "-"


def shorten(text: str, max_length: int = 20) -> str:
    """Shorten text to max length."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def as_int(value: Any, default: int = 0) -> int:
    """Convert value to int safely."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_bool(value: Any) -> Optional[bool]:
    """Convert value to boolean."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    s = str(value).lower().strip()
    if s in ("true", "1", "yes", "on"):
        return True
    if s in ("false", "0", "no", "off"):
        return False
    return None


def now_iso() -> str:
    """Get current time as ISO string."""
    from datetime import timezone
    return datetime.now(timezone.utc).isoformat()


def step_points(current: str, direction: str = "up") -> str:
    """Step through tennis point sequence."""
    sequence = ["0", "15", "30", "40", "ADV"]
    try:
        idx = sequence.index(current)
    except ValueError:
        idx = 0
    
    if direction == "up":
        idx = min(idx + 1, len(sequence) - 1)
    else:
        idx = max(idx - 1, 0)
    
    return sequence[idx]
