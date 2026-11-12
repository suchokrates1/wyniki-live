"""Match lifecycle service for umpire tablet/PWA requests (create, update, finish, stats)."""
from __future__ import annotations

import json
import threading

from ..config import logger
from ..database import (
    add_row,
    commit_writes,
    detect_bracket_context,
    first_row_where,
    get_active_tournament_id,
    get_tournament_id_for_court,
    latest_match_with_uuid,
)
from ..db_models import Match, MatchStatistics, utc_now_iso
from . import web_push
from .court_manager import STATE_LOCK, ensure_court_state
from .director_commands import dump_match_config
from .event_broker import emit_score_update
from .live_state import store_live_state
from .match_format import match_score_satisfies_format
from .match_timer import apply_match_start_from_payload
from .office_event_broker import emit_office_invalidation
from .umpire_client_meta import _clean_client_text, _clean_int, _match_client_audit
from .umpire_match_finalize import (
    FINISH_REASON_NORMAL,
    FINISH_REASON_RETIREMENT,
    FINISH_REASON_TEST,
    FINISH_REASON_WALKOVER,
    _finalize_match_record,
    _link_match_schedule_if_possible,
    _maybe_backfill_match_bracket_context,
    _publish_match_finished,
)
from .umpire_overlay_sync import (
    _apply_live_overlay_meta,
    _apply_serve_from_payload,
    _refresh_live_overlay_meta_from_match,
    _resolve_live_overlay_category,
    _schedule_context_for_match,
    _serve_from_payload,
    _sync_court_match_timer_from_match,
    _sync_live_score_to_court_state,
)
from .umpire_roster import _apply_db_flags_to_court_state


def create_umpire_match(data: dict) -> tuple[dict, int]:
    """Create (or reuse by client_match_uuid) an umpire match and update live court state."""
    score = data.get("score", {})
    kort_id = data.get("court_id")
    client_audit = _match_client_audit(data)
    client_match_uuid = _clean_client_text(data.get("client_match_uuid"), 80)
    schedule_id = _clean_int(data.get("schedule_id"))

    if kort_id:
        ensure_court_state(kort_id)

    tournament_id = get_tournament_id_for_court(kort_id) or get_active_tournament_id()
    bracket_warning = None
    bracket_ctx = {"group_id": None, "phase": None, "warning": None}

    p1_name = data.get("player1_name")
    p2_name = data.get("player2_name")

    if client_match_uuid:
        existing_match = latest_match_with_uuid(client_match_uuid)
        if existing_match:
            logger.info("match_create_reused", match_id=existing_match.id, client_match_uuid=client_match_uuid)
            return existing_match.to_dict(), 200

    if tournament_id and p1_name and p2_name:
        bracket_ctx = detect_bracket_context(p1_name, p2_name, tournament_id)
        bracket_warning = bracket_ctx.get("warning")
    schedule_entry = _schedule_context_for_match(tournament_id, schedule_id)
    if schedule_entry:
        bracket_ctx = {
            "group_id": schedule_entry.get("bracket_group_id"),
            "phase": schedule_entry.get("phase") or bracket_ctx.get("phase"),
            "warning": None,
        }
        bracket_warning = None

    match = Match(
        court_id=kort_id,
        player1_name=p1_name,
        player2_name=p2_name,
        status=data.get("status", "in_progress"),
        tournament_id=tournament_id,
        bracket_group_id=bracket_ctx.get("group_id"),
        phase=bracket_ctx.get("phase"),
        client_match_uuid=client_match_uuid,
        schedule_id=schedule_id,
        finish_reason=FINISH_REASON_NORMAL,
        player1_sets=score.get("player1_sets", 0),
        player2_sets=score.get("player2_sets", 0),
        player1_games=score.get("player1_games", 0),
        player2_games=score.get("player2_games", 0),
        player1_points=score.get("player1_points", 0),
        player2_points=score.get("player2_points", 0),
        sets_history=json.dumps(score.get("sets_history", [])),
        match_config=dump_match_config(data.get("match_config")),
        client_info=client_audit["client_info"],
        client_ip=client_audit["client_ip"],
        client_country=client_audit["client_country"],
        client_user_agent=client_audit["client_user_agent"],
    )
    apply_match_start_from_payload(match, data)
    add_row(match)
    commit_writes()

    _link_match_schedule_if_possible(match, status="in_progress")
    if match.tournament_id:
        emit_office_invalidation(match.tournament_id, ["results", "schedule", "dashboard"])

    court_state = None
    if kort_id:
        court_state = ensure_court_state(kort_id)
        with STATE_LOCK:
            court_state["A"]["surname"] = match.player1_name
            court_state["B"]["surname"] = match.player2_name
            court_state["A"]["full_name"] = data.get("player1_full_name") or match.player1_name
            court_state["B"]["full_name"] = data.get("player2_full_name") or match.player2_name
            _apply_db_flags_to_court_state(
                court_state, match.tournament_id, match.player1_name, match.player2_name
            )
            court_state["match_status"]["active"] = True
            _sync_live_score_to_court_state(court_state, match, score)
            _sync_court_match_timer_from_match(court_state, match)
            court_state["updated"] = utc_now_iso()
            _apply_live_overlay_meta(
                court_state,
                phase=bracket_ctx.get("phase") or match.phase,
                category=_resolve_live_overlay_category(
                    tournament_id, schedule_entry, bracket_ctx, match.player1_name, match.player2_name
                ),
            )
            _apply_serve_from_payload(court_state, data)
        emit_score_update(kort_id, court_state)

    logger.info(
        "match_created",
        match_id=match.id,
        kort=kort_id,
        phase=bracket_ctx.get("phase"),
        warning=bracket_warning,
        country=client_audit["client_country"],
        ip=client_audit["client_ip"],
    )
    threading.Thread(
        target=web_push.notify_match_started,
        args=(
            kort_id,
            (court_state or {}).get("court_name") or kort_id,
            match.player1_name,
            match.player2_name,
        ),
        name="match-started-push",
        daemon=True,
    ).start()

    return match.to_dict(bracket_warning=bracket_warning), 201


def update_umpire_match(match: Match, data: dict) -> dict:
    """Apply an umpire PUT update (including implicit/explicit finish) and sync court state."""
    score = data.get("score", {})
    match.player1_sets = score.get("player1_sets", 0)
    match.player2_sets = score.get("player2_sets", 0)
    match.player1_games = score.get("player1_games", 0)
    match.player2_games = score.get("player2_games", 0)
    match.player1_points = score.get("player1_points", 0)
    match.player2_points = score.get("player2_points", 0)
    match.sets_history = json.dumps(score.get("sets_history", []))
    if data.get("match_config") is not None:
        match.match_config = dump_match_config(data.get("match_config"))
    apply_match_start_from_payload(match, data)
    if data.get("client_match_uuid") and not match.client_match_uuid:
        match.client_match_uuid = _clean_client_text(data.get("client_match_uuid"), 80)
    if data.get("schedule_id") and not match.schedule_id:
        match.schedule_id = _clean_int(data.get("schedule_id"))

    schedule_entry = _schedule_context_for_match(match.tournament_id, match.schedule_id)
    if schedule_entry:
        if not match.bracket_group_id and schedule_entry.get("bracket_group_id"):
            match.bracket_group_id = schedule_entry.get("bracket_group_id")
        if not match.phase and schedule_entry.get("phase"):
            match.phase = schedule_entry.get("phase")
    _maybe_backfill_match_bracket_context(match)

    became_finished = False
    already_finished = match.status == "finished"
    explicit_reason = str(data.get("finish_reason") or "").strip().lower()
    if not already_finished and explicit_reason in {
        FINISH_REASON_RETIREMENT,
        FINISH_REASON_WALKOVER,
        FINISH_REASON_TEST,
    }:
        _finalize_match_record(match, data)
        became_finished = True
    elif not already_finished and match_score_satisfies_format(match):
        _finalize_match_record(
            match, {"finish_reason": FINISH_REASON_NORMAL, "winner_name": data.get("winner_name")}
        )
        became_finished = True
    elif not already_finished:
        requested = str(data.get("status") or "in_progress")
        match.status = "in_progress" if requested == "finished" else requested

    if match.status == "in_progress":
        store_live_state(match, score, _serve_from_payload(data))
    match.updated_at = utc_now_iso()

    commit_writes()
    if became_finished:
        _publish_match_finished(match)
        return match.to_dict()
    if already_finished:
        return match.to_dict()

    _link_match_schedule_if_possible(match, status="in_progress")
    if match.tournament_id:
        emit_office_invalidation(match.tournament_id, ["results", "schedule", "dashboard"])

    kort_id = match.court_id
    if kort_id:
        court_state = ensure_court_state(kort_id)
        with STATE_LOCK:
            court_state["A"]["surname"] = match.player1_name
            court_state["B"]["surname"] = match.player2_name
            _apply_db_flags_to_court_state(
                court_state, match.tournament_id, match.player1_name, match.player2_name
            )
            _sync_live_score_to_court_state(court_state, match, score)
            court_state["match_status"]["active"] = match.status == "in_progress"
            _sync_court_match_timer_from_match(court_state, match)
            _refresh_live_overlay_meta_from_match(court_state, match)
            _apply_serve_from_payload(court_state, data)
            court_state["updated"] = utc_now_iso()
        emit_score_update(kort_id, court_state)
        logger.info("match_updated", match_id=match.id, kort=kort_id)

    return match.to_dict()


