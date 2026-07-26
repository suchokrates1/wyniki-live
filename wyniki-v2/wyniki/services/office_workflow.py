"""Shared office/admin workflow helpers for dashboards and finished-match entry."""
from __future__ import annotations

import json
from typing import Any, Dict

from flask import jsonify

from ..database import (
    GROUP_PHASE,
    advance_knockout,
    count_finished_group_matches,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    expected_group_matches_count,
    fetch_bracket_groups,
    fetch_bracket_knockout,
    fetch_courts_for_tournament,
    fetch_tournament,
    fetch_tournament_schedule,
    get_tournament_quick_info,
    is_group_stage_phase,
    is_knockout_stage_phase,
    link_schedule_to_match,
    maybe_generate_knockout_from_completed_groups,
    normalize_group_stage_phase,
    _is_knockout_placeholder_name,
)
from ..db_models import Match, MatchHistory, TournamentSchedule, db, utc_now_iso


class OfficeWorkflowError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _is_knockout_phase(phase: str | None) -> bool:
    return is_knockout_stage_phase(phase)


def _json_no_cache(payload, status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def _normalize_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


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


def _score_text(sets_history: list[Dict[str, Any]]) -> str:
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
    return tuple(sorted((_normalize_name_key(player1_name), _normalize_name_key(player2_name))))


def _group_players_index(groups: list[Dict[str, Any]]) -> tuple[Dict[int, str], Dict[str, set[int]]]:
    group_lookup = {int(group['id']): group['name'] for group in groups}
    player_groups: Dict[str, set[int]] = {}
    for group in groups:
        group_id = int(group['id'])
        for player in group.get('players', []):
            player_groups.setdefault(_normalize_name_key(player.get('name')), set()).add(group_id)
    return group_lookup, player_groups


def _infer_group_id_for_players(
    player1_name: str | None,
    player2_name: str | None,
    player_groups: Dict[str, set[int]],
) -> int | None:
    player1_group_ids = player_groups.get(_normalize_name_key(player1_name), set())
    player2_group_ids = player_groups.get(_normalize_name_key(player2_name), set())
    common = sorted(player1_group_ids & player2_group_ids)
    return common[0] if common else None


def _history_sets_payload(history: MatchHistory) -> list[Dict[str, Any]]:
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


def _history_sets_score(sets_history: list[Dict[str, Any]]) -> tuple[int, int]:
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
    group_lookup: Dict[int, str],
    player_groups: Dict[str, set[int]],
) -> Dict[str, Any]:
    sets_history = _history_sets_payload(history)
    player1_sets, player2_sets = _history_sets_score(sets_history)
    group_id = (
        _infer_group_id_for_players(history.player_a, history.player_b, player_groups)
        if history.phase == 'Grupowa'
        else None
    )
    group_name = group_lookup.get(group_id)
    winner_name = None
    if player1_sets != player2_sets:
        winner_name = history.player_a if player1_sets > player2_sets else history.player_b
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
        "finish_reason": history.finish_reason or 'normal',
        "injured_player_name": history.injured_player_name,
        "result_note": history.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": history.category or _bracket_category_from_group(group_name),
        "player1_sets": player1_sets,
        "player2_sets": player2_sets,
        "sets_history": sets_history,
        "score_text": _score_text(sets_history),
        "created_at": history.ended_ts,
        "updated_at": history.ended_ts,
    }


