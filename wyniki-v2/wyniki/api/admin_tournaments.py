"""Admin API routes for tournaments and players management."""
from typing import Any

from flask import Blueprint, jsonify, request

from ..config import logger as logger
from ..config import settings as settings  # the player import reads its AI settings; tests patch them here
from ..database import (
    StreamUrlError,
    counting_history_for,
    delete_tournament,
    entries_in_counting_tournaments,
    fetch_active_tournaments,
    fetch_courts,
    fetch_players,
    fetch_players_for_active_tournaments,
    fetch_tournament,
    fetch_tournament_categories,
    fetch_tournaments,
    fetch_umpire_active_tournaments,
    get_row,
    get_tournament_court_streams,
    global_player_matching,
    save_tournament_court_streams,
    set_tournament_active_state,
)
from ..database.tournament_titles import title_fields
from ..services.history_results import result_winner
from ..services.office_event_broker import emit_office_invalidation
from ..services.office_workflow import (
    _normalize_bool,
)
from ..services.player_profile import build_player_profile
from ..utils import json_no_cache as _json_no_cache
from . import tournament_setup
from ..services import tournament_entries, tournament_settings
from ..database.series_records import set_visibility_lock, visibility_locks
from .player_import import (
    _apply_import_ai_suggestions as _apply_import_ai_suggestions,
)
from .player_import import (
    _build_import_player_entry as _build_import_player_entry,
)
from .player_import import (
    _clean_import_line_text as _clean_import_line_text,
)
from .player_import import (
    _dedupe_import_warnings as _dedupe_import_warnings,
)
from .player_import import (
    _extract_gemini_json_text as _extract_gemini_json_text,
)
from .player_import import (
    _fetch_import_ai_suggestions as _fetch_import_ai_suggestions,
)
from .player_import import (
    _needs_import_ai_help as _needs_import_ai_help,
)
from .player_import import (
    _parse_import_player_line as _parse_import_player_line,
)
from .player_import import (
    _parse_import_section_header as _parse_import_section_header,
)
from .player_import import (
    _should_skip_import_line as _should_skip_import_line,
)

blueprint = Blueprint('admin_tournaments', __name__, url_prefix='/admin/api/tournaments')


@blueprint.after_request
def _emit_admin_tournament_invalidation(response):
    """Keep active office sessions current after an admin tournament write."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and response.status_code < 400:
        tournament_id = (request.view_args or {}).get("tournament_id")
        if tournament_id is not None:
            emit_office_invalidation(int(tournament_id), ["dashboard"])
    return response


def _request_payload() -> dict[str, Any]:
    """Read tournament payload from JSON or multipart form."""
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def _require_tournament(tournament_id: int, active_only: bool = False):
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return None, (jsonify({"error": "Tournament not found"}), 404)
    if active_only and int(tournament.get("active") or 0) != 1:
        return None, (jsonify({"error": "Tournament is inactive"}), 409)
    return tournament, None


@blueprint.route('', methods=['GET'])
def get_tournaments():
    tournaments = fetch_tournaments()
    locks = visibility_locks()
    return jsonify([{**t, **title_fields(t['id'], t['name']), 'visibility_lock': locks.get(t['id'], '')} for t in tournaments])


@blueprint.route('/<int:tournament_id>', methods=['GET'])
def get_tournament(tournament_id: int):
    """Get a single tournament."""
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return jsonify({"error": "Tournament not found"}), 404
    tournament['tournament_categories'] = fetch_tournament_categories(tournament_id)
    return jsonify(tournament)


@blueprint.route('/<int:tournament_id>/categories', methods=['GET'])
def list_tournament_categories(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    body, status = tournament_setup.list_categories(tournament_id)
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>/categories/confirm', methods=['POST'])
def confirm_tournament_categories_route(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    body, status = tournament_setup.confirm_categories(tournament_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>/categories', methods=['POST'])
def create_tournament_category_route(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    body, status = tournament_setup.create_category(tournament_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>/categories/<int:category_id>', methods=['PUT', 'PATCH'])
def update_tournament_category_route(tournament_id: int, category_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    body, status = tournament_setup.update_category(tournament_id, category_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>/categories/<int:category_id>', methods=['DELETE'])
def delete_tournament_category_route(tournament_id: int, category_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    body, status = tournament_setup.delete_category(tournament_id, category_id)
    return jsonify(body), status


@blueprint.route('', methods=['POST'])
def create_tournament():
    body, status = tournament_settings.create_from(_request_payload(), request.files.get('logo'))
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>', methods=['PUT'])
def update_tournament_route(tournament_id: int):
    data = _request_payload()
    body, status = tournament_settings.update_from(tournament_id, data, request.files.get('logo'))
    if status == 200 and 'visibility_lock' in data:
        set_visibility_lock(tournament_id, data.get('visibility_lock'))
    return jsonify(body), status


@blueprint.route('/<int:tournament_id>', methods=['DELETE'])
def delete_tournament_route(tournament_id: int):
    success = delete_tournament(tournament_id)
    
    if success:
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({"message": "Tournament deleted"})
    else:
        return jsonify({"error": "Failed to delete tournament"}), 500


@blueprint.route('/<int:tournament_id>/active', methods=['PUT'])
def update_tournament_active_state(tournament_id: int):
    """Toggle active state for a single tournament without affecting others."""
    data = request.get_json(silent=True) or {}
    active = _normalize_bool(data.get('active', False))
    success = set_tournament_active_state(tournament_id, active)

    if success:
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({"message": "Tournament state updated", "active": active})
    return jsonify({"error": "Failed to update tournament state"}), 500


# ==================== TOURNAMENT OFFICE ====================


@blueprint.route('/<int:tournament_id>/court-streams', methods=['GET'])
def admin_tournament_court_streams_get(tournament_id: int):
    """Return the day × court stream URL grid for a tournament."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    return _json_no_cache({"court_streams": get_tournament_court_streams(tournament_id)})


