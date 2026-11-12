"""Real-time umpire point/game/set event processing and SSE live court broadcast."""
from __future__ import annotations

from datetime import datetime, UTC

from ..config import logger
from ..database import (
    commit_writes,
    get_row,
    latest_match_on_court,
    latest_match_with_uuid,
    rollback_writes,
)
from ..db_models import Match, utc_now_iso
from .court_manager import STATE_LOCK, ensure_court_state
from .device_alerts import battery_percent
from .director_commands import tablet_presence
from .event_broker import emit_score_update
from .live_state import store_live_state
from .umpire_client_meta import _clean_client_text, _request_client_meta
from .umpire_overlay_sync import (
    _apply_serve_from_payload,
    _apply_umpire_put_sets,
    _match_has_recorded_progress,
    _raw_points_to_tennis,
    _refresh_live_overlay_meta_from_match,
    _score_payload_is_zeroed,
    _sync_court_match_timer_from_match,
    _sync_live_score_to_court_state,
)
from .umpire_roster import _apply_db_flags_to_court_state


def process_umpire_match_event(kort_id: str, data: dict) -> tuple[dict, int]:
    """Validate and apply a live match event onto court state, presence, and SSE."""
    event_type = data.get("event_type", "")
    logger.info("match_event", event_type=event_type, kort=kort_id)

    score = data.get("score") or {}
    player1 = data.get("player1") or {}
    player2 = data.get("player2") or {}
    if not all(isinstance(part, dict) for part in (score, player1, player2)):
        return {"error": "Invalid payload"}, 400
    try:
        raw_pts_a = int(score.get("player1_points") or 0)
        raw_pts_b = int(score.get("player2_points") or 0)
    except (TypeError, ValueError):
        return {"error": "Invalid score"}, 400

    is_tiebreak = bool(score.get("is_tiebreak", False))
    is_super_tiebreak = bool(score.get("is_super_tiebreak", False))
    event_match_id = data.get("match_id")
    event_client_uuid = _clean_client_text(data.get("client_match_uuid"), 80)

    active_match = get_row(Match, event_match_id) if event_match_id else None
    if not active_match and event_client_uuid:
        active_match = latest_match_with_uuid(event_client_uuid, by_update=True)
    names_its_match = active_match is not None
    if not active_match:
        active_match = latest_match_on_court(kort_id)

    restore_match_score = bool(
        active_match and _match_has_recorded_progress(active_match) and _score_payload_is_zeroed(score)
    )
    event_meta = _request_client_meta(data)
    tablet_presence.record(
        session_court_id=kort_id,
        match_id=active_match.id if active_match else event_match_id,
        client_match_uuid=event_client_uuid or (active_match.client_match_uuid if active_match else None),
        player1_name=(player1.get("full_name") or player1.get("name")),
        player2_name=(player2.get("full_name") or player2.get("name")),
        app_version=event_meta.get("app_version"),
        platform=event_meta.get("platform"),
        device=event_meta.get("device"),
        device_model=event_meta.get("device_model"),
        device_manufacturer=event_meta.get("device_manufacturer"),
        snapshot={
            "court_id": kort_id,
            "player1_name": player1.get("full_name") or player1.get("name"),
            "player2_name": player2.get("full_name") or player2.get("name"),
            "player1_sets": score.get("player1_sets"),
            "player2_sets": score.get("player2_sets"),
            "player1_games": score.get("player1_games"),
            "player2_games": score.get("player2_games"),
            "player1_points": score.get("player1_points"),
            "player2_points": score.get("player2_points"),
            "sets_history": score.get("sets_history"),
            "is_tiebreak": score.get("is_tiebreak"),
            "is_super_tiebreak": score.get("is_super_tiebreak"),
            "is_player1_serving": player1.get("is_serving"),
        },
    )

    expected_court = str(active_match.court_id or "").strip() if active_match else ""
    if active_match and expected_court and expected_court != kort_id:
        logger.info(
            "stale_court_match_event_ignored",
            match_id=active_match.id,
            event_court=kort_id,
            match_court=expected_court,
        )
        return {
            "success": True,
            "stale_court": True,
            "expected_court_id": expected_court,
        }, 200

    if names_its_match and active_match.status == "finished":
        logger.info(
            "finished_match_event_ignored",
            match_id=active_match.id,
            event_type=event_type,
            kort=kort_id,
        )
        return {"success": True, "match_finished": True}, 200

    court_state = ensure_court_state(kort_id)
    with STATE_LOCK:
        _apply_serve_from_payload(court_state, data)

        if player1.get("name"):
            court_state["A"]["surname"] = player1["name"]
            if not court_state["A"].get("full_name"):
                court_state["A"]["full_name"] = player1["name"]
        if player1.get("full_name"):
            court_state["A"]["full_name"] = player1["full_name"]
        if player2.get("name"):
            court_state["B"]["surname"] = player2["name"]
            if not court_state["B"].get("full_name"):
                court_state["B"]["full_name"] = player2["name"]
        if player2.get("full_name"):
            court_state["B"]["full_name"] = player2["full_name"]

        flag_tid = (active_match.tournament_id if active_match else None) or court_state.get("tournament_id")
        _apply_db_flags_to_court_state(
            court_state,
            flag_tid,
            court_state["A"].get("full_name") or court_state["A"].get("surname"),
            court_state["B"].get("full_name") or court_state["B"].get("surname"),
        )

        if restore_match_score:
            _sync_live_score_to_court_state(court_state, active_match, score)
            court_state["match_status"]["active"] = True
            _sync_court_match_timer_from_match(court_state, active_match)
        else:
            if is_tiebreak or is_super_tiebreak:
                court_state["A"]["points"] = "0"
                court_state["B"]["points"] = "0"
                court_state["tie"]["A"] = raw_pts_a
                court_state["tie"]["B"] = raw_pts_b
                court_state["tie"]["visible"] = True
            else:
                disp_a, disp_b = _raw_points_to_tennis(raw_pts_a, raw_pts_b)
                court_state["A"]["points"] = disp_a
                court_state["B"]["points"] = disp_b
                court_state["tie"]["A"] = 0
                court_state["tie"]["B"] = 0
                court_state["tie"]["visible"] = None

            _apply_umpire_put_sets(court_state, score, is_super_tiebreak=is_super_tiebreak)
            match_finished = bool(score.get("match_finished", False))
            stats_mode = score.get("stats_mode")
            if stats_mode:
                court_state["stats_mode"] = stats_mode
            court_state["match_status"]["active"] = not match_finished
            if match_finished:
                court_state["match_status"]["last_completed"] = utc_now_iso()

        _refresh_live_overlay_meta_from_match(court_state, active_match)

        live_stats = data.get("stats")
        if live_stats:
            court_state["stats"] = {
                "player_a": _side_stats(live_stats, "player1"),
                "player_b": _side_stats(live_stats, "player2"),
            }

        court_state["updated"] = utc_now_iso()
        level = battery_percent(data.get("battery_level"))
        if level is not None:
            court_state["battery_level"] = level
        is_charging = data.get("is_charging")
        if is_charging is not None:
            court_state["is_charging"] = bool(is_charging)

    if (
        active_match
        and active_match.status == "in_progress"
        and not restore_match_score
        and not bool(score.get("match_finished", False))
    ):
        try:
            store_live_state(active_match, score, court_state.get("serve"))
            commit_writes()
        except Exception as exc:
            rollback_writes()
            logger.warning("live_state_store_failed", match_id=active_match.id, error=str(exc))

    emit_score_update(kort_id, court_state)
    return {
        "success": True,
        "message": "Event processed",
        "event_id": f"evt_{datetime.now(UTC).timestamp()}",
    }, 200


def _side_stats(live_stats: dict, prefix: str) -> dict:
    return {
        "aces": live_stats.get(f"{prefix}_aces", 0),
        "double_faults": live_stats.get(f"{prefix}_double_faults", 0),
        "winners": live_stats.get(f"{prefix}_winners", 0),
        "forced_errors": live_stats.get(f"{prefix}_forced_errors"),
        "unforced_errors": live_stats.get(f"{prefix}_unforced_errors", 0),
        "first_serves_in": live_stats.get(f"{prefix}_first_serves_in"),
        "first_serves_total": live_stats.get(f"{prefix}_first_serves_total"),
        "first_serve_pct": live_stats.get(f"{prefix}_first_serve_pct", 0),
        "second_serves_in": live_stats.get(f"{prefix}_second_serves_in"),
        "second_serves_total": live_stats.get(f"{prefix}_second_serves_total"),
        "second_serve_pct": live_stats.get(f"{prefix}_second_serve_pct"),
    }
