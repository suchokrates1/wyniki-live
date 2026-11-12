"""Match finalization publication: schedule linking, history, bracket advance, and async emails."""
from __future__ import annotations

import copy
from datetime import datetime, UTC
import json
import threading
from types import SimpleNamespace

from flask import current_app

from ..config import logger
from ..database import (
    advance_knockout,
    detect_bracket_context,
    fetch_tournament,
    first_row_where,
    is_knockout_stage_phase,
    link_schedule_to_match,
    maybe_generate_knockout_from_completed_groups,
    unlink_schedule_from_match,
)
from ..db_models import Match, Player, utc_now_iso
from ..utils import parse_iso_datetime
from .court_manager import (
    STATE_LOCK,
    _empty_player_state,
    ensure_court_state,
    reset_live_set_columns,
)
from .event_broker import emit_score_update
from .history_manager import add_match_to_history
from .office_event_broker import emit_office_invalidation
from .umpire_finish_outcome import (
    FINISH_REASON_NORMAL as FINISH_REASON_NORMAL,
    FINISH_REASON_RETIREMENT as FINISH_REASON_RETIREMENT,
    FINISH_REASON_TEST as FINISH_REASON_TEST,
    FINISH_REASON_WALKOVER as FINISH_REASON_WALKOVER,
    _apply_finish_outcome,
)
from .umpire_overlay_sync import _set_live_super_tiebreak_flag


def _maybe_backfill_match_bracket_context(match: Match) -> dict:
    """Fill missing group/phase data for mobile-created matches."""
    if not match.tournament_id or not match.player1_name or not match.player2_name:
        return {"group_id": match.bracket_group_id, "phase": match.phase, "warning": None}
    if match.bracket_group_id and match.phase:
        return {"group_id": match.bracket_group_id, "phase": match.phase, "warning": None}

    bracket_ctx = detect_bracket_context(match.player1_name, match.player2_name, match.tournament_id)
    if not match.bracket_group_id and bracket_ctx.get("group_id"):
        match.bracket_group_id = bracket_ctx["group_id"]
    if not match.phase and bracket_ctx.get("phase"):
        match.phase = bracket_ctx["phase"]
    return bracket_ctx


def _link_match_schedule_if_possible(match: Match, *, status: str) -> None:
    """Attach the real match row to a schedule slot when bracket context is known."""
    if not match.id or not match.tournament_id or not match.player1_name or not match.player2_name:
        return
    if not match.schedule_id and not match.bracket_group_id and not match.phase:
        return
    link_schedule_to_match(
        match.tournament_id,
        match.id,
        schedule_id=match.schedule_id,
        player1_name=match.player1_name,
        player2_name=match.player2_name,
        phase=match.phase,
        bracket_group_id=match.bracket_group_id,
        status=status,
    )


def _finalize_match_record(match: Match, data: dict) -> None:
    """Apply finish fields on the row. Caller commits."""
    _apply_finish_outcome(match, data)
    _maybe_backfill_match_bracket_context(match)
    match.status = "finished"
    match.updated_at = utc_now_iso()


def _dispatch_match_finished_emails(match: Match, state_snapshot: dict) -> None:
    """Send match report and optional tournament summary off the umpire's HTTP request."""
    tournament_id = int(match.tournament_id)
    match_snapshot = SimpleNamespace(
        id=match.id,
        court_id=match.court_id,
        player1_name=match.player1_name,
        player2_name=match.player2_name,
        phase=match.phase,
        sets_history=match.sets_history,
        finish_reason=match.finish_reason,
        winner_name=match.winner_name,
        injured_player_name=match.injured_player_name,
        result_note=match.result_note,
    )
    app = current_app._get_current_object()

    def send_reports() -> None:
        try:
            with app.app_context():
                from .email_reports import maybe_send_tournament_summary, send_match_report

                tournament = fetch_tournament(tournament_id)
                send_match_report(match_snapshot, state_snapshot, tournament)
                maybe_send_tournament_summary(tournament_id)
        except Exception as e:
            logger.warning("email_report_failed", error=str(e))

    if app.config.get("TESTING"):
        send_reports()
    else:
        threading.Thread(target=send_reports, name="match-finished-email", daemon=True).start()