@blueprint.route('/<int:tournament_id>/court-streams', methods=['PUT'])
def admin_tournament_court_streams_save(tournament_id: int):
    """Save YouTube / stream URLs per tournament day and court."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    try:
        court_streams = save_tournament_court_streams(tournament_id, data)
    except StreamUrlError as exc:
        return _json_no_cache({"error": "invalid_url", "cells": exc.cells}, 400)
    return _json_no_cache({"court_streams": court_streams})


# ==================== PLAYERS ====================

@blueprint.route('/<int:tournament_id>/players', methods=['GET'])
def get_tournament_players(tournament_id: int):
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    players = fetch_players(tournament_id)
    return jsonify(players)


@blueprint.route('/<int:tournament_id>/players', methods=['POST'])
def create_player(tournament_id: int):
    """Add a player to a tournament."""
    return _with_active(tournament_id, lambda: tournament_entries.add_entry(tournament_id, request.get_json(silent=True) or {}))


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['PUT'])
def update_player_route(tournament_id: int, player_id: int):
    return _with_active(tournament_id, lambda: tournament_entries.update_entry(tournament_id, player_id, request.get_json(silent=True) or {}))


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['DELETE'])
def delete_player_route(tournament_id: int, player_id: int):
    return _with_active(tournament_id, lambda: tournament_entries.delete_entry(tournament_id, player_id))


@blueprint.route('/<int:tournament_id>/players/parse-import', methods=['POST'])
def parse_import_players(tournament_id: int):
    """Parse free-form tournament player import text and return preview data."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    body, status = tournament_entries.parse_import(tournament_id, request.get_json(silent=True) or {})
    return _json_no_cache(body, status) if status == 200 else (jsonify(body), status)


@blueprint.route('/<int:tournament_id>/players/bulk', methods=['POST'])
def bulk_import_players(tournament_id: int):
    """Bulk import pre-parsed players: { "players": [{"name": "...", "category": "...", "country": "..."}] }"""
    return _with_active(tournament_id, lambda: tournament_entries.bulk_import(tournament_id, request.get_json(silent=True) or {}))


def _with_active(tournament_id: int, action):
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    body, status = action()
    return jsonify(body), status


# ==================== PUBLIC API ====================

players_public_bp = Blueprint('players_public', __name__, url_prefix='/api/players')


