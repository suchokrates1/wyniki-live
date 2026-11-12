"""Live overlay score and serve synchronization from umpire updates."""
from __future__ import annotations

import json

from ..db_models import Match
from .court_manager import reset_live_set_columns
from .live_state import read_live_state, set_tiebreak_due
from .match_timer import sync_court_match_timer_from_match
from .umpire_overlay_meta import (
    _apply_live_overlay_meta as _apply_live_overlay_meta,
    _refresh_live_overlay_meta_from_match as _refresh_live_overlay_meta_from_match,
    _resolve_live_overlay_category as _resolve_live_overlay_category,
    _schedule_context_for_match as _schedule_context_for_match,
)


def _serve_from_payload(data: dict | None) -> str | None:
    data = data if isinstance(data, dict) else {}
    raw = data.get("serve")
    if raw in ("A", "B"):
        return raw
    if raw in (1, "1", "player1"):
        return "A"
    if raw in (2, "2", "player2"):
        return "B"
    raw_player1 = data.get("player1")
    raw_player2 = data.get("player2")
    player1 = raw_player1 if isinstance(raw_player1, dict) else {}
    player2 = raw_player2 if isinstance(raw_player2, dict) else {}
    if player1.get("is_serving") is True:
        return "A"
    if player2.get("is_serving") is True:
        return "B"
    return None


def _apply_serve_from_payload(court_state: dict, data: dict | None) -> None:
    """Keep the overlay serve ball across PUT-only syncs, not just match-events."""
    serve = _serve_from_payload(data)
    if serve:
        court_state["serve"] = serve


def _sync_court_match_timer_from_match(court_state: dict, match: Match) -> None:
    """Keep in-memory court timer consistent for live overlay rendering."""
    sync_court_match_timer_from_match(court_state, match)


def _set_live_super_tiebreak_flag(court_state: dict, is_active: bool) -> None:
    """Expose whether the current live frame is in a super tiebreak."""
    court_state["super_tiebreak_active"] = bool(is_active)


def _raw_points_to_tennis(raw_a: int, raw_b: int) -> tuple[str, str]:
    """Convert raw point integers to tennis display values."""
    display = ["0", "15", "30", "40"]
    if raw_a <= 3 and raw_b <= 3 and not (raw_a == 3 and raw_b == 3):
        return display[raw_a], display[raw_b]
    if raw_a == raw_b:
        return "40", "40"
    if raw_a > raw_b:
        return "ADV", "40"
    return "40", "ADV"


def _paint_live_points(
    court_state: dict,
    raw_a: int,
    raw_b: int,
    *,
    is_tiebreak: bool,
    is_super_tiebreak: bool,
) -> None:
    """Write overlay point columns from tablet raw integers."""
    if is_tiebreak or is_super_tiebreak:
        court_state["A"]["points"] = "0"
        court_state["B"]["points"] = "0"
        court_state["tie"]["A"] = int(raw_a)
        court_state["tie"]["B"] = int(raw_b)
        court_state["tie"]["visible"] = True
        return
    disp_a, disp_b = _raw_points_to_tennis(int(raw_a), int(raw_b))
    court_state["A"]["points"] = disp_a
    court_state["B"]["points"] = disp_b
    court_state["tie"]["A"] = 0
    court_state["tie"]["B"] = 0
    court_state["tie"]["visible"] = False


def _apply_umpire_put_sets(court_state: dict, score: dict, *, is_super_tiebreak: bool) -> None:
    """Write live set columns from an umpire PUT. Always drop leftover columns first."""
    games_a = int(score.get("player1_games", 0))
    games_b = int(score.get("player2_games", 0))
    court_state["A"]["current_games"] = games_a
    court_state["B"]["current_games"] = games_b

    sets_a = int(score.get("player1_sets", 0))
    sets_b = int(score.get("player2_sets", 0))
    match_finished = bool(score.get("match_finished", False))
    current_set = (sets_a + sets_b) if match_finished else (sets_a + sets_b + 1)
    court_state["current_set"] = current_set
    _set_live_super_tiebreak_flag(court_state, is_super_tiebreak and not match_finished)

    reset_live_set_columns(court_state)

    sets_history = score.get("sets_history") or []
    if sets_history:
        for sh in sets_history:
            sn = int(sh.get("set_number", 0))
            is_stb = bool(sh.get("is_super_tiebreak", False))
            if 1 <= sn <= 3 and not is_stb:
                court_state["A"][f"set{sn}"] = int(sh.get("player1_games", 0))
                court_state["B"][f"set{sn}"] = int(sh.get("player2_games", 0))

        court_state["sets_detail"] = [
            {
                "p1": int(sh.get("player1_games", 0)),
                "p2": int(sh.get("player2_games", 0)),
                "tb": sh.get("tiebreak_loser_points"),
                "stb": bool(sh.get("is_super_tiebreak", False)),
            }
            for sh in sets_history
        ]

    completed_set_nums = {int(sh.get("set_number", 0)) for sh in sets_history} if sets_history else set()
    if current_set not in completed_set_nums:
        court_state["A"][f"set{current_set}"] = games_a
        court_state["B"][f"set{current_set}"] = games_b


def _sync_live_score_to_court_state(court_state: dict, match: Match, score: dict | None = None) -> None:
    """Mirror match score payload into in-memory court state for overlays/live views."""
    score = score or {}
    court_state["A"]["current_games"] = int(match.player1_games or 0)
    court_state["B"]["current_games"] = int(match.player2_games or 0)

    reset_live_set_columns(court_state)
    court_state["tie"]["A"] = 0
    court_state["tie"]["B"] = 0
    court_state["tie"]["visible"] = False

    sets_history = json.loads(match.sets_history) if match.sets_history else []
    sets_detail = []
    for idx, set_score in enumerate(sets_history):
        set_num = idx + 1
        p1_games = int(set_score.get("player1_games", 0) or 0)
        p2_games = int(set_score.get("player2_games", 0) or 0)
        tb_loser = set_score.get("tiebreak_loser_points")
        is_stb = bool(set_score.get("is_super_tiebreak", False))

        sets_detail.append({"p1": p1_games, "p2": p2_games, "tb": tb_loser, "stb": is_stb})
        if is_stb:
            court_state["tie"]["A"] = p1_games
            court_state["tie"]["B"] = p2_games
            court_state["tie"]["visible"] = True
        elif set_num <= 3:
            court_state["A"][f"set{set_num}"] = p1_games
            court_state["B"][f"set{set_num}"] = p2_games

    court_state["sets_detail"] = sets_detail
    non_stb_count = sum(1 for set_score in sets_history if not set_score.get("is_super_tiebreak", False))
    current_set = max(1, non_stb_count + 1)
    court_state["current_set"] = current_set
    completed_set_nums = {
        int(set_score.get("set_number", idx + 1) or (idx + 1))
        for idx, set_score in enumerate(sets_history)
        if not set_score.get("is_super_tiebreak", False)
    }
    if match.status != "finished" and current_set not in completed_set_nums and current_set <= 3:
        court_state["A"][f"set{current_set}"] = int(match.player1_games or 0)
        court_state["B"][f"set{current_set}"] = int(match.player2_games or 0)
    stored = read_live_state(match) if not score and match.status == "in_progress" else None
    live_stb = match.status == "in_progress" and (
        bool(score.get("is_super_tiebreak", False))
        or bool(stored and stored.get("stb"))
        or non_stb_count >= 2
    )
    _set_live_super_tiebreak_flag(court_state, live_stb)
    if match.status == "in_progress":
        games_a = int(match.player1_games or 0)
        games_b = int(match.player2_games or 0)
        if "is_tiebreak" in score:
            in_tiebreak = bool(score.get("is_tiebreak"))
        elif stored is not None:
            in_tiebreak = bool(stored.get("tb"))
        else:
            in_tiebreak = set_tiebreak_due(match, games_a, games_b)
        _paint_live_points(
            court_state,
            int(stored["p1"]) if stored else int(match.player1_points or 0),
            int(stored["p2"]) if stored else int(match.player2_points or 0),
            is_tiebreak=in_tiebreak,
            is_super_tiebreak=live_stb,
        )
        if stored and stored.get("serve") in ("A", "B"):
            court_state["serve"] = stored["serve"]


def _match_has_recorded_progress(match: Match | None) -> bool:
    if not match:
        return False
    if any(
        int(getattr(match, field) or 0)
        for field in ("player1_sets", "player2_sets", "player1_games", "player2_games", "player1_points", "player2_points")
    ):
        return True
    if not match.sets_history:
        return False
    try:
        return bool(json.loads(match.sets_history))
    except Exception:
        return bool(match.sets_history)


def _score_payload_has_live_data(score: dict | None) -> bool:
    if not isinstance(score, dict) or not score:
        return False
    return any(
        key in score
        for key in (
            "player1_sets",
            "player2_sets",
            "player1_games",
            "player2_games",
            "player1_points",
            "player2_points",
            "sets_history",
            "is_tiebreak",
            "is_super_tiebreak",
        )
    )


def _score_payload_is_zeroed(score: dict | None) -> bool:
    if not _score_payload_has_live_data(score):
        return True
    score = score or {}
    numeric_fields = ("player1_sets", "player2_sets", "player1_games", "player2_games", "player1_points", "player2_points")
    if any(int(score.get(field, 0) or 0) for field in numeric_fields):
        return False
    if score.get("sets_history"):
        return False
    return not bool(score.get("is_tiebreak") or score.get("is_super_tiebreak"))
