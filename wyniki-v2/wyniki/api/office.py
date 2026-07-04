"""Standalone tournament office API secured by per-tournament office passwords."""
from __future__ import annotations

import json

from flask import Blueprint, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash

from ..config import settings
from ..database import (
    advance_knockout,
    apply_autoschedule_placements,
    fetch_bracket_groups,
    fetch_courts_for_tournament,
    fetch_players,
    fetch_tournament_schedule,
    fetch_tournaments,
    fetch_tournament_categories,
    confirm_tournament_categories,
    insert_tournament_category,
    update_tournament_category,
    delete_tournament_category,
    migrate_tournament_categories_from_legacy,
    get_mixed_categories,
    generate_autoschedule_proposal,
    get_autoscheduler_config,
    maybe_generate_knockout_from_completed_groups,
    move_schedule_entry_with_cascade,
    unassign_schedule_entry,
    delete_unassigned_schedule_entries,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    seed_provisional_knockout_from_groups,
    seed_knockout_rematch_for_groups,
    save_autoscheduler_config,
    save_bracket_groups,
    upsert_tournament_schedule_entries,
    update_tournament_schedule_entry,
    delete_tournament_schedule_entry,
    publish_tournament_schedule,
    link_schedule_to_match,
    GROUP_PHASE,
    GROUP_REMATCH_PHASE,
    is_group_stage_phase,
)
from ..db_models import Match, MatchHistory, Tournament, db, utc_now_iso
from .admin_tournaments import (
    _build_office_dashboard,
    _create_office_knockout_match,
    _group_players_index,
    _infer_group_id_for_players,
    _is_knockout_phase,
    _json_no_cache,
    _normalize_bool,
    _normalize_int,
    _normalize_office_sets,
    _office_history_payload,
    _office_match_payload,
    OfficeWorkflowError,
    _player_pair_key,
    _sync_office_match_history,
)

blueprint = Blueprint('office', __name__, url_prefix='/api/office')


def _token_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt='office-access')


def _office_slot_tournaments() -> list[dict]:
    office_tournaments = [
        tournament
        for tournament in fetch_tournaments()
        if int(tournament.get('active') or 0) == 1 or int(tournament.get('is_simulation') or 0) == 1
    ]
    office_tournaments = sorted(office_tournaments, key=lambda tournament: str(tournament.get('name') or ''))
    office_tournaments = sorted(office_tournaments, key=lambda tournament: str(tournament.get('start_date') or ''), reverse=True)
    office_tournaments = sorted(office_tournaments, key=lambda tournament: 0 if int(tournament.get('active') or 0) == 1 else 1)
    return office_tournaments


def _office_tournament_payload(tournament: dict, slot: int) -> dict:
    return {
        'id': int(tournament['id']),
        'slot': int(slot),
        'name': tournament['name'],
        'logo_path': tournament.get('logo_path'),
        'active': bool(int(tournament.get('active') or 0)),
        'is_simulation': bool(int(tournament.get('is_simulation') or 0)),
        'start_date': tournament.get('start_date') or '',
        'end_date': tournament.get('end_date') or '',
        'has_office_password': bool(int(tournament.get('has_office_password') or 0)),
    }


def _resolve_office_tournament_slot(slot: int):
    office_tournaments = _office_slot_tournaments()
    if slot < 1 or slot > len(office_tournaments):
        return None, (jsonify({"error": "Office slot not found"}), 404)
    tournament = office_tournaments[slot - 1]
    return tournament, None


def _issue_office_token(slot: int, tournament_id: int) -> str:
    return _token_serializer().dumps({"slot": int(slot), "tournament_id": int(tournament_id)})