@blueprint.route('/active', methods=['GET'])
def get_active_tournaments_admin():
    """Get only active tournaments for admin integrations."""
    return _json_no_cache(fetch_active_tournaments())


tournaments_public_bp = Blueprint('tournaments_public', __name__, url_prefix='/api/tournaments')


@tournaments_public_bp.route('/active', methods=['GET'])
def get_active_tournaments_public():
    """Active tournaments for the Android app, including Play-review simulations."""
    payload = fetch_umpire_active_tournaments()
    for tournament in payload:
        tournament.pop("access_key", None)
    return _json_no_cache(payload)


@players_public_bp.route('/active', methods=['GET'])
def get_active_players():
    """Get players from all active tournaments (for Umpire App)."""
    players = fetch_players_for_active_tournaments(public_only=True, include_simulations=True)
    
    # Format for Umpire mobile app
    result = [
        {
            "name": f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or p["name"],
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "surname": p.get("last_name", ""),
            "full_name": f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or p["name"],
            "category": p.get("category", ""),
            "country": p.get("country", "")
        }
        for p in players
    ]
    
    return jsonify(result)


@players_public_bp.route('/all', methods=['GET'])
def get_all_players():
    """Get all players across all tournaments with match stats.
    Deduplicates by global_player_id (or name), preferring the latest tournament entry.
    """
    from wyniki.db_models import GlobalPlayer, Player
    from wyniki.services.categories import normalize_player_classification

    players = entries_in_counting_tournaments()

    def _dedup_key(player: Player) -> str:
        if player.global_player_id:
            return f"g:{player.global_player_id}"
        gp = global_player_matching(player.first_name, player.last_name)
        if gp:
            return f"g:{gp.id}"
        return f"n:{player.full_name.strip().lower()}"

    def _resolve_category(player: Player, global_player: GlobalPlayer | None) -> str:
        category = normalize_player_classification(player.category or '')
        if not category and global_player:
            category = normalize_player_classification(global_player.category or '')
        return category

    def _resolve_gender(player: Player, global_player: GlobalPlayer | None) -> str:
        gender = (player.gender or '').strip()
        if not gender and global_player:
            gender = (global_player.gender or '').strip()
        return gender

    def _resolve_country(player: Player, global_player: GlobalPlayer | None) -> str:
        country = (player.country or '').strip().upper()
        if not country and global_player:
            country = (global_player.country or '').strip().upper()
        return country

    grouped: dict[str, list[Player]] = {}
    for player in players:
        grouped.setdefault(_dedup_key(player), []).append(player)

    result = []
    for _key, group in grouped.items():
        canonical = group[0]
        gid = canonical.global_player_id
        if not gid and _key.startswith('g:'):
            gid = int(_key.split(':', 1)[1])
        global_player = get_row(GlobalPlayer, gid) if gid else None
        full_name = canonical.full_name

        counting_matches = counting_history_for(full_name)
        match_count = len(counting_matches)

        wins = sum(1 for match in counting_matches if result_winner(match) == full_name)

        result.append({
            'id': canonical.id,
            'global_player_id': gid,
            'name': full_name,
            'first_name': canonical.first_name or '',
            'last_name': canonical.last_name or '',
            'gender': _resolve_gender(canonical, global_player),
            'category': _resolve_category(canonical, global_player),
            'country': _resolve_country(canonical, global_player),
            'tournament_id': canonical.tournament_id,
            'tournament_name': canonical.tournament.name if canonical.tournament else '',
            'matches_played': match_count,
            'wins': wins,
            'losses': match_count - wins,
        })

    result.sort(key=lambda row: (row.get('last_name', ''), row.get('first_name', '')))
    return _json_no_cache(result)


@players_public_bp.route('/<int:player_id>/profile', methods=['GET'])
def get_player_profile(player_id: int):
    """A player's public profile, by tournament entry id or, with ?global=1, by global player id."""
    profile = build_player_profile(player_id, is_global=request.args.get('global', '0') == '1')
    if profile is None:
        return jsonify({'error': 'Player not found'}), 404
    return jsonify(profile)