def _normalize_office_sets(
    data: Dict[str, Any],
    player1_name: str,
    player2_name: str,
) -> tuple[list[Dict[str, Any]], int, int]:
    if _normalize_bool(data.get('walkover', False)):
        winner_name = (data.get('winner_name') or '').strip()
        if winner_name not in {player1_name, player2_name}:
            raise ValueError('Winner is required for walkover')
        p1_wins = winner_name == player1_name
        return [
            {"set_number": 1, "player1_games": 4 if p1_wins else 0, "player2_games": 0 if p1_wins else 4},
            {"set_number": 2, "player1_games": 4 if p1_wins else 0, "player2_games": 0 if p1_wins else 4},
        ], 2 if p1_wins else 0, 0 if p1_wins else 2

    raw_sets = data.get('sets') or []
    sets_history = []
    player1_sets = 0
    player2_sets = 0
    for index, raw_set in enumerate(raw_sets, start=1):
        try:
            p1_games = int(raw_set.get('player1_games'))
            p2_games = int(raw_set.get('player2_games'))
        except (TypeError, ValueError):
            continue
        if p1_games < 0 or p2_games < 0:
            raise ValueError('Set scores cannot be negative')
        if p1_games == p2_games:
            raise ValueError('Set cannot end in a draw')
        if p1_games > p2_games:
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

    if not sets_history:
        raise ValueError('At least one finished set is required')
    if player1_sets == player2_sets:
        raise ValueError('Match winner is required')
    return sets_history, player1_sets, player2_sets


def _sync_office_match_history(match: Match, group_name: str | None = None) -> None:
    sets_history = _json_loads(match.sets_history, [])
    score_a = [set_score.get('player1_games', 0) for set_score in sets_history]
    score_b = [set_score.get('player2_games', 0) for set_score in sets_history]
    history = MatchHistory.query.filter_by(match_id=match.id).first()
    if not history:
        history = MatchHistory(match_id=match.id, duration_seconds=0)
        db.session.add(history)

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
    group_lookup: Dict[int, str],
    player_groups: Dict[str, set[int]] | None = None,
) -> Dict[str, Any]:
    sets_history = _json_loads(match.sets_history, [])
    winner = match.player1_name if int(match.player1_sets or 0) > int(match.player2_sets or 0) else match.player2_name
    group_id = int(match.bracket_group_id) if match.bracket_group_id else None
    if not group_id and player_groups and match.phase == 'Grupowa':
        group_id = _infer_group_id_for_players(match.player1_name, match.player2_name, player_groups)
    group_name = group_lookup.get(group_id)
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
        "finish_reason": match.finish_reason or 'normal',
        "injured_player_name": match.injured_player_name,
        "result_note": match.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": _bracket_category_from_group(group_name) or match.phase,
        "player1_sets": match.player1_sets,
        "player2_sets": match.player2_sets,
        "sets_history": sets_history,
        "score_text": _score_text(sets_history),
        "created_at": match.created_at,
        "updated_at": match.updated_at,
    }


def _office_knockout_item(
    slot: Dict[str, Any],
    schedule_entry: Dict[str, Any] | None,
    match_by_id: Dict[int, Match],
) -> Dict[str, Any]:
    match = None
    match_id = _normalize_int((schedule_entry or {}).get('match_id'), 0)
    if match_id:
        match = match_by_id.get(match_id)

    sets_history = _json_loads(match.sets_history, []) if match else []
    winner_name = (slot.get('winner_name') or '').strip()
    if match and match.status == 'finished':
        winner_name = match.winner_name or (
            match.player1_name if int(match.player1_sets or 0) > int(match.player2_sets or 0) else match.player2_name
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
        "player1_name": player1_name,
        "player2_name": player2_name,
        "winner_name": winner_name or None,
        "status": status,
        "schedule_status": schedule_status,
        "ready": ready,
        "finish_reason": (match.finish_reason if match else slot.get('finish_reason')) or 'normal',
        "result_note": (match.result_note if match else slot.get('result_note')),
        "score_text": _score_text(sets_history) if match else (slot.get('score_summary') or ''),
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
    schedule: list[Dict[str, Any]],
    match_by_id: Dict[int, Match],
) -> Dict[str, Any]:
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
    data: Dict[str, Any],
) -> tuple[Dict[str, Any], TournamentSchedule | None]:
    schedule_id = _normalize_int(data.get('schedule_id'), 0)
    slot_id = _normalize_int(data.get('knockout_slot_id') or data.get('slot_id') or data.get('source_ref_id'), 0)
    schedule_entry = None

    if schedule_id:
        schedule_entry = TournamentSchedule.query.filter_by(
            id=schedule_id,
            tournament_id=tournament_id,
        ).first()
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
            schedule_entry = TournamentSchedule.query.filter_by(
                tournament_id=tournament_id,
                source_type='knockout',
                source_ref_id=slot_id,
            ).first()
            if not schedule_entry and schedule_id:
                schedule_entry = TournamentSchedule.query.filter_by(
                    id=schedule_id,
                    tournament_id=tournament_id,
                ).first()
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