def _require_office_access(slot: int):
    tournament, error = _resolve_office_tournament_slot(slot)
    if error:
        return None, error

    auth_header = (request.headers.get('Authorization') or '').strip()
    if auth_header.lower().startswith('bearer '):
        token = auth_header[7:].strip()
    else:
        token = (request.headers.get('X-Office-Token') or request.args.get('token') or '').strip()
    if not token:
        return None, (jsonify({"error": "Office authorization required"}), 401)

    try:
        payload = _token_serializer().loads(token, max_age=60 * 60 * 24)
    except SignatureExpired:
        return None, (jsonify({"error": "Office session expired"}), 401)
    except BadSignature:
        return None, (jsonify({"error": "Invalid office session"}), 401)

    if int(payload.get('slot') or 0) != int(slot) or int(payload.get('tournament_id') or 0) != int(tournament['id']):
        return None, (jsonify({"error": "Office session no longer matches active tournament"}), 401)
    return tournament, None


@blueprint.route('/<int:slot>/meta', methods=['GET'])
def office_slot_meta(slot: int):
    """Return public metadata for one office slot before login."""
    tournament, error = _resolve_office_tournament_slot(slot)
    if error:
        return error
    return _json_no_cache({
        'slot': int(slot),
        'tournament': _office_tournament_payload(tournament, slot),
    })


@blueprint.route('/<int:slot>/auth', methods=['POST'])
def office_auth(slot: int):
    """Authenticate access to one office slot."""
    tournament, error = _resolve_office_tournament_slot(slot)
    if error:
        return error

    tournament_model = db.session.get(Tournament, int(tournament['id']))
    office_password_hash = (tournament_model.office_password_hash or '').strip() if tournament_model else ''
    if not office_password_hash:
        return jsonify({"error": "Office password is not configured for this tournament"}), 409

    payload = request.get_json(silent=True) or {}
    password = (payload.get('password') or '').strip()
    if not password or not check_password_hash(office_password_hash, password):
        return jsonify({"error": "Invalid office password"}), 403

    return _json_no_cache({
        "token": _issue_office_token(slot, int(tournament['id'])),
        "slot": slot,
        "tournament": _office_tournament_payload(tournament, slot),
        "dashboard": _build_office_dashboard(int(tournament['id'])),
    })


@blueprint.route('/<int:slot>/dashboard', methods=['GET'])
def office_dashboard(slot: int):
    """Return office dashboard for one office slot."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    return _json_no_cache(_build_office_dashboard(int(tournament['id'])))


@blueprint.route('/<int:slot>/planning', methods=['GET'])
def office_planning(slot: int):
    """Return all data needed by the office planning workflow."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    dashboard = _build_office_dashboard(tournament_id)
    categories = fetch_tournament_categories(tournament_id)
    if not categories and fetch_bracket_groups(tournament_id):
        categories = migrate_tournament_categories_from_legacy(tournament_id)
    return _json_no_cache({
        "players": fetch_players(tournament_id),
        "groups": fetch_bracket_groups(tournament_id),
        "schedule": fetch_tournament_schedule(tournament_id),
        "courts": dashboard.get("courts", []),
        "tournament_categories": categories,
        "mixed_categories": get_mixed_categories(tournament_id),
        "dashboard": dashboard,
    })


@blueprint.route('/<int:slot>/categories', methods=['GET'])
def office_categories_list(slot: int):
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    categories = fetch_tournament_categories(tournament_id)
    if not categories and fetch_bracket_groups(tournament_id):
        categories = migrate_tournament_categories_from_legacy(tournament_id)
    return _json_no_cache({"categories": categories})


