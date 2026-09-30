"""Reminders before a match, and a warning when the court is still busy.

Runs from a periodic pass rather than a request, because nothing happens in the
system at the moment a match is due to start - the clock simply reaches it.

Two things go out, at most once each per fixture:

  reminder  - "your match is in N minutes", N chosen per subscription
  delay     - "the court is still busy, about M minutes left", only when the
              estimate says the hold-up is worth mentioning

Both claim their slot in `push_sent_log` before sending, so a restart in the
middle of a pass cannot repeat them.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import structlog

from ..database import push_subscriptions
from ..database import reminders as reminders_db
from . import match_pace, notification_texts, web_push

logger = structlog.get_logger()

# Below this a delay is not worth a notification: it is inside the noise of the
# estimate itself, and everyone expects a few minutes' slack at a tournament.
DELAY_THRESHOLD_MINUTES = 15

# How far ahead to look. Nobody sets a reminder longer than this.
MAX_REMINDER_MINUTES = 180

# How far past its time a fixture is still worth watching. Beyond this it was
# almost certainly played, walked over or dropped without the plan being updated,
# and a notification would only confuse.
MAX_OVERDUE_MINUTES = 120


def _parse_fixture_start(day_date: str, scheduled_time: str, tz: timezone) -> datetime | None:
    try:
        naive = datetime.strptime(f"{day_date} {scheduled_time}", "%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        return None
    return naive.replace(tzinfo=tz)


def upcoming_fixtures(now: datetime, tz: timezone) -> list[dict[str, Any]]:
    """Fixtures worth looking at: due soon, or already overdue and not started.

    Overdue ones matter most. A match that should have begun half an hour ago,
    on a court still finishing the previous one, is exactly the case a player
    wants to hear about, and a window that started at `now` would have skipped
    every one of them.
    """
    horizon = now + timedelta(minutes=MAX_REMINDER_MINUTES)
    earliest = now - timedelta(minutes=MAX_OVERDUE_MINUTES)
    fixtures = []
    for row in reminders_db.published_fixtures_with_times():
        start = _parse_fixture_start(row["day_date"], row["scheduled_time"], tz)
        if not start or not (earliest <= start <= horizon):
            continue
        fixtures.append({
            **row,
            "starts_at": start,
            "minutes_away": int((start - now).total_seconds() // 60),
        })
    return fixtures


def court_busy_for(court_id: str) -> int | None:
    """Minutes the match occupying this court still needs, or None if it is free."""
    row = reminders_db.live_match_on_court(court_id)
    if not row:
        return None
    try:
        live = json.loads(row["live_state"] or "{}")
        config = json.loads(row["match_config"] or "{}")
    except (TypeError, ValueError):
        live, config = {}, {}
    return match_pace.remaining_minutes(live, config, row["player1_sets"], row["player2_sets"])


def followers(fixture: Mapping[str, Any], preference: str) -> list[dict[str, Any]]:
    players = push_subscriptions.players_in_fixture(
        fixture.get("player1_name"), fixture.get("player2_name")
    )
    if not players:
        return []
    return push_subscriptions.subscriptions_for_players(players, preference)


def _send(fixture: Mapping[str, Any], subscribers: list[dict[str, Any]], kind: str, build_body,
          tag_suffix: str = "") -> int:
    if not subscribers:
        return 0

    court = str(fixture.get("court_label") or fixture.get("court_id") or "")

    def payload(lang: str) -> dict[str, Any]:
        return {
            "type": kind,
            "title": notification_texts.text(lang, f"{kind}_title"),
            "body": build_body(lang, court),
            "tag": f"{kind}-{fixture['id']}{tag_suffix}",
            "url": "/#schedule",
        }

    return web_push.send_to(subscribers, payload)


def run_pass(now: datetime | None = None, tz: timezone = timezone.utc) -> dict[str, int]:
    """One sweep. Safe to call as often as you like; each fixture fires once."""
    if not web_push.is_enabled():
        return {"reminders": 0, "delays": 0}

    now = now or datetime.now(tz)
    reminders = delays = 0

    for fixture in upcoming_fixtures(now, tz):
        minutes_away = fixture["minutes_away"]

        # Everyone picks their own lead time, so the due ones are grouped by it:
        # 60 minutes out, only those who asked for 60 hear anything. A fixture
        # already past its time gets no reminder - "before the match" has been
        # and gone, and the delay notice below is what fits that case.
        by_lead: dict[int, list[dict[str, Any]]] = {}
        if minutes_away >= 0:
            for subscriber in followers(fixture, "notify_reminder"):
                lead = int(subscriber.get("reminder_minutes") or 30)
                if minutes_away <= lead:
                    by_lead.setdefault(lead, []).append(subscriber)

        for lead, group in by_lead.items():
            if not push_subscriptions.claim_send(fixture["id"], f"reminder:{lead}"):
                continue
            sent = _send(
                fixture, group, "reminder",
                lambda lang, court, m=minutes_away: notification_texts.join_details(
                    notification_texts.text(lang, "reminder_body", minutes=max(m, 0)),
                    notification_texts.text(lang, "court", court=court) if court else "",
                ),
                tag_suffix=f"-{lead}",
            )
            reminders += sent
            if not sent:
                push_subscriptions.release_send(fixture["id"], f"reminder:{lead}")

        # The delay is how much later than planned, not how long the court is
        # still busy: a 40-minute match on a court I need in 30 is 10 minutes late.
        still_busy = court_busy_for(fixture["court_id"])
        if still_busy is None:
            continue
        delay = still_busy - minutes_away
        if delay < DELAY_THRESHOLD_MINUTES:
            continue
        if not push_subscriptions.claim_send(fixture["id"], "delay"):
            continue
        # The threshold is the lateness, but the message says how much longer the
        # match in the way still needs - that is the number a player can act on.
        sent = _send(
            fixture, followers(fixture, "notify_delay"), "delay",
            lambda lang, court, m=still_busy: notification_texts.join_details(
                notification_texts.text(lang, "delay_body", minutes=m),
                notification_texts.text(lang, "court", court=court) if court else "",
            ),
        )
        delays += sent
        if not sent:
            push_subscriptions.release_send(fixture["id"], "delay")

    if reminders or delays:
        logger.info("match_reminders_pass", reminders=reminders, delays=delays)
    return {"reminders": reminders, "delays": delays}
