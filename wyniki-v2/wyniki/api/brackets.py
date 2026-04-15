"""Bracket API: group management, standings, knockout bracket."""
from flask import Blueprint, jsonify, request

from wyniki.database import (
    get_active_tournament_id,
    fetch_bracket_groups,
    save_bracket_groups,
    get_full_bracket,
    generate_knockout_from_standings,
    save_bracket_knockout,
    fetch_bracket_knockout,
    fetch_match_history,
)

# Public API
bracket_public_bp = Blueprint('bracket_public', __name__, url_prefix='/api/tournament')

# Admin API
bracket_admin_bp = Blueprint('bracket_admin', __name__, url_prefix='/admin/api/tournaments')


# ==================== PUBLIC ====================

@bracket_public_bp.route('/bracket')
def public_bracket():
    """Full bracket for active tournament (groups + standings + knockout)."""
    tid = get_active_tournament_id()
    if not tid:
        return jsonify({"error": "No active tournament"}), 404
    return jsonify(get_full_bracket(tid))


@bracket_public_bp.route('/list')
def public_tournament_list():
    """List all tournaments (for history/bracket browsing)."""
    from wyniki.db_models import Tournament, Player
    from sqlalchemy import func
    tournaments = (
        Tournament.query
        .outerjoin(Player, Player.tournament_id == Tournament.id)
        .add_columns(func.count(Player.id).label('player_count'))
        .group_by(Tournament.id)
        .order_by(Tournament.start_date.desc())
        .all()
    )
    result = []
    for t, player_count in tournaments:
        d = t.to_dict()
        d['player_count'] = player_count
        result.append(d)
    return jsonify(result)


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
