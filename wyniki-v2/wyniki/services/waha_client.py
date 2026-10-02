"""Send a WhatsApp text through the local WAHA container."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from ..config import logger, settings


def waha_configured() -> bool:
    return bool((settings.waha_url or "").strip() and (settings.waha_api_key or "").strip())


def _request(path: str, payload: dict | None = None, timeout: int = 10) -> tuple[int, str]:
    url = settings.waha_url.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": settings.waha_api_key,
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        logger.warning("waha_request_failed", status=exc.code, path=path)
        return exc.code, ""
    except Exception as exc:
        logger.warning("waha_request_failed", error=str(exc), path=path)
        return 0, ""


def send_text(chat_id: str, text: str) -> str | None:
    """POST /api/sendText. Returns the WhatsApp message id, or None on failure."""
    status, raw = _request("/api/sendText", {
        "chatId": chat_id,
        "text": text,
        "session": settings.waha_session or "default",
    })
    if not 200 <= status < 300:
        return None
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return "sent"
    ident = payload.get("id") if isinstance(payload, dict) else ""
    if isinstance(ident, dict):
        ident = ident.get("id") or ident.get("_serialized") or ""
    return str(ident or "sent")


def recent_messages(chat_id: str, limit: int = 20) -> list[dict]:
    """Latest texts in a chat. Empty when WAHA is down."""
    from urllib.parse import quote

    session = settings.waha_session or "default"
    path = f"/api/{session}/chats/{quote(chat_id, safe='')}/messages?limit={int(limit)}&downloadMedia=false"
    status, raw = _request(path, timeout=15)
    if not 200 <= status < 300 or not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []
