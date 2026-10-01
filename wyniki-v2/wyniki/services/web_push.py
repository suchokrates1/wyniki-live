"""Sending Web Push notifications to the public site.

The whole feature is off unless both VAPID keys are configured, so the code can
ship and deploy before the keys exist and simply do nothing. Sending is
best-effort by design: a spectator's notification is never worth failing or
delaying the umpire's request that triggered it.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from ..config import settings
from ..database import push_subscriptions
from . import notification_texts

logger = structlog.get_logger()

# Push services reply with these when a subscription is dead. Anything else may
# be temporary, so the row stays and we try again next time.
GONE_STATUS_CODES = (404, 410)

# How long the push service keeps a message for a phone that is not connected
# right now. Zero, which is what the library does if we say nothing, means
# "deliver this second or throw it away", so a reconnect a moment later never
# sees the reminder. Ten minutes covers a network change without delivering
# "your match is in 7 minutes" half an hour late.
PUSH_TTL_SECONDS = 600


def is_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def public_key() -> str:
    return settings.vapid_public_key or ""


def _vapid_claims() -> dict[str, str]:
    # RFC 8292 wants a contact for the push service to reach if we misbehave.
    return {"sub": settings.vapid_subject or "mailto:kontakt@vestmedia.pl"}


def _send_one(subscription: dict[str, Any], payload: str) -> int | None:
    """Push to one subscriber. Returns the HTTP status, or None if it never went."""
    from pywebpush import WebPushException, webpush

    try:
        response = webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=_vapid_claims(),
            ttl=PUSH_TTL_SECONDS,
            timeout=10,
        )
        return getattr(response, "status_code", 201)
    except WebPushException as exc:
        return getattr(getattr(exc, "response", None), "status_code", None)
    except Exception as exc:  # noqa: BLE001 - a spectator push must never break a match
        logger.warning("web_push_send_failed", error=str(exc))
        return None


def send_to(subscribers: list[dict[str, Any]], build_payload) -> int:
    """Push to many devices, each in the language it asked for.

    `build_payload` takes a language and returns the payload for it; it is
    called once per distinct language, not once per device. Returns how many
    were delivered. Never raises: every caller is a request doing something
    more important than a notification.
    """
    if not subscribers or not is_enabled():
        return 0
    if not callable(build_payload):
        payload = build_payload
        def build_payload(_lang, _payload=payload):  # noqa: E306 - keeps old callers working
            return _payload

    bodies: dict[str, str] = {}
    sent: list[str] = []
    gone: list[str] = []
    for subscription in subscribers:
        lang = str(subscription.get("lang") or "pl")
        if lang not in bodies:
            bodies[lang] = json.dumps(build_payload(lang))
        status = _send_one(subscription, bodies[lang])
        if status in GONE_STATUS_CODES:
            gone.append(subscription["endpoint"])
        elif status and 200 <= status < 300:
            sent.append(subscription["endpoint"])

    for endpoint in gone:
        try:
            push_subscriptions.delete_subscription(endpoint)
        except Exception as exc:  # noqa: BLE001
            logger.warning("web_push_prune_failed", error=str(exc))
    try:
        push_subscriptions.mark_sent(sent)
    except Exception as exc:  # noqa: BLE001
        logger.warning("web_push_mark_failed", error=str(exc))

    logger.info("web_push_sent", sent=len(sent), pruned=len(gone))
    return len(sent)


def notify_match_started(court_id: str, court_name: str, player_a: str, player_b: str) -> int:
    """Tell everyone watching this court that a match just started.

    Returns how many notifications went out. Never raises: the caller is the
    umpire's match-create request and it must not fail over this.
    """
    if not is_enabled():
        return 0
    try:
        subscribers = push_subscriptions.subscriptions_for_court(court_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("web_push_lookup_failed", error=str(exc), court_id=court_id)
        return 0

    def payload(lang: str) -> dict[str, Any]:
        players = " – ".join(name for name in (player_a, player_b) if name)
        return {
            "type": "match_started",
            "title": notification_texts.text(lang, "match_started_title", court=court_name or court_id),
            "body": players or notification_texts.text(lang, "match_started_body"),
            "tag": f"match-{court_id}",
            "url": "/",
        }

    return send_to(subscribers, payload)