def _publish_match_finished(match: Match) -> None:
    """Schedule, overlay, history, knockout, emails — same path as POST /finish."""
    match_id = match.id
    if match.finish_reason == FINISH_REASON_TEST:
        unlink_schedule_from_match(match_id)
    else:
        _link_match_schedule_if_possible(match, status="completed")

    kort_id = match.court_id
    if kort_id:
        court_state = ensure_court_state(kort_id)
        detected_category = None
        try:
            if match.tournament_id:
                p1 = first_row_where(Player, tournament_id=match.tournament_id, name=match.player1_name)
                p2 = first_row_where(Player, tournament_id=match.tournament_id, name=match.player2_name)
                if p1 and p2 and p1.category and p2.category and p1.category == p2.category:
                    detected_category = p1.category
        except Exception as e:
            logger.warning("category_detection_failed", error=str(e))

        recorded_duration_ms = getattr(match.statistics, "match_duration_ms", None) if match.statistics else None
        sets_history = json.loads(match.sets_history) if match.sets_history else []
        with STATE_LOCK:
            court_state["match_status"]["active"] = False
            court_state["match_status"]["last_completed"] = utc_now_iso()
            _set_live_super_tiebreak_flag(court_state, False)
            if sets_history:
                sets_detail = []
                for idx, set_score in enumerate(sets_history):
                    set_num = idx + 1
                    p1g = set_score.get("player1_games", 0)
                    p2g = set_score.get("player2_games", 0)
                    tb_loser = set_score.get("tiebreak_loser_points")
                    is_stb = set_score.get("is_super_tiebreak", False)
                    sets_detail.append({"p1": p1g, "p2": p2g, "tb": tb_loser, "stb": is_stb})
                    if is_stb:
                        court_state["tie"]["A"] = p1g
                        court_state["tie"]["B"] = p2g
                        court_state["tie"]["visible"] = True
                    else:
                        court_state["A"][f"set{set_num}"] = p1g
                        court_state["B"][f"set{set_num}"] = p2g
                court_state["sets_detail"] = sets_detail
                non_stb_count = sum(1 for s in sets_history if not s.get("is_super_tiebreak", False))
                court_state["current_set"] = non_stb_count + 1
                for i in range(non_stb_count + 1, 4):
                    court_state["A"][f"set{i}"] = 0
                    court_state["B"][f"set{i}"] = 0

            meta = court_state.setdefault("history_meta", {})
            meta["match_id"] = match_id
            meta["stats_mode"] = court_state.get("stats_mode")
            meta["finish_reason"] = match.finish_reason or FINISH_REASON_NORMAL
            meta["winner_name"] = match.winner_name
            meta["injured_player_name"] = match.injured_player_name
            meta["result_note"] = match.result_note
            if detected_category:
                meta["category"] = detected_category
            if match.phase:
                meta["phase"] = match.phase

            mtime = court_state.setdefault("match_time", {})
            if recorded_duration_ms:
                mtime["seconds"] = recorded_duration_ms // 1000
            elif mtime.get("started_ts"):
                started = parse_iso_datetime(mtime["started_ts"])
                mtime["seconds"] = int((datetime.now(UTC) - started).total_seconds())
            state_snapshot = copy.deepcopy(court_state)

        if match.finish_reason != FINISH_REASON_TEST:
            add_match_to_history(kort_id, state_snapshot)
        if match.finish_reason != FINISH_REASON_TEST and match.phase == "Grupowa" and match.tournament_id:
            try:
                maybe_generate_knockout_from_completed_groups(match.tournament_id)
            except Exception as e:
                logger.warning("knockout_generation_failed", error=str(e))
        if match.finish_reason != FINISH_REASON_TEST and is_knockout_stage_phase(match.phase) and match.tournament_id:
            try:
                advance_knockout(match_id, match.tournament_id)
            except Exception as e:
                logger.warning("knockout_advance_failed", error=str(e))
        if match.finish_reason != FINISH_REASON_TEST and match.tournament_id:
            _dispatch_match_finished_emails(match, state_snapshot)

        emit_score_update(kort_id, court_state)
        with STATE_LOCK:
            court_state["A"] = _empty_player_state()
            court_state["B"] = _empty_player_state()
            court_state["current_set"] = 1
            _set_live_super_tiebreak_flag(court_state, False)
            court_state["serve"] = None
            court_state["tie"] = {"A": 0, "B": 0, "visible": None, "locked": False}
            court_state["stats"] = {}
            court_state["stats_mode"] = None
            court_state["history_meta"] = {}
            reset_live_set_columns(court_state)

        def emit_cleared():
            emit_score_update(kort_id, court_state)

        if current_app.config.get("TESTING"):
            emit_cleared()
        else:
            threading.Timer(5.0, emit_cleared).start()

    logger.info("match_finished", match_id=match_id, kort=kort_id)
    if match.tournament_id:
        emit_office_invalidation(match.tournament_id, ["results", "schedule", "groups", "dashboard"])
