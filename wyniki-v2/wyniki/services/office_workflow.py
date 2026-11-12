"""Shared office/admin workflow helpers for dashboards and finished-match entry."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from flask import jsonify

from ..database import (
    GROUP_PHASE,
    advance_knockout,
    compute_groups_progress,
    correct_knockout_result,
    fetch_bracket_groups,
    fetch_bracket_knockout,
    fetch_courts_for_tournament,
    fetch_tournament,
    fetch_tournament_schedule,
    finished_pair_match,
    first_row_where,
    get_tournament_court_streams,
    get_tournament_quick_info,
    is_group_stage_phase,
    is_knockout_stage_phase,
    knockout_correction_blocker,
    add_row,
    commit_writes,
    flush_writes,
    link_schedule_to_match,
    maybe_generate_knockout_from_completed_groups,
    normalize_group_stage_phase,
    rows_where,
    _is_knockout_placeholder_name,
)
from ..db_models import Match, MatchHistory, TournamentSchedule, utc_now_iso
from ..services.match_result import winner_by_sets


class OfficeWorkflowError(ValueError):
    def __init__(self, message: str, status_code: int = 400, extra: dict[str, Any] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.extra = extra or {}

    def response(self):
        return jsonify({"error": str(self), **self.extra}), self.status_code


def _is_knockout_phase(phase: str | None) -> bool:
    return is_knockout_stage_phase(phase)


def _normalize_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _recorded_at(data: dict[str, Any], now: str) -> str:
    """The end time the office sent. A missing one means now; anything else is refused."""
    raw = data.get("ended_at")
    if raw in (None, ""):
        return now
    if not isinstance(raw, str):
        raise OfficeWorkflowError("ended_at must be an ISO timestamp")
    try:
        return datetime.fromisoformat(raw.strip()).isoformat()
    except ValueError:
        raise OfficeWorkflowError("ended_at must be an ISO timestamp") from None


def _json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _bracket_category_from_group(group_name: str | None) -> str:
    label = (group_name or '').strip()
    if ' — ' in label:
        return label.split(' — ', 1)[0].strip()
    return label


def _shown_score(finish_reason: str | None, result_note: str | None, sets_history: list[dict[str, Any]]) -> str:
    """A walkover has no games to print. The note says who was given the match."""
    if (finish_reason or "") == "walkover" and not sets_history:
        return (result_note or "").strip() or "Walkower"
    return _score_text(sets_history)


def _score_text(sets_history: list[dict[str, Any]]) -> str:
    parts = []
    for set_score in sets_history:
        p1 = set_score.get('player1_games', 0)
        p2 = set_score.get('player2_games', 0)
        if set_score.get('is_super_tiebreak'):
            parts.append(f"STB {p1}:{p2}")
        else:
            tb = set_score.get('tiebreak_loser_points')
            parts.append(f"{p1}:{p2}" + (f"({tb})" if tb is not None else ''))
    return '  '.join(parts)


def _normalize_name_key(value: str | None) -> str:
    return ' '.join((value or '').strip().lower().split())


def _player_pair_key(player1_name: str | None, player2_name: str | None) -> tuple[str, str]:
    first, second = sorted((_normalize_name_key(player1_name), _normalize_name_key(player2_name)))
    return first, second


def _group_players_index(groups: list[dict[str, Any]]) -> tuple[dict[int, str], dict[str, set[int]]]:
    group_lookup = {int(group['id']): group['name'] for group in groups}
    player_groups: dict[str, set[int]] = {}
    for group in groups:
        group_id = int(group['id'])
        for player in group.get('players', []):
            player_groups.setdefault(_normalize_name_key(player.get('name')), set()).add(group_id)
    return group_lookup, player_groups


def _infer_group_id_for_players(
    player1_name: str | None,
    player2_name: str | None,
    player_groups: dict[str, set[int]],
) -> int | None:
    player1_group_ids = player_groups.get(_normalize_name_key(player1_name), set())
    player2_group_ids = player_groups.get(_normalize_name_key(player2_name), set())
    common = sorted(player1_group_ids & player2_group_ids)
    return common[0] if common else None


def _history_sets_payload(history: MatchHistory) -> list[dict[str, Any]]:
    sets_history = _json_loads(history.sets_history, None)
    if isinstance(sets_history, list) and sets_history:
        return sets_history

    score_a = _json_loads(history.score_a, [])
    score_b = _json_loads(history.score_b, [])
    if not isinstance(score_a, list) or not isinstance(score_b, list):
        return []
    sets = []
    for index, (player1_games, player2_games) in enumerate(zip(score_a, score_b), start=1):
        sets.append({
            "set_number": index,
            "player1_games": int(player1_games),
            "player2_games": int(player2_games),
        })
    return sets


def _history_sets_score(sets_history: list[dict[str, Any]]) -> tuple[int, int]:
    player1_sets = 0
    player2_sets = 0
    for set_score in sets_history:
        if int(set_score.get('player1_games', 0)) > int(set_score.get('player2_games', 0)):
            player1_sets += 1
        elif int(set_score.get('player2_games', 0)) > int(set_score.get('player1_games', 0)):
            player2_sets += 1
    return player1_sets, player2_sets


def _office_history_payload(
    history: MatchHistory,
    group_lookup: dict[int, str],
    player_groups: dict[str, set[int]],
) -> dict[str, Any]:
    sets_history = _history_sets_payload(history)
    player1_sets, player2_sets = _history_sets_score(sets_history)
    group_id = (
        _infer_group_id_for_players(history.player_a, history.player_b, player_groups)
        if history.phase == 'Grupowa'
        else None
    )
    group_name = group_lookup.get(group_id) if group_id else None
    winner_name = history.winner_name if history.winner_name in {history.player_a, history.player_b} else None
    if not winner_name:
        winner_name = winner_by_sets(history.player_a, history.player_b, player1_sets, player2_sets)
    return {
        "id": history.id,
        "source": "history",
        "match_id": history.match_id,
        "court_id": history.kort_id,
        "player1_name": history.player_a,
        "player2_name": history.player_b,
        "winner_name": winner_name,
        "status": 'finished',
        "phase": history.phase,
        "is_group_stage": bool(group_id or is_group_stage_phase(history.phase)),
        "finish_reason": history.finish_reason or 'normal',
        "injured_player_name": history.injured_player_name,
        "result_note": history.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": history.category or _bracket_category_from_group(group_name),
        "player1_sets": player1_sets,
        "player2_sets": player2_sets,
        "sets_history": sets_history,
        "score_text": _shown_score(history.finish_reason, history.result_note, sets_history),
        "created_at": history.ended_ts,
        "updated_at": history.ended_ts,
    }


def office_result_outcome(
    data: dict[str, Any],
    player1_name: str,
    player2_name: str,
) -> dict[str, Any]:
    """finish_reason / winner / retired player / note for an office result.

    Walkover and retirement ("krecz") name the winner explicitly; a normal result
    leaves the winner to the sets.
    """
    if _normalize_bool(data.get('walkover', False)):
        winner = (data.get('winner_name') or '').strip()
        return {"finish_reason": "walkover", "winner_name": winner, "injured_player_name": None, "result_note": "Walkower"}
    if _normalize_bool(data.get('retirement', False)):
        retired = (data.get('retired_player_name') or '').strip()
        if retired not in {player1_name, player2_name}:
            raise ValueError('Retired player must be one of the match players')
        winner = player2_name if retired == player1_name else player1_name
        return {"finish_reason": "retirement", "winner_name": winner, "injured_player_name": retired, "result_note": f"Krecz: {retired}"}
    return {"finish_reason": "normal", "winner_name": None, "injured_player_name": None, "result_note": None}


def _required_winner(player1_name: str, player2_name: str, player1_sets: int, player2_sets: int) -> str:
    """The winner of a result being saved; a level score has none and is refused."""
    winner = winner_by_sets(player1_name, player2_name, player1_sets, player2_sets)
    if not winner:
        raise OfficeWorkflowError('Match winner is required')
    return winner


def _blank(value: Any) -> bool:
    return value is None or str(value).strip() == ''


def _normalize_office_sets(
    data: dict[str, Any],
    player1_name: str,
    player2_name: str,
) -> tuple[list[dict[str, Any]], int, int]:
    retirement = _normalize_bool(data.get('retirement', False))
    if _normalize_bool(data.get('walkover', False)):
        winner_name = (data.get('winner_name') or '').strip()
        if winner_name not in {player1_name, player2_name}:
            raise ValueError('Winner is required for walkover')
        return [], 0, 0

    raw_sets = data.get('sets') or []
    sets_history = []
    player1_sets = 0
    player2_sets = 0
    parsed_sets = []
    # A row the form left empty is not a set. Anything else must be readable: dropping a
    # set that was typed wrong ("4", "x") used to save a different result than the one entered.
    blank_seen = False
    for raw_set in raw_sets:
        if not isinstance(raw_set, dict):
            raise ValueError('Set score is not readable')
        raw_p1, raw_p2 = raw_set.get('player1_games'), raw_set.get('player2_games')
        if _blank(raw_p1) and _blank(raw_p2):
            blank_seen = True
            continue
        if blank_seen:
            raise ValueError('Set scores must not skip a set')
        try:
            parsed_sets.append((raw_set, int(str(raw_p1).strip()), int(str(raw_p2).strip())))
        except (TypeError, ValueError):
            raise ValueError('Set score is not readable') from None
    for index, (raw_set, p1_games, p2_games) in enumerate(parsed_sets, start=1):
        if p1_games < 0 or p2_games < 0:
            raise ValueError('Set scores cannot be negative')
        interrupted = retirement and index == len(parsed_sets)
        if p1_games == p2_games and not interrupted:
            raise ValueError('Set cannot end in a draw')
        # After a retirement the last set is where play stopped: it is kept but not won.
        if interrupted:
            pass
        elif p1_games > p2_games:
            player1_sets += 1
        else:
            player2_sets += 1
        set_payload = {
            "set_number": index,
            "player1_games": p1_games,
            "player2_games": p2_games,
        }
        if raw_set.get('tiebreak_loser_points') not in (None, ''):
            set_payload['tiebreak_loser_points'] = int(raw_set.get('tiebreak_loser_points'))
        if _normalize_bool(raw_set.get('is_super_tiebreak', False)):
            set_payload['is_super_tiebreak'] = True
        sets_history.append(set_payload)

    if retirement:
        return sets_history, player1_sets, player2_sets
    if not sets_history:
        raise ValueError('At least one finished set is required')
    if player1_sets == player2_sets:
        raise ValueError('Match winner is required')
    return sets_history, player1_sets, player2_sets


def _sync_office_match_history(match: Match, group_name: str | None = None) -> None:
    sets_history = _json_loads(match.sets_history, [])
    score_a = [set_score.get('player1_games', 0) for set_score in sets_history]
    score_b = [set_score.get('player2_games', 0) for set_score in sets_history]
    history = first_row_where(MatchHistory, match_id=match.id)
    if not history:
        history = MatchHistory(match_id=match.id, duration_seconds=0)
        add_row(history)

    history.kort_id = match.court_id or f"office-{match.tournament_id}"
    history.ended_ts = match.updated_at or utc_now_iso()
    history.player_a = match.player1_name
    history.player_b = match.player2_name
    history.score_a = json.dumps(score_a)
    history.score_b = json.dumps(score_b)
    history.category = _bracket_category_from_group(group_name)
    history.phase = match.phase or 'Grupowa'
    history.sets_history = match.sets_history
    history.tournament_id = match.tournament_id
    history.finish_reason = match.finish_reason or 'normal'
    history.winner_name = match.winner_name
    history.injured_player_name = match.injured_player_name
    history.result_note = match.result_note


def _office_match_payload(
    match: Match,
    group_lookup: dict[int, str],
    player_groups: dict[str, set[int]] | None = None,
) -> dict[str, Any]:
    sets_history = _json_loads(match.sets_history, [])
    winner = match.winner_name if match.winner_name in {match.player1_name, match.player2_name} else (
        winner_by_sets(match.player1_name, match.player2_name, match.player1_sets, match.player2_sets)
    )
    group_id = int(match.bracket_group_id) if match.bracket_group_id else None
    if not group_id and player_groups and match.phase == 'Grupowa':
        group_id = _infer_group_id_for_players(match.player1_name, match.player2_name, player_groups)
    group_name = group_lookup.get(group_id) if group_id else None
    return {
        "id": match.id,
        "source": "match",
        "match_id": match.id,
        "court_id": match.court_id,
        "player1_name": match.player1_name,
        "player2_name": match.player2_name,
        "winner_name": winner if match.status == 'finished' else None,
        "status": match.status,
        "phase": match.phase,
        "is_group_stage": bool(group_id or is_group_stage_phase(match.phase)),
        "finish_reason": match.finish_reason or 'normal',
        "injured_player_name": match.injured_player_name,
        "result_note": match.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": _bracket_category_from_group(group_name) or match.phase,
        "player1_sets": match.player1_sets,
        "player2_sets": match.player2_sets,
        "sets_history": sets_history,
        "score_text": _shown_score(match.finish_reason, match.result_note, sets_history),
        "created_at": match.created_at,
        "updated_at": match.updated_at,
    }


def _office_knockout_item(
    slot: dict[str, Any],
    schedule_entry: dict[str, Any] | None,
    match_by_id: dict[int, Match],
) -> dict[str, Any]:
    match = None
    match_id = _normalize_int((schedule_entry or {}).get('match_id'), 0)
    if match_id:
        match = match_by_id.get(match_id)

    sets_history = _json_loads(match.sets_history, []) if match else []
    winner_name = (slot.get('winner_name') or '').strip()
    if match and match.status == 'finished':
        winner_name = match.winner_name or (
            winner_by_sets(match.player1_name, match.player2_name, match.player1_sets, match.player2_sets) or ''
        )
    player1_name = (slot.get('player1_name') or (schedule_entry or {}).get('player1_name') or '').strip()
    player2_name = (slot.get('player2_name') or (schedule_entry or {}).get('player2_name') or '').strip()
    ready = bool(
        player1_name
        and player2_name
        and not _is_knockout_placeholder_name(player1_name)
        and not _is_knockout_placeholder_name(player2_name)
    )
    schedule_status = (schedule_entry or {}).get('status') or 'draft'
    status = 'completed' if winner_name else schedule_status
    phase = slot.get('phase') or (schedule_entry or {}).get('phase') or 'Pucharowa'
    return {
        "id": int(slot.get('id') or 0),
        "slot_id": int(slot.get('id') or 0),
        "source_type": "knockout",
        "source_ref_id": int(slot.get('id') or 0),
        "schedule_id": (schedule_entry or {}).get('id'),
        "match_id": match.id if match else ((schedule_entry or {}).get('match_id') or None),
        "phase": phase,
        "category": _bracket_category_from_group(phase),
        "position": int(slot.get('position') or 1),
        "winner_to": slot.get('winner_to') or None,
        "loser_to": slot.get('loser_to') or None,
        "player1_name": player1_name,
        "player2_name": player2_name,
        "winner_name": winner_name or None,
        "status": status,
        "schedule_status": schedule_status,
        "ready": ready,
        "finish_reason": (match.finish_reason if match else slot.get('finish_reason')) or 'normal',
        "result_note": (match.result_note if match else slot.get('result_note')),
        "score_text": _shown_score(match.finish_reason, match.result_note, sets_history) if match else (slot.get('score_summary') or ''),
        "sets_history": sets_history,
        "day_date": (schedule_entry or {}).get('day_date') or '',
        "scheduled_time": (schedule_entry or {}).get('scheduled_time') or '',
        "court_id": (schedule_entry or {}).get('court_id') or '',
        "court_label": (schedule_entry or {}).get('court_label') or '',
        "notes_public": (schedule_entry or {}).get('notes_public') or '',
        "notes_internal": (schedule_entry or {}).get('notes_internal') or '',
    }


def _build_office_knockout_progress(
    tournament_id: int,
    schedule: list[dict[str, Any]],
    match_by_id: dict[int, Match],
) -> dict[str, Any]:
    schedule_by_ref = {
        int(entry.get('source_ref_id') or 0): entry
        for entry in schedule
        if entry.get('source_type') == 'knockout' and entry.get('source_ref_id')
    }
    matches = [
        _office_knockout_item(slot, schedule_by_ref.get(int(slot.get('id') or 0)), match_by_id)
        for slot in fetch_bracket_knockout(tournament_id)
    ]
    matches.sort(
        key=lambda item: (
            str(item.get('category') or ''),
            str(item.get('phase') or ''),
            int(item.get('position') or 0),
        )
    )
    expected = len(matches)
    finished = sum(1 for item in matches if item.get('winner_name'))
    ready = sum(1 for item in matches if item.get('ready') and not item.get('winner_name'))
    return {
        "expected_matches": expected,
        "finished_matches": finished,
        "remaining_matches": max(expected - finished, 0),
        "ready_matches": ready,
        "complete": expected > 0 and finished >= expected,
        "matches": matches,
    }


def _resolve_office_knockout_slot(
    tournament_id: int,
    data: dict[str, Any],
) -> tuple[dict[str, Any], TournamentSchedule | None]:
    schedule_id = _normalize_int(data.get('schedule_id'), 0)
    slot_id = _normalize_int(data.get('knockout_slot_id') or data.get('slot_id') or data.get('source_ref_id'), 0)
    schedule_entry = None

    if schedule_id:
        schedule_entry = first_row_where(
            TournamentSchedule,
            id=schedule_id,
            tournament_id=tournament_id,
        )
        if not schedule_entry:
            raise OfficeWorkflowError('Schedule entry not found', 404)
        if schedule_entry.match_id:
            raise OfficeWorkflowError(
                'This schedule slot already has a linked match. Edit the existing result instead.',
                409,
            )
        phase = str(schedule_entry.phase or data.get('phase') or '').strip()
        if is_group_stage_phase(phase):
            raise OfficeWorkflowError('Use the group result form for group-stage matches')
        slot_id = int(schedule_entry.source_ref_id or 0) or slot_id
        if not slot_id:
            return {
                'id': None,
                'phase': phase or 'Pucharowa',
                'player1_name': schedule_entry.player1_name,
                'player2_name': schedule_entry.player2_name,
                'position': 0,
            }, schedule_entry

    if slot_id:
        slot = next(
            (item for item in fetch_bracket_knockout(tournament_id) if int(item.get('id') or 0) == slot_id),
            None,
        )
        if not slot:
            raise OfficeWorkflowError('Knockout slot not found', 404)
        if slot.get('winner_name'):
            raise OfficeWorkflowError(
                'This knockout slot already has a result. Edit the existing result instead.',
                409,
            )
        if not schedule_entry:
            schedule_entry = first_row_where(
                TournamentSchedule,
                tournament_id=tournament_id,
                source_type='knockout',
                source_ref_id=slot_id,
            )
            if not schedule_entry and schedule_id:
                schedule_entry = first_row_where(
                    TournamentSchedule,
                    id=schedule_id,
                    tournament_id=tournament_id,
                )
        return slot, schedule_entry

    phase = str(data.get('phase') or '').strip()
    player1_name = str(data.get('player1_name') or '').strip()
    player2_name = str(data.get('player2_name') or '').strip()
    if phase and player1_name and player2_name and is_knockout_stage_phase(phase):
        return {
            'id': None,
            'phase': phase,
            'player1_name': player1_name,
            'player2_name': player2_name,
            'position': 0,
        }, schedule_entry

    raise OfficeWorkflowError('Knockout phase, players, schedule entry, or bracket slot is required')


def _create_office_knockout_match(tournament_id: int, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    slot, schedule_entry = _resolve_office_knockout_slot(tournament_id, data)
    player1_name = (slot.get('player1_name') or '').strip()
    player2_name = (slot.get('player2_name') or '').strip()
    if (
        not player1_name
        or not player2_name
        or _is_knockout_placeholder_name(player1_name)
        or _is_knockout_placeholder_name(player2_name)
    ):
        raise OfficeWorkflowError('Knockout slot does not have two confirmed players yet')

    requested_player1 = (data.get('player1_name') or player1_name).strip()
    requested_player2 = (data.get('player2_name') or player2_name).strip()
    if slot.get('id') and {requested_player1, requested_player2} != {player1_name, player2_name}:
        raise OfficeWorkflowError('Players must match the generated knockout slot')
    player1_name = requested_player1 or player1_name
    player2_name = requested_player2 or player2_name
    match_phase = str(slot.get('phase') or data.get('phase') or 'Pucharowa').strip()
    existing_match = finished_pair_match(tournament_id, match_phase, player1_name, player2_name)
    if existing_match:
        raise OfficeWorkflowError('This knockout match already has a result. Edit the existing result instead.', 409)

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
    except ValueError as exc:
        raise OfficeWorkflowError(str(exc)) from exc

    try:
        outcome = office_result_outcome(data, player1_name, player2_name)
    except ValueError as exc:
        raise OfficeWorkflowError(str(exc)) from exc
    winner_name = outcome["winner_name"] or ''
    if not winner_name:
        winner_name = _required_winner(player1_name, player2_name, player1_sets, player2_sets)

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or (schedule_entry.court_id if schedule_entry else '') or f"office-{tournament_id}"),
        player1_name=player1_name,
        player2_name=player2_name,
        status='finished',
        tournament_id=tournament_id,
        phase=match_phase,
        finish_reason=outcome["finish_reason"],
        winner_name=winner_name,
        injured_player_name=outcome["injured_player_name"],
        result_note=outcome["result_note"],
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=_recorded_at(data, now),
        updated_at=now,
    )
    add_row(match)
    flush_writes()
    _sync_office_match_history(match, match.phase)
    commit_writes()

    link_schedule_to_match(
        tournament_id,
        match.id,
        schedule_id=int(schedule_entry.id) if schedule_entry else None,
        player1_name=player1_name,
        player2_name=player2_name,
        phase=match.phase,
    )
    advance_knockout(match.id, tournament_id)

    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)
    return {
        "message": "Knockout match added",
        "match": _office_match_payload(match, group_lookup, player_groups),
        "knockout_generation": None,
        "dashboard": _build_office_dashboard(tournament_id, groups=groups),
    }, 201


def _create_office_group_match(tournament_id: int, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Create a finished group-stage match and link the schedule entry."""
    schedule_id = _normalize_int(data.get('schedule_id'), 0) or None
    group_id = _normalize_int(data.get('group_id'), 0)
    player1_name = (data.get('player1_name') or '').strip()
    player2_name = (data.get('player2_name') or '').strip()

    schedule_entry = None
    if schedule_id:
        schedule_entry = next(
            (entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)),
            None,
        )
        if not schedule_entry:
            raise OfficeWorkflowError('Schedule entry not found', 404)
        if schedule_entry.get("match_id"):
            raise OfficeWorkflowError(
                'This schedule slot already has a linked match. Edit the existing result instead.',
                409,
            )
        player1_name = player1_name or str(schedule_entry.get("player1_name") or "").strip()
        player2_name = player2_name or str(schedule_entry.get("player2_name") or "").strip()
        if not group_id and schedule_entry.get("bracket_group_id"):
            group_id = int(schedule_entry["bracket_group_id"])

    if not group_id or not player1_name or not player2_name or player1_name == player2_name:
        raise OfficeWorkflowError('Group and two different players are required')

    groups = fetch_bracket_groups(tournament_id)
    group = next((item for item in groups if int(item['id']) == group_id), None)
    if not group:
        raise OfficeWorkflowError('Group not found', 404)
    group_player_names = {player['name'] for player in group.get('players', [])}
    if player1_name not in group_player_names or player2_name not in group_player_names:
        raise OfficeWorkflowError('Both players must belong to the selected group')

    _, player_groups = _group_players_index(groups)
    pair_key = _player_pair_key(player1_name, player2_name)
    raw_phase = (data.get('phase') or (schedule_entry or {}).get('phase') or GROUP_PHASE).strip()
    if not is_group_stage_phase(raw_phase):
        raise OfficeWorkflowError('Unsupported group-stage phase')
    phase = normalize_group_stage_phase(raw_phase)

    existing_match = finished_pair_match(
        tournament_id, phase, player1_name, player2_name, bracket_group_id=group_id
    )
    if existing_match:
        raise OfficeWorkflowError(
            'This group match already has a result. Edit the existing result instead.',
            409,
        )

    for history in rows_where(MatchHistory, tournament_id=tournament_id):
        if normalize_group_stage_phase(history.phase) != phase:
            continue
        if _infer_group_id_for_players(history.player_a, history.player_b, player_groups) != group_id:
            continue
        if _player_pair_key(history.player_a, history.player_b) == pair_key:
            raise OfficeWorkflowError(
                'This group match already has a result. Edit the existing result instead.',
                409,
            )

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
        outcome = office_result_outcome(data, player1_name, player2_name)
    except ValueError as exc:
        raise OfficeWorkflowError(str(exc)) from exc

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or (schedule_entry or {}).get('court_id') or f"office-{tournament_id}"),
        player1_name=player1_name,
        player2_name=player2_name,
        status='finished',
        tournament_id=tournament_id,
        bracket_group_id=group_id,
        phase=phase,
        finish_reason=outcome["finish_reason"],
        winner_name=outcome["winner_name"],
        injured_player_name=outcome["injured_player_name"],
        result_note=outcome["result_note"],
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=_recorded_at(data, now),
        updated_at=now,
    )
    add_row(match)
    flush_writes()
    _sync_office_match_history(match, group.get('name'))
    commit_writes()
    link_schedule_to_match(
        tournament_id,
        match.id,
        schedule_id=schedule_id,
        player1_name=player1_name,
        player2_name=player2_name,
        phase=phase,
        bracket_group_id=group_id,
    )

    generation = (
        maybe_generate_knockout_from_completed_groups(tournament_id)
        if phase == GROUP_PHASE
        else {"status": "pending"}
    )
    return {
        "message": "Group match added",
        "match": _office_match_payload(match, {group_id: str(group.get('name') or '')}, player_groups),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id, groups=groups),
    }, 201