def finish_umpire_match(match: Match, data: dict) -> dict:
    """Mark match as finished idempotently and publish completion."""
    if match.status == "finished":
        return match.to_dict()
    _finalize_match_record(match, data)
    commit_writes()
    _publish_match_finished(match)
    return match.to_dict()


def save_umpire_statistics(match: Match, data: dict) -> tuple[dict, int]:
    """Persist end-of-match statistics for a non-test match."""
    if match.finish_reason == FINISH_REASON_TEST:
        return {"message": "Statistics ignored for test match"}, 200

    match_id = match.id
    stats = first_row_where(MatchStatistics, match_id=match_id)
    if not stats:
        stats = MatchStatistics(match_id=match_id)
        add_row(stats)

    p1_stats = data.get("player1_stats", {})
    p2_stats = data.get("player2_stats", {})
    _apply_player_stats(stats, "player1", p1_stats)
    _apply_player_stats(stats, "player2", p2_stats)
    stats.match_duration_ms = data.get("match_duration_ms", 0)
    stats.winner = data.get("winner")
    stats.stats_mode = data.get("stats_mode")
    stats.received_at = utc_now_iso()
    commit_writes()

    logger.info(
        "match_stats_saved",
        match_id=match_id,
        player1_aces=stats.player1_aces,
        player1_double_faults=stats.player1_double_faults,
        player2_aces=stats.player2_aces,
        player2_double_faults=stats.player2_double_faults,
    )
    return {"message": "Statistics received successfully"}, 200


def _apply_player_stats(row: MatchStatistics, side: str, payload: dict) -> None:
    setattr(row, f"{side}_aces", payload.get("aces", 0))
    setattr(row, f"{side}_double_faults", payload.get("double_faults", 0))
    setattr(row, f"{side}_winners", payload.get("winners", 0))
    setattr(row, f"{side}_forced_errors", payload.get("forced_errors", 0))
    setattr(row, f"{side}_unforced_errors", payload.get("unforced_errors", 0))
    setattr(row, f"{side}_first_serves", payload.get("first_serves", 0))
    setattr(row, f"{side}_first_serves_in", payload.get("first_serves_in", 0))
    setattr(row, f"{side}_first_serve_percentage", payload.get("first_serve_percentage", 0.0))
