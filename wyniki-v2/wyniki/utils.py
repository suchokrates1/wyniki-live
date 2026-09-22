"""Utility functions."""
from __future__ import annotations

from datetime import datetime

from flask import jsonify


def format_duration(seconds: int) -> str:
    """Format seconds as HH:MM (rounded to minutes)."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours:02d}:{minutes:02d}"


def parse_iso_datetime(iso_string: str) -> datetime:
    """Parse ISO datetime string."""
    return datetime.fromisoformat(iso_string.replace("Z", "+00:00"))


def json_no_cache(payload, status: int = 200):
    """JSON response that browsers and proxies must not cache."""
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response
