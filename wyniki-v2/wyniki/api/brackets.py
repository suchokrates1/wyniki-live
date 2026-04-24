"""Bracket API: group management, standings, knockout bracket."""
from flask import Blueprint, jsonify, request

from wyniki.database import (
    get_active_tournament_id,
    fetch_active_tournaments,
    fetch_bracket_groups,
    save_bracket_groups,
    get_full_bracket,
    generate_knockout_from_standings,
    save_bracket_knockout,
    fetch_bracket_knockout,
    fetch_match_history,
    fetch_players,
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


# ==================== PUBLIC ====================

@bracket_public_bp.route('/bracket')
def public_bracket():
    """Full bracket for a requested tournament or the first active one."""
    tid = request.args.get('tournament_id', type=int) or get_active_tournament_id()
    if not tid:
        return jsonify({"error": "No active tournament"}), 404
    return jsonify(get_full_bracket(tid))


@bracket_public_bp.route('/list')
def public_tournament_list():
    """List active tournaments for public live/history browsing."""
    result = []
    for tournament in fetch_active_tournaments():
        d = dict(tournament)
        d['player_count'] = len(fetch_players(tournament['id']))
        result.append(d)
    return _json_no_cache(result)


@bracket_public_bp.route('/<int:tid>/bracket')
def public_tournament_bracket(tid: int):
    """Full bracket for a specific tournament."""
    return jsonify(get_full_bracket(tid))


@bracket_public_bp.route('/<int:tid>/history')
def public_tournament_history(tid: int):
    """Match history for a specific tournament."""
    from wyniki.config import settings
    history_data = fetch_match_history(limit=500, tournament_id=tid)
    return jsonify(history_data)


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
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to save knockout"}), 500


@bracket_admin_bp.route('/<int:tid>/bracket/knockout/generate', methods=['POST'])
def admin_generate_knockout(tid: int):
    """Auto-generate knockout from group standings (1A vs 2B, 1B vs 2A)."""
    result = generate_knockout_from_standings(tid)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)