@blueprint.route('/<int:slot>/categories/confirm', methods=['POST'])
def office_categories_confirm(slot: int):
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    entries = data.get("categories") or data.get("entries") or []
    if not isinstance(entries, list) or not entries:
        return jsonify({"error": "categories required"}), 400
    try:
        categories = confirm_tournament_categories(
            tournament_id,
            entries,
            replace=bool(data.get("replace")),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    return _json_no_cache({"categories": categories})


@blueprint.route('/<int:slot>/categories', methods=['POST'])
def office_categories_create(slot: int):
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    label = str(data.get("label") or "").strip()
    if not label:
        return jsonify({"error": "label required"}), 400
    category = insert_tournament_category(
        tournament_id,
        label=label,
        preset_key=str(data.get("preset_key") or ""),
        hint_bands=data.get("hint_bands") if isinstance(data.get("hint_bands"), list) else None,
    )
    if not category:
        return jsonify({"error": "Failed to create category"}), 500
    return _json_no_cache({"category": category, "categories": fetch_tournament_categories(tournament_id)}), 201


@blueprint.route('/<int:slot>/categories/<int:category_id>', methods=['PUT', 'PATCH'])
def office_categories_update(slot: int, category_id: int):
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    category = update_tournament_category(
        category_id,
        label=(data.get("label") if "label" in data else None),
        hint_bands=data.get("hint_bands") if isinstance(data.get("hint_bands"), list) else None,
        sort_order=data.get("sort_order") if data.get("sort_order") is not None else None,
        is_active=data.get("is_active") if "is_active" in data else None,
    )
    if not category or int(category.get("tournament_id") or 0) != tournament_id:
        return jsonify({"error": "Category not found"}), 404
    return _json_no_cache({
        "category": category,
        "categories": fetch_tournament_categories(tournament_id),
        "groups": fetch_bracket_groups(tournament_id),
        "schedule": fetch_tournament_schedule(tournament_id),
    })


@blueprint.route('/<int:slot>/categories/<int:category_id>', methods=['DELETE'])
def office_categories_delete(slot: int, category_id: int):
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    from ..database import fetch_tournament_category
    existing = fetch_tournament_category(category_id)
    if not existing or int(existing.get("tournament_id") or 0) != tournament_id:
        return jsonify({"error": "Category not found"}), 404
    if not delete_tournament_category(category_id):
        return jsonify({"error": "Failed to delete category"}), 500
    return _json_no_cache({"categories": fetch_tournament_categories(tournament_id)})


@blueprint.route('/<int:slot>/planning/groups', methods=['PUT'])
def office_planning_groups(slot: int):
    """Replace bracket groups from the standalone office planning workflow."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    groups = data.get("groups", [])
    if not groups:
        return jsonify({"error": "No groups provided"}), 400
    if not save_bracket_groups(tournament_id, groups):
        return jsonify({"error": "Failed to save groups"}), 500
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    dashboard = _build_office_dashboard(tournament_id)
    return _json_no_cache({
        "groups": fetch_bracket_groups(tournament_id),
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": dashboard,
    })


@blueprint.route('/<int:slot>/schedule', methods=['GET'])
def office_schedule(slot: int):
    """Return schedule entries for one authenticated office slot."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    return _json_no_cache({"schedule": fetch_tournament_schedule(tournament_id)})


@blueprint.route('/<int:slot>/schedule', methods=['POST', 'PUT'])
def office_schedule_save(slot: int):
    """Create or update manual schedule entries from the office workflow."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    raw_entries = data.get('entries') if isinstance(data.get('entries'), list) else [data]
    try:
        schedule = upsert_tournament_schedule_entries(tournament_id, raw_entries)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _json_no_cache({
        "schedule": schedule,
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/schedule/generate', methods=['POST'])
def office_schedule_generate(slot: int):
    """Create missing schedule entries from groups and knockout slots."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    ensure_group_schedule_entries(tournament_id)
    seed_provisional_knockout_from_groups(
        tournament_id,
        schedule_day=(data.get('day_date') or None),
    )
    return _json_no_cache({"schedule": fetch_tournament_schedule(tournament_id), "dashboard": _build_office_dashboard(tournament_id)})


@blueprint.route('/<int:slot>/schedule/generate-rematch', methods=['POST'])
def office_schedule_generate_rematch(slot: int):
    """Add a second group-stage round robin for selected bracket groups."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    group_ids = data.get('group_ids') or []
    if not isinstance(group_ids, list) or not group_ids:
        return jsonify({"error": "group_ids required"}), 400
    result = seed_knockout_rematch_for_groups(
        tournament_id,
        [int(group_id) for group_id in group_ids if group_id],
        schedule_day=(data.get('day_date') or None),
    )
    if result.get("error"):
        return jsonify(result), 400
    return _json_no_cache({
        "result": result,
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/players', methods=['POST'])
def office_create_player(slot: int):
    """Add a player to the tournament from the office workflow."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}

    first_name = str(data.get('first_name') or '').strip()
    last_name = str(data.get('last_name') or '').strip()
    name = str(data.get('name') or '').strip()
    if not first_name and not last_name:
        if not name:
            return jsonify({"error": "Name is required"}), 400
        parts = name.rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name
    if not name:
        name = f"{first_name} {last_name}".strip()

    from ..database import insert_player

    player_id = insert_player(
        tournament_id,
        name,
        str(data.get('category') or '').strip(),
        str(data.get('country') or '').strip().upper()[:2],
        first_name=first_name,
        last_name=last_name,
        gender=str(data.get('gender') or '').strip(),
    )
    if not player_id:
        return jsonify({"error": "Failed to add player"}), 500
    return _json_no_cache({
        "id": player_id,
        "players": fetch_players(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    }), 201


@blueprint.route('/<int:slot>/schedule/<int:schedule_id>', methods=['PUT', 'PATCH'])
def office_schedule_update(slot: int, schedule_id: int):
    """Update date, time, court, status or notes for one schedule entry."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    entry = update_tournament_schedule_entry(tournament_id, schedule_id, request.get_json(silent=True) or {})
    if not entry:
        return jsonify({"error": "Schedule entry not found"}), 404
    return _json_no_cache({
        "schedule_entry": entry,
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/schedule/<int:schedule_id>', methods=['DELETE'])
def office_schedule_delete(slot: int, schedule_id: int):
    """Delete one schedule entry from the office workflow."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    if not delete_tournament_schedule_entry(tournament_id, schedule_id):
        return jsonify({"error": "Schedule entry not found"}), 404
    return _json_no_cache({
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/schedule/publish', methods=['POST'])
def office_schedule_publish(slot: int):
    """Promote all draft schedule entries to published (planned)."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    day_date = (data.get('day_date') or '').strip() or None
    published = publish_tournament_schedule(tournament_id, day_date)
    return _json_no_cache({
        "published": published,
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/autoschedule/config', methods=['GET'])
def office_autoschedule_config(slot: int):
    """Return auto-scheduler config plus available courts and detected category bands."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    config = get_autoscheduler_config(tournament_id)
    courts = fetch_courts_for_tournament(tournament_id)
    bands = sorted({
        band
        for player in fetch_players(tournament_id)
        for band in [_player_band(player)]
        if band
    })
    return _json_no_cache({"config": config, "courts": courts, "bands": bands})


def _player_band(player: dict) -> str:
    import re
    match = re.search(r"B\s*([1-4])", str(player.get('category') or '').upper())
    return f"B{match.group(1)}" if match else ""


@blueprint.route('/<int:slot>/autoschedule/config', methods=['PUT'])
def office_autoschedule_config_save(slot: int):
    """Persist auto-scheduler config (court mapping, slot minutes, start time, rest)."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    config = save_autoscheduler_config(tournament_id, data)
    return _json_no_cache({"config": config})


@blueprint.route('/<int:slot>/autoschedule/generate', methods=['POST'])
def office_autoschedule_generate(slot: int):
    """Build a non-persisted auto-placement proposal to review on the board."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    b1_court_ids = data.get('b1_court_ids') if isinstance(data.get('b1_court_ids'), list) else None
    proposal = generate_autoschedule_proposal(
        tournament_id,
        start_time=(data.get('start_time') or None),
        b1_court_id=(data.get('b1_court_id') or None),
        b1_court_ids=b1_court_ids,
        day_date=(data.get('day_date') or None),
        phases=data.get('phases') if isinstance(data.get('phases'), list) else None,
    )
    return _json_no_cache(proposal)


@blueprint.route('/<int:slot>/autoschedule/apply', methods=['POST'])
def office_autoschedule_apply(slot: int):
    """Persist a reviewed set of placements to the schedule."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    placements = data.get('placements')
    if not isinstance(placements, list) or not placements:
        return jsonify({"error": "No placements provided"}), 400
    schedule = apply_autoschedule_placements(tournament_id, placements)
    return _json_no_cache({
        "schedule": schedule,
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/autoschedule/move', methods=['POST'])
def office_autoschedule_move(slot: int):
    """Move one match to a court/time and cascade times on affected courts."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    schedule_id = _normalize_int(data.get('schedule_id'), 0)
    if not schedule_id:
        return jsonify({"error": "schedule_id is required"}), 400
    schedule = move_schedule_entry_with_cascade(
        tournament_id,
        schedule_id,
        court_id=str(data.get('court_id') or ''),
        scheduled_time=(data.get('scheduled_time') or None),
        day_date=(data.get('day_date') or None),
    )
    return _json_no_cache({
        "schedule": schedule,
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/autoschedule/unassign', methods=['POST'])
def office_autoschedule_unassign(slot: int):
    """Return a match to the unassigned pool (clear court and time)."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    schedule_id = _normalize_int(data.get('schedule_id'), 0)
    if not schedule_id:
        return jsonify({"error": "schedule_id is required"}), 400
    schedule = unassign_schedule_entry(
        tournament_id,
        schedule_id,
        day_date=(data.get('day_date') or None),
    )
    return _json_no_cache({
        "schedule": schedule,
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/schedule/unassigned', methods=['DELETE'])
def office_schedule_delete_unassigned(slot: int):
    """Delete all unassigned schedule entries (no court or time), optionally for one day."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    day_date = (request.args.get('day_date') or '').strip() or None
    deleted = delete_unassigned_schedule_entries(tournament_id, day_date=day_date)
    return _json_no_cache({
        "deleted": deleted,
        "schedule": fetch_tournament_schedule(tournament_id),
        "dashboard": _build_office_dashboard(tournament_id),
    })


@blueprint.route('/<int:slot>/group-matches', methods=['POST'])
def office_group_match(slot: int):
    """Create a finished group-stage result from the standalone office module."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])

    data = request.get_json(silent=True) or {}
    group_id = _normalize_int(data.get('group_id'), 0)
    player1_name = (data.get('player1_name') or '').strip()
    player2_name = (data.get('player2_name') or '').strip()
    if not group_id or not player1_name or not player2_name or player1_name == player2_name:
        return jsonify({"error": "Group and two different players are required"}), 400

    groups = fetch_bracket_groups(tournament_id)
    group = next((item for item in groups if int(item['id']) == group_id), None)
    if not group:
        return jsonify({"error": "Group not found"}), 404
    group_player_names = {player['name'] for player in group.get('players', [])}
    if player1_name not in group_player_names or player2_name not in group_player_names:
        return jsonify({"error": "Both players must belong to the selected group"}), 400

    _, player_groups = _group_players_index(groups)
    pair_key = _player_pair_key(player1_name, player2_name)
    phase = (data.get('phase') or GROUP_PHASE).strip()
    if not is_group_stage_phase(phase):
        phase = GROUP_PHASE

    existing_match = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.bracket_group_id == group_id,
        Match.phase == phase,
        Match.status == 'finished',
        (((Match.player1_name == player1_name) & (Match.player2_name == player2_name))
         | ((Match.player1_name == player2_name) & (Match.player2_name == player1_name))),
    ).first()
    if existing_match:
        return jsonify({"error": "This group match already has a result. Edit the existing result instead."}), 409

    for history in MatchHistory.query.filter_by(tournament_id=tournament_id).all():
        if history.phase != phase:
            continue
        if _infer_group_id_for_players(history.player_a, history.player_b, player_groups) != group_id:
            continue
        if _player_pair_key(history.player_a, history.player_b) == pair_key:
            return jsonify({"error": "This group match already has a result. Edit the existing result instead."}), 409

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or f"office-{tournament_id}"),
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
        player1_name=player1_name,
        player2_name=player2_name,
        phase='Grupowa',
        bracket_group_id=group_id,
    )

    generation = maybe_generate_knockout_from_completed_groups(tournament_id)
    return _json_no_cache({
        "message": "Group match added",
        "match": _office_match_payload(match, {group_id: group.get('name')}, player_groups),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id),
    }, 201)


@blueprint.route('/<int:slot>/knockout-matches', methods=['POST'])
def office_knockout_match(slot: int):
    """Create a finished knockout result from the standalone office module."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    try:
        payload, status = _create_office_knockout_match(int(tournament['id']), request.get_json(silent=True) or {})
    except OfficeWorkflowError as exc:
        return jsonify({"error": str(exc)}), exc.status_code
    return _json_no_cache(payload, status)


@blueprint.route('/<int:slot>/matches/<int:match_id>', methods=['PUT'])
def office_update_match(slot: int, match_id: int):
    """Edit an existing office match result from the standalone office module."""
    tournament, error = _require_office_access(slot)
    if error:
        return error
    tournament_id = int(tournament['id'])
    data = request.get_json(silent=True) or {}
    source = (data.get('source') or 'match').strip().lower()
    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)

    if source == 'history':
        history = MatchHistory.query.filter_by(id=match_id, tournament_id=tournament_id).first()
        if not history:
            return jsonify({"error": "Match not found"}), 404
        try:
            sets_history, player1_sets, player2_sets = _normalize_office_sets(data, history.player_a, history.player_b)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        history.score_a = json.dumps([set_score.get('player1_games', 0) for set_score in sets_history])
        history.score_b = json.dumps([set_score.get('player2_games', 0) for set_score in sets_history])
        history.sets_history = json.dumps(sets_history)
        history.finish_reason = 'walkover' if _normalize_bool(data.get('walkover', False)) else 'normal'
        history.winner_name = (data.get('winner_name') or '').strip() if history.finish_reason == 'walkover' else None
        history.injured_player_name = None
        history.result_note = 'Walkower' if history.finish_reason == 'walkover' else None
        if history.match_id:
            match = Match.query.filter_by(id=history.match_id, tournament_id=tournament_id).first()
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
        db.session.commit()
        if history.match_id:
            link_schedule_to_match(
                tournament_id,
                history.match_id,
                player1_name=history.player_a,
                player2_name=history.player_b,
                phase=history.phase,
                bracket_group_id=_infer_group_id_for_players(history.player_a, history.player_b, player_groups) if history.phase == 'Grupowa' else None,
            )
        return _json_no_cache({
            "message": "Match result updated",
            "match": _office_history_payload(history, group_lookup, player_groups),
            "knockout_generation": None,
            "dashboard": _build_office_dashboard(tournament_id),
        })

    match = Match.query.filter_by(id=match_id, tournament_id=tournament_id).first()
    if not match:
        return jsonify({"error": "Match not found"}), 404

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, match.player1_name, match.player2_name)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    match.status = 'finished'
    match.finish_reason = 'walkover' if _normalize_bool(data.get('walkover', False)) else 'normal'
    match.winner_name = (data.get('winner_name') or '').strip() if match.finish_reason == 'walkover' else None
    match.injured_player_name = None
    match.result_note = 'Walkower' if match.finish_reason == 'walkover' else None
    match.player1_sets = player1_sets
    match.player2_sets = player2_sets
    match.sets_history = json.dumps(sets_history)
    match.updated_at = utc_now_iso()

    group_name = group_lookup.get(int(match.bracket_group_id)) if match.bracket_group_id else None
    _sync_office_match_history(match, group_name)
    db.session.commit()
    link_schedule_to_match(
        tournament_id,
        match.id,
        player1_name=match.player1_name,
        player2_name=match.player2_name,
        phase=match.phase,
        bracket_group_id=int(match.bracket_group_id) if match.bracket_group_id else None,
    )

    generation = None
    if match.phase == 'Grupowa':
        generation = maybe_generate_knockout_from_completed_groups(tournament_id)
    elif _is_knockout_phase(match.phase):
        advance_knockout(match.id, tournament_id)

    return _json_no_cache({
        "message": "Match result updated",
        "match": _office_match_payload(match, {match.bracket_group_id: group_name} if group_name else {}, player_groups),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id),
    })