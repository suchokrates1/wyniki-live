"""Telling players when their own matches appear in the plan or move.

A spectator subscribes to a player by name, because that is what the schedule
stores — free text typed by the office, not a player id. Matching therefore
goes through a normalised key, and a doubles fixture ("A / B") counts for both
of its players.

Everything here is best-effort: a notification that fails must never disturb
the office publishing a schedule.
"""

from __future__ import annotations

from typing import Any, Mapping

import structlog

from ..database import push_subscriptions
from . import notification_texts, web_push

logger = structlog.get_logger()

# Fields whose change is worth waking someone up for. Notes and sort order
# change constantly while the office works and mean nothing to a player.
WATCHED_FIELDS = ("court_label", "scheduled_time", "day_date", "player1_name", "player2_name")


def _fixture_players(entry: Mapping[str, Any]) -> set[str]:
    return push_subscriptions.players_in_fixture(
        entry.get("player1_name"), entry.get("player2_name")
    )


def _when(entry: Mapping[str, Any]) -> str:
    day = str(entry.get("day_date") or "").strip()
    time = str(entry.get("scheduled_time") or "").strip()
    return " ".join(part for part in (day, time) if part)


def notify_plan_published(entries: list[Mapping[str, Any]]) -> int:
    """One notification per player whose match just became public."""
    return _notify(entries, "notify_plan", "plan_published")


def notify_fixture_changed(before: Mapping[str, Any], after: Mapping[str, Any]) -> int:
    """Notify when a published fixture moves court, time, day or opponent."""
    if str(after.get("status") or "") == "draft":
        return 0
    changed = [field for field in WATCHED_FIELDS if before.get(field) != after.get(field)]
    if not changed:
        return 0
    # Both casts of players are told: the one who left the fixture cares too.
    players = _fixture_players(before) | _fixture_players(after)
    return _send(players, "notify_change", "fixture_changed", after, changed)


def _notify(entries: list[Mapping[str, Any]], preference: str, kind: str) -> int:
    sent = 0
    for entry in entries or []:
        sent += _send(_fixture_players(entry), preference, kind, entry, [])
    return sent


def _send(
    players: set[str],
    preference: str,
    kind: str,
    entry: Mapping[str, Any],
    changed: list[str],
) -> int:
    if not players or not web_push.is_enabled():
        return 0
    try:
        subscribers = push_subscriptions.subscriptions_for_players(players, preference)
    except Exception as exc:  # noqa: BLE001
        logger.warning("schedule_notification_lookup_failed", error=str(exc), kind=kind)
        return 0
    if not subscribers:
        return 0

    fixture = f"{entry.get('player1_name') or ''} – {entry.get('player2_name') or ''}".strip(" –")
    court = str(entry.get("court_label") or entry.get("court_id") or "").strip()

    def payload(lang: str) -> dict[str, Any]:
        details = notification_texts.join_details(
            fixture,
            _when(entry),
            notification_texts.text(lang, "court", court=court) if court else "",
        )
        return {
            "type": kind,
            "title": notification_texts.text(lang, f"{kind}_title"),
            "body": details,
            "tag": f"{kind}-{fixture or 'x'}",
            "changed": changed,
            "url": "/#schedule",
        }

    return web_push.send_to(subscribers, payload)
