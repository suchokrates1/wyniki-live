"""Bracket API: group management, standings, knockout bracket."""
from flask import Blueprint, jsonify, request

from wyniki.database import (
    get_active_tournament_id,
    fetch_active_tournaments,
    fetch_tournaments,
    fetch_tournament,
    fetch_bracket_groups,
    save_bracket_groups,
    get_full_bracket,
    generate_knockout_from_standings,
    save_bracket_knockout,
    fetch_bracket_knockout,
    fetch_match_history,
    fetch_players,
    build_public_schedule_payload,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    get_public_tournament_quick_info,
)

# Public API
bracket_public_bp = Blueprint('bracket_public', __name__, url_prefix='/api/tournament')

# Admin API
bracket_admin_bp = Blueprint('bracket_admin', __name__, url_prefix='/admin/api/tournaments')


def _json_no_cache(payload, status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def _public_tournament_or_404(tid: int):
    tournament = fetch_tournament(tid)
    if not tournament:
        return None, (jsonify({"error": "Tournament not found"}), 404)
    if int(tournament.get("is_public") or 0) == 1:
        return tournament, None
    expected_key = str(tournament.get("access_key") or "").strip()
    provided_key = str(request.args.get("access_key") or request.args.get("key") or "").strip()
    if expected_key and provided_key == expected_key:
        return tournament, None
    return None, (jsonify({"error": "Tournament not found"}), 404)


def _requested_stage() -> int | None:
    raw = request.args.get("etap") or request.args.get("stage")
    if raw is None:
        return None
    text = str(raw).strip().lower().replace("etap", "").replace("stage", "")
    if not text:
        return None
    try:
        stage = int(text)
    except ValueError:
        return None
    return stage if 1 <= stage <= 4 else None


def _simulation_base_name(name: str) -> str:
    lowered = name.lower()
    for marker in (" — etap ", " - etap "):
        index = lowered.rfind(marker)
        if index > -1 and lowered[index + len(marker):].strip().isdigit():
            return name[:index]
    return name


def _resolve_requested_stage(tournament: dict):
    stage = _requested_stage()
    if not stage or stage == 1 or int(tournament.get("is_simulation") or 0) != 1:
        return tournament, None

    base_name = _simulation_base_name(str(tournament.get("name") or ""))
    expected_name = f"{base_name} — etap {stage}"
    for candidate in fetch_tournaments():
        if candidate.get("name") == expected_name:
            return candidate, None
    return None, (jsonify({"error": "Tournament stage not found"}), 404)


# ==================== PUBLIC ====================

@bracket_public_bp.route('/bracket')
def public_bracket():
    """Full bracket for a requested tournament or the first active one."""
    requested_tid = request.args.get('tournament_id', type=int)
    tid = requested_tid or get_active_tournament_id(public_only=True)
    if not tid:
        return jsonify({"error": "No active tournament"}), 404
    if requested_tid:
        tournament, error = _public_tournament_or_404(tid)
        if error:
            return error
        tournament, error = _resolve_requested_stage(tournament)
        if error:
            return error
        tid = tournament["id"]
    return jsonify(get_full_bracket(tid))


@bracket_public_bp.route('/schedule')
def public_schedule():
    """Public schedule for a requested tournament or the first active one."""
    requested_tid = request.args.get('tournament_id', type=int)
    tid = requested_tid or get_active_tournament_id(public_only=True)
    if not tid:
        return jsonify({"error": "No active tournament"}), 404
    if requested_tid:
        tournament, error = _public_tournament_or_404(tid)
        if error:
            return error
        tournament, error = _resolve_requested_stage(tournament)
        if error:
            return error
        tid = tournament["id"]
    ensure_group_schedule_entries(tid)
    ensure_knockout_schedule_entries(tid)
    return _json_no_cache(build_public_schedule_payload(tid))


@bracket_public_bp.route('/info')
def public_quick_info():
    """Quick info banner for the active tournament."""
    requested_tid = request.args.get('tournament_id', type=int)
    tid = requested_tid or get_active_tournament_id(public_only=True)
    if not tid:
        return jsonify({"error": "No active tournament"}), 404
    if requested_tid:
        tournament, error = _public_tournament_or_404(tid)
        if error:
            return error
        tournament, error = _resolve_requested_stage(tournament)
        if error:
            return error
        tid = tournament["id"]
    info = get_public_tournament_quick_info(tid)
    if not info:
        return _json_no_cache({"message": None})
    return _json_no_cache(info)


@bracket_public_bp.route('/<int:tid>/info')
def public_tournament_quick_info(tid: int):
    """Quick info banner for a specific tournament."""
    tournament, error = _public_tournament_or_404(tid)
    if error:
        return error
    tournament, error = _resolve_requested_stage(tournament)
    if error:
        return error
    info = get_public_tournament_quick_info(tournament["id"])
    if not info:
        return _json_no_cache({"message": None})
    return _json_no_cache(info)


@bracket_public_bp.route('/list')
def public_tournament_list():
    """List all tournaments for public tournament browsing."""
    result = []
    for tournament in fetch_tournaments(public_only=True):
        d = dict(tournament)
        d.pop('access_key', None)
        d['player_count'] = len(fetch_players(tournament['id']))
        result.append(d)
    return _json_no_cache(result)


@bracket_public_bp.route('/<int:tid>/bracket')
def public_tournament_bracket(tid: int):
    """Full bracket for a specific tournament."""
    tournament, error = _public_tournament_or_404(tid)
    if error:
        return error
    tournament, error = _resolve_requested_stage(tournament)
    if error:
        return error
    return jsonify(get_full_bracket(tournament["id"]))


@bracket_public_bp.route('/<int:tid>/history')
def public_tournament_history(tid: int):
    """Match history for a specific tournament."""
    from wyniki.config import settings
    tournament, error = _public_tournament_or_404(tid)
    if error:
        return error
    tournament, error = _resolve_requested_stage(tournament)
    if error:
        return error
    authorized_private = int(tournament.get("is_public") or 0) != 1
    history_data = fetch_match_history(
        limit=500,
        tournament_id=tournament["id"],
        public_only=not authorized_private,
        stats_enabled_only=False,
    )
    return jsonify(history_data)


@bracket_public_bp.route('/<int:tid>/schedule')
def public_tournament_schedule(tid: int):
    """Public schedule for a specific tournament."""
    tournament, error = _public_tournament_or_404(tid)
    if error:
        return error
    tournament, error = _resolve_requested_stage(tournament)
    if error:
        return error
    ensure_group_schedule_entries(tournament["id"])
    ensure_knockout_schedule_entries(tournament["id"])
    return _json_no_cache(build_public_schedule_payload(tournament["id"]))


# ==================== ADMIN ====================

@bracket_admin_bp.route('/<int:tid>/bracket/groups', methods=['GET'])
def admin_get_groups(tid: int):
    """Get bracket groups for a tournament."""
    return jsonify(fetch_bracket_groups(tid))


@bracket_admin_bp.route('/<int:tid>/bracket/groups', methods=['PUT'])
def admin_set_groups(tid: int):
    """Replace bracket groups. Body: {"groups": [{"name": "A", "players": [1,2,3]}, ...]}"""
    data = request.get_json(silent=True) or {}
    groups = data.get("groups", [])
    if not groups:
        return jsonify({"error": "No groups provided"}), 400
    ok = save_bracket_groups(tid, groups)
    if ok:
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to save groups"}), 500


@bracket_admin_bp.route('/<int:tid>/bracket/knockout', methods=['GET'])
def admin_get_knockout(tid: int):
    """Get knockout bracket slots."""
    return jsonify(fetch_bracket_knockout(tid))


@bracket_admin_bp.route('/<int:tid>/bracket/knockout', methods=['PUT'])
def admin_set_knockout(tid: int):
    """Manually set knockout bracket. Body: {"knockout": [...]}"""
    data = request.get_json(silent=True) or {}
    slots = data.get("knockout", [])
    ok = save_bracket_knockout(tid, slots)
    if ok:
        ensure_knockout_schedule_entries(tid)
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to save knockout"}), 500


@bracket_admin_bp.route('/<int:tid>/bracket/knockout/generate', methods=['POST'])
def admin_generate_knockout(tid: int):
    """Auto-generate knockout from group standings (1A vs 2B, 1B vs 2A)."""
    result = generate_knockout_from_standings(tid)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)