def _build_office_dashboard(
    tournament_id: int,
    *,
    groups: list[dict[str, Any]] | None = None,
    schedule: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    tournament = fetch_tournament(tournament_id)
    groups = groups if groups is not None else fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)
    progress_by_group = compute_groups_progress(tournament_id, groups)
    progress_groups = []
    expected_total = 0
    finished_total = 0

    match_rows = rows_where(Match, tournament_id=tournament_id)
    match_by_id = {int(match.id): match for match in match_rows}
    history_rows = rows_where(MatchHistory, tournament_id=tournament_id)
    schedule = schedule if schedule is not None else fetch_tournament_schedule(tournament_id)

    for group in groups:
        group_id = int(group['id'])
        expected, finished = progress_by_group.get(group_id, (0, 0))
        expected_total += expected
        finished_total += finished
        progress_groups.append({
            **group,
            "category": _bracket_category_from_group(group.get('name')),
            "expected_matches": expected,
            "finished_matches": finished,
            "remaining_matches": max(expected - finished, 0),
            "complete": expected > 0 and finished >= expected,
        })

    office_matches = [_office_match_payload(match, group_lookup, player_groups) for match in match_rows]
    included_match_ids = {int(match['match_id']) for match in office_matches if match.get('match_id')}
    for history in history_rows:
        if history.match_id and int(history.match_id) in included_match_ids:
            continue
        office_matches.append(_office_history_payload(history, group_lookup, player_groups))
    office_matches.sort(key=lambda match: str(match.get('updated_at') or match.get('created_at') or ''), reverse=True)
    return {
        "tournament": tournament,
        "progress": {
            "expected_matches": expected_total,
            "finished_matches": finished_total,
            "remaining_matches": max(expected_total - finished_total, 0),
            "complete": expected_total > 0 and finished_total >= expected_total,
            "groups": progress_groups,
            "knockout": _build_office_knockout_progress(tournament_id, schedule, match_by_id),
        },
        "matches": office_matches[:300],
        "schedule": schedule,
        "courts": fetch_courts_for_tournament(tournament_id),
        "quick_info": get_tournament_quick_info(tournament_id),
        "court_streams": get_tournament_court_streams(tournament_id),
    }


def _knockout_blocked(blocker: str) -> OfficeWorkflowError:
    return OfficeWorkflowError(
        f"The next match ({blocker}) already has a result; correct that one first",
        409,
        extra={"blocked_by": blocker},
    )


def _update_office_match(tournament_id: int, match_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Correct a finished result, by `matches.id` or (source=history) `match_history.id`."""
    source = (data.get('source') or 'match').strip().lower()
    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)

    if source == 'history':
        history = first_row_where(MatchHistory, id=match_id, tournament_id=tournament_id)
        if not history:
            raise OfficeWorkflowError("Match not found", 404)
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, history.player_a, history.player_b)
        outcome = office_result_outcome(data, history.player_a, history.player_b)
        history_winner = outcome["winner_name"] or _required_winner(history.player_a, history.player_b, player1_sets, player2_sets)
        if _is_knockout_phase(history.phase):
            blocker = knockout_correction_blocker(tournament_id, history.player_a, history.player_b, history.phase, history_winner)
            if blocker:
                raise _knockout_blocked(blocker)
        previous_history_winner = history.winner_name

        history.score_a = json.dumps([set_score.get('player1_games', 0) for set_score in sets_history])
        history.score_b = json.dumps([set_score.get('player2_games', 0) for set_score in sets_history])
        history.sets_history = json.dumps(sets_history)
        history.finish_reason = outcome["finish_reason"]
        history.winner_name = outcome["winner_name"]
        history.injured_player_name = outcome["injured_player_name"]
        history.result_note = outcome["result_note"]
        if history.match_id:
            match = first_row_where(Match, id=history.match_id, tournament_id=tournament_id)
            if match:
                match.status = 'finished'
                match.finish_reason = history.finish_reason
                match.winner_name = history.winner_name
                match.injured_player_name = history.injured_player_name
                match.result_note = history.result_note
                match.player1_sets = player1_sets
                match.player2_sets = player2_sets
                match.sets_history = json.dumps(sets_history)
                match.updated_at = utc_now_iso()
                group_name = group_lookup.get(int(match.bracket_group_id)) if match.bracket_group_id else None
                _sync_office_match_history(match, group_name)
        commit_writes()
        if history.match_id:
            link_schedule_to_match(
                tournament_id,
                history.match_id,
                player1_name=history.player_a,
                player2_name=history.player_b,
                phase=history.phase,
                bracket_group_id=_infer_group_id_for_players(history.player_a, history.player_b, player_groups) if history.phase == GROUP_PHASE else None,
            )
            if _is_knockout_phase(history.phase):
                correct_knockout_result(history.match_id, tournament_id, previous_history_winner)
        return {
            "message": "Match result updated",
            "match": _office_history_payload(history, group_lookup, player_groups),
            "knockout_generation": None,
            "dashboard": _build_office_dashboard(tournament_id, groups=groups),
        }

    match = first_row_where(Match, id=match_id, tournament_id=tournament_id)
    if not match:
        raise OfficeWorkflowError("Match not found", 404)

    sets_history, player1_sets, player2_sets = _normalize_office_sets(data, match.player1_name, match.player2_name)
    outcome = office_result_outcome(data, match.player1_name, match.player2_name)

    previous_winner = match.winner_name
    if _is_knockout_phase(match.phase):
        new_winner = outcome["winner_name"] or _required_winner(match.player1_name, match.player2_name, player1_sets, player2_sets)
        blocker = knockout_correction_blocker(tournament_id, match.player1_name, match.player2_name, match.phase, new_winner)
        if blocker:
            raise _knockout_blocked(blocker)

    match.status = 'finished'
    match.finish_reason = outcome["finish_reason"]
    match.winner_name = outcome["winner_name"]
    match.injured_player_name = outcome["injured_player_name"]
    match.result_note = outcome["result_note"]
    match.player1_sets = player1_sets
    match.player2_sets = player2_sets
    match.sets_history = json.dumps(sets_history)
    match.updated_at = utc_now_iso()

    group_name = group_lookup.get(int(match.bracket_group_id)) if match.bracket_group_id else None
    _sync_office_match_history(match, group_name)
    commit_writes()
    link_schedule_to_match(
        tournament_id,
        match.id,
        player1_name=match.player1_name,
        player2_name=match.player2_name,
        phase=match.phase,
        bracket_group_id=int(match.bracket_group_id) if match.bracket_group_id else None,
    )

    generation = None
    if match.phase == GROUP_PHASE:
        generation = maybe_generate_knockout_from_completed_groups(tournament_id)
    elif _is_knockout_phase(match.phase):
        correct_knockout_result(match.id, tournament_id, previous_winner)

    return {
        "message": "Match result updated",
        "match": _office_match_payload(match, {match.bracket_group_id: group_name} if group_name else {}, player_groups),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id, groups=groups),
    }
