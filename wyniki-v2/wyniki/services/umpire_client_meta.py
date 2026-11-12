"""Client metadata and IP/country extraction for umpire mobile/PWA requests."""
from __future__ import annotations

import json
import re
from typing import Any

from flask import request

from ..db_models import utc_now_iso

_CLIENT_HEADER_MAP = {
    "platform": ("X-TennisReferee-Platform", 50),
    "app_version": ("X-TennisReferee-App-Version", 50),
    "app_version_code": ("X-TennisReferee-App-Code", 20),
    "device": ("X-TennisReferee-Device", 160),
    "device_manufacturer": ("X-TennisReferee-Manufacturer", 80),
    "device_model": ("X-TennisReferee-Model", 120),
    "android_sdk": ("X-TennisReferee-Android-Sdk", 20),
    "android_release": ("X-TennisReferee-Android-Release", 40),
    "locale": ("X-TennisReferee-Locale", 40),
    "country": ("X-TennisReferee-Country", 10),
    "timezone": ("X-TennisReferee-Timezone", 80),
    "android_id": ("X-TennisReferee-Android-Id", 32),
}


def _clean_client_text(value: Any, max_length: int = 200) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def _clean_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _normalize_country(value: Any) -> str | None:
    text = _clean_client_text(value, 10)
    if not text:
        return None
    country = text.upper()
    if re.fullmatch(r"[A-Z]{2}", country):
        return country
    return None


def _request_client_ip() -> str | None:
    for header in ("CF-Connecting-IP", "X-Real-IP"):
        value = _clean_client_text(request.headers.get(header), 100)
        if value:
            return value

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        first_ip = _clean_client_text(forwarded_for.split(",", 1)[0], 100)
        if first_ip:
            return first_ip

    forwarded = request.headers.get("Forwarded")
    if forwarded:
        for part in forwarded.split(","):
            for item in part.split(";"):
                key, _, value = item.strip().partition("=")
                if key.lower() == "for":
                    cleaned = _clean_client_text(value.strip('"[]'), 100)
                    if cleaned:
                        return cleaned

    return _clean_client_text(request.remote_addr, 100)


def _request_client_meta(data: dict | None) -> dict:
    meta: dict[str, str] = {}
    body_meta = data.get("client_meta") if isinstance(data, dict) else None
    if isinstance(body_meta, dict):
        for key, (_, max_length) in _CLIENT_HEADER_MAP.items():
            value = _clean_client_text(body_meta.get(key), max_length)
            if value:
                meta[key] = value

    for key, (header, max_length) in _CLIENT_HEADER_MAP.items():
        value = _clean_client_text(request.headers.get(header), max_length)
        if value:
            meta[key] = value

    country = _normalize_country(meta.get("country"))
    if country:
        meta["country"] = country
    elif "country" in meta:
        del meta["country"]
    return meta


def _match_client_audit(data: dict | None) -> dict[str, str | None]:
    client_meta = _request_client_meta(data)
    client_ip = _request_client_ip()
    client_country = (
        _normalize_country(request.headers.get("CF-IPCountry"))
        or _normalize_country(request.headers.get("X-TennisReferee-Country"))
        or _normalize_country(client_meta.get("country"))
    )
    user_agent = _clean_client_text(request.headers.get("User-Agent"), 500)
    client_info = {
        "received_at": utc_now_iso(),
        "ip": client_ip,
        "country": client_country,
        "user_agent": user_agent,
        "app": client_meta,
    }
    return {
        "client_info": json.dumps(client_info, ensure_ascii=False, sort_keys=True),
        "client_ip": client_ip,
        "client_country": client_country,
        "client_user_agent": user_agent,
    }