def _create_office_knockout_match(tournament_id: int, data: Dict[str, Any]) -> tuple[Dict[str, Any], int]:
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
    existing_match = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.phase == match_phase,
        Match.status == 'finished',
        (
            ((Match.player1_name == player1_name) & (Match.player2_name == player2_name))
            | ((Match.player1_name == player2_name) & (Match.player2_name == player1_name))
        ),
    ).first()
    if existing_match:
        raise OfficeWorkflowError('This knockout match already has a result. Edit the existing result instead.', 409)

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
    except ValueError as exc:
        raise OfficeWorkflowError(str(exc)) from exc

    winner_name = (data.get('winner_name') or '').strip() if _normalize_bool(data.get('walkover', False)) else ''
    if not winner_name:
        winner_name = player1_name if player1_sets > player2_sets else player2_name

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or (schedule_entry.court_id if schedule_entry else '') or f"office-{tournament_id}"),
        player1_name=player1_name,
        player2_name=player2_name,
        status='finished',
        tournament_id=tournament_id,
        phase=match_phase,
        finish_reason='walkover' if _normalize_bool(data.get('walkover', False)) else 'normal',
        winner_name=winner_name,
        result_note='Walkower' if _normalize_bool(data.get('walkover', False)) else None,
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=data.get('ended_at') or now,
        updated_at=now,
    )
    db.session.add(match)
    db.session.flush()
    _sync_office_match_history(match, match.phase)
    db.session.commit()

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
        "dashboard": _build_office_dashboard(tournament_id),
    }, 201


def _create_office_group_match(tournament_id: int, data: Dict[str, Any]) -> tuple[Dict[str, Any], int]:
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

    existing_match = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.bracket_group_id == group_id,
        Match.phase == phase,
        Match.status == 'finished',
        (
            ((Match.player1_name == player1_name) & (Match.player2_name == player2_name))
            | ((Match.player1_name == player2_name) & (Match.player2_name == player1_name))
        ),
    ).first()
    if existing_match:
        raise OfficeWorkflowError(
            'This group match already has a result. Edit the existing result instead.',
            409,
        )

    for history in MatchHistory.query.filter_by(tournament_id=tournament_id).all():
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
        finish_reason='walkover' if _normalize_bool(data.get('walkover', False)) else 'normal',
        winner_name=(data.get('winner_name') or '').strip() if _normalize_bool(data.get('walkover', False)) else None,
        result_note='Walkower' if _normalize_bool(data.get('walkover', False)) else None,
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=data.get('ended_at') or now,
        updated_at=now,
    )
    db.session.add(match)
    db.session.flush()
    _sync_office_match_history(match, group.get('name'))
    db.session.commit()
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
        "match": _office_match_payload(match, {group_id: group.get('name')}, player_groups),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id),
    }, 201


def _build_office_dashboard(tournament_id: int) -> Dict[str, Any]:
    tournament = fetch_tournament(tournament_id)
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)
    progress_groups = []
    expected_total = 0
    finished_total = 0

    match_rows = Match.query.filter_by(tournament_id=tournament_id).all()
    match_by_id = {int(match.id): match for match in match_rows}
    history_rows = MatchHistory.query.filter_by(tournament_id=tournament_id).all()
    schedule = fetch_tournament_schedule(tournament_id)

    for group in groups:
        group_id = int(group['id'])
        player_count = len(group.get('players') or [])
        expected = expected_group_matches_count(tournament_id, group_id, player_count)
        finished = count_finished_group_matches(tournament_id, group_id)
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
    }
