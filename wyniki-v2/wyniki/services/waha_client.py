"""Send a WhatsApp text through the local WAHA container."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from ..config import logger, settings


def waha_configured() -> bool:
    return bool((settings.waha_url or "").strip() and (settings.waha_api_key or "").strip())


def send_text(chat_id: str, text: str) -> bool:
    """POST /api/sendText. Returns False on any transport or HTTP failure."""
    url = settings.waha_url.rstrip("/") + "/api/sendText"
    body = json.dumps({
        "chatId": chat_id,
        "text": text,
        "session": settings.waha_session or "default",
    }).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Api-Key": settings.waha_api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return 200 <= response.status < 300
    except urllib.error.HTTPError as exc:
        logger.warning("waha_send_failed", status=exc.code, chat_id=chat_id)
        return False
    except Exception as exc:
        logger.warning("waha_send_failed", error=str(exc), chat_id=chat_id)
        return False
