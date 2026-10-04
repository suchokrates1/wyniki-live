"""Admin API routes for tournaments and players management."""
from pathlib import Path
from typing import Any
from uuid import uuid4

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from ..config import logger as logger
from ..config import settings
from ..database import (
    StreamUrlError,
    bulk_insert_players,
    counting_history_for,
    create_tournament_courts,
    delete_player,
    delete_tournament,
    entries_in_counting_tournaments,
    fetch_active_tournaments,
    fetch_courts,
    fetch_courts_for_tournament,
    fetch_players,
    fetch_players_for_active_tournaments,
    fetch_tournament,
    fetch_tournament_categories,
    fetch_tournaments,
    fetch_umpire_active_tournaments,
    get_planning_mixed_bands,
    get_row,
    get_tournament_court_streams,
    global_player_matching,
    insert_player,
    insert_tournament,
    save_tournament_court_streams,
    set_active_tournament,
    set_tournament_active_state,
    sync_tournament_courts,
    update_player,
    update_tournament,
)
from ..db_models import Tournament
from ..services.history_results import result_winner
from ..services.office_event_broker import emit_office_invalidation
from ..services.office_workflow import (
    _normalize_bool,
    _normalize_int,
)
from ..services.player_profile import build_player_profile
from ..utils import json_no_cache as _json_no_cache
from . import tournament_setup
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
    _normalize_import_category,
    _normalize_import_country,
    _normalize_import_gender,
    _parse_import_players_with_ai,
    _summarize_import_players,
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


def _normalize_tournament_flags(data: dict[str, Any]) -> tuple[bool, bool, bool, str]:
    is_simulation = _normalize_bool(data.get('is_simulation', False))
    is_public = _normalize_bool(data.get('is_public', not is_simulation))
    stats_enabled = _normalize_bool(data.get('stats_enabled', not is_simulation))
    if is_simulation:
        is_public = False
        stats_enabled = False
    access_key = (data.get('access_key') or '').strip()
    return is_public, stats_enabled, is_simulation, access_key


def _normalize_office_password_hash(raw_password: Any, *, existing_hash: str = '', is_simulation: bool = False, is_create: bool = False) -> str:
    password = str(raw_password or '').strip()
    if is_simulation and not password and (is_create or not existing_hash):
        password = 'test'
    if password:
        return generate_password_hash(password)
    return existing_hash or ''


def _save_tournament_logo(uploaded_file, tournament_name: str) -> str | None:
    """Save uploaded tournament logo and return public path."""
    if not uploaded_file or not uploaded_file.filename:
        return None

    data_dir = Path(settings.database_path).parent
    logos_dir = data_dir / 'tournament-logos'
    logos_dir.mkdir(parents=True, exist_ok=True)

    extension = Path(secure_filename(uploaded_file.filename)).suffix.lower() or '.png'
    stem = secure_filename(tournament_name) or 'tournament'
    file_name = f"{stem}-{uuid4().hex[:8]}{extension}"
    target = logos_dir / file_name
    uploaded_file.save(target)
    return f"/data/tournament-logos/{file_name}"


def _require_tournament(tournament_id: int, active_only: bool = False):
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return None, (jsonify({"error": "Tournament not found"}), 404)
    if active_only and int(tournament.get("active") or 0) != 1:
        return None, (jsonify({"error": "Tournament is inactive"}), 409)
    return tournament, None


@blueprint.route('', methods=['GET'])
def get_tournaments():
    """Get all tournaments."""
    tournaments = fetch_tournaments()
    return jsonify(tournaments)


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
    """Create a new tournament."""
    data = _request_payload()
    
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    active = _normalize_bool(data.get('active', False))
    city = (data.get('city') or '').strip()
    country = (data.get('country') or '').strip().upper()
    report_email = (data.get('report_email') or '').strip()
    court_count = _normalize_int(data.get('court_count'), 0)
    is_public, stats_enabled, is_simulation, access_key = _normalize_tournament_flags(data)
    office_password_hash = _normalize_office_password_hash(data.get('office_password'), is_simulation=is_simulation, is_create=True)
    logo_path = _save_tournament_logo(request.files.get('logo'), name)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    tournament_id = insert_tournament(
        name,
        start_date,
        end_date,
        active=active,
        city=city,
        country=country,
        logo_path=logo_path,
        report_email=report_email,
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash,
    )
    
    if tournament_id:
        created_courts = create_tournament_courts(tournament_id, court_count)
        if active:
            set_active_tournament(tournament_id)
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({
            "id": tournament_id,
            "message": "Tournament created",
            "created_courts": created_courts,
        }), 201
    else:
        return jsonify({"error": "Failed to create tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['PUT'])
def update_tournament_route(tournament_id: int):
    """Update a tournament."""
    existing = fetch_tournament(tournament_id)
    if not existing:
        return jsonify({"error": "Tournament not found"}), 404

    data = _request_payload()
    existing_row = get_row(Tournament, tournament_id)
    
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    active = _normalize_bool(data.get('active', False))
    city = (data.get('city') or '').strip()
    country = (data.get('country') or '').strip().upper()
    report_email = (data.get('report_email') or '').strip()
    requested_court_count = _normalize_int(data.get('court_count'), existing.get('court_count') or 0)
    is_public, stats_enabled, is_simulation, access_key = _normalize_tournament_flags(data)
    office_password_hash = _normalize_office_password_hash(
        data.get('office_password'),
        existing_hash=existing_row.office_password_hash if existing_row else '',
        is_simulation=is_simulation,
        is_create=False,
    )
    logo_path = existing.get('logo_path')
    if request.files.get('logo'):
        logo_path = _save_tournament_logo(request.files.get('logo'), name)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400

    if requested_court_count < 0:
        return jsonify({"error": "Court count cannot be negative"}), 400

    current_courts = fetch_courts_for_tournament(tournament_id)
    current_count = len(current_courts)
    if requested_court_count < current_count:
        from ..services.court_manager import get_court_state

        removable_candidates = sorted(
            current_courts,
            key=lambda court: (int(court.get('display_order') or 0), str(court.get('kort_id') or '')),
            reverse=True,
        )[: current_count - requested_court_count]
        busy_courts = []
        for court in removable_candidates:
            kort_id = str(court.get('kort_id') or '')
            state = get_court_state(kort_id)
            if state and state.get('match_status', {}).get('active'):
                busy_courts.append(kort_id)

        if busy_courts:
            return jsonify({
                "error": f"Cannot remove active courts: {', '.join(busy_courts)}",
            }), 400
    
    success = update_tournament(
        tournament_id,
        name,
        start_date,
        end_date,
        active,
        city=city,
        country=country,
        logo_path=logo_path,
        report_email=report_email,
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash,
    )
    
    if success:
        court_changes = sync_tournament_courts(tournament_id, requested_court_count)
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        if active:
            set_active_tournament(tournament_id)
        return jsonify({
            "message": "Tournament updated",
            "created_courts": court_changes["created"],
            "deleted_courts": court_changes["deleted"],
        })
    else:
        return jsonify({"error": "Failed to update tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['DELETE'])
def delete_tournament_route(tournament_id: int):
    """Delete a tournament."""
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
    """Get all players for a tournament."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    players = fetch_players(tournament_id)
    return jsonify(players)


@blueprint.route('/<int:tournament_id>/players', methods=['POST'])
def create_player(tournament_id: int):
    """Add a player to a tournament."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    names = tournament_setup.player_names(data)
    if not names:
        return jsonify({"error": "Name is required"}), 400
    name, first_name, last_name = names
    category = data.get('category', '')
    country = data.get('country', '')
    gender = data.get('gender', '')
    
    player_id = insert_player(tournament_id, name, category, country,
                              first_name=first_name, last_name=last_name,
                              gender=gender)
    
    if player_id:
        return jsonify({"id": player_id, "message": "Player added"}), 201
    else:
        return jsonify({"error": "Failed to add player"}), 500


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['PUT'])
def update_player_route(tournament_id: int, player_id: int):
    """Update a player."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    names = tournament_setup.player_names(data)
    if not names:
        return jsonify({"error": "Name is required"}), 400
    name, first_name, last_name = names
    category = data.get('category', '')
    country = data.get('country', '')
    gender = data.get('gender', '')
    
    success = update_player(player_id, name, category, country,
                            first_name=first_name, last_name=last_name,
                            gender=gender, tournament_id=tournament_id)
    
    if success:
        return jsonify({"message": "Player updated"})
    else:
        return jsonify({"error": "Player not found in tournament"}), 404


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['DELETE'])
def delete_player_route(tournament_id: int, player_id: int):
    """Delete a player."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    success = delete_player(player_id, tournament_id=tournament_id)
    
    if success:
        return jsonify({"message": "Player deleted"})
    else:
        return jsonify({"error": "Player not found in tournament"}), 404


@blueprint.route('/<int:tournament_id>/players/parse-import', methods=['POST'])
def parse_import_players(tournament_id: int):
    """Parse free-form tournament player import text and return preview data."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "No text provided"}), 400

    mixed_bands = get_planning_mixed_bands(tournament_id)
    players_data = _parse_import_players_with_ai(text, mixed_bands)
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400

    return _json_no_cache({
        'players': players_data,
        'tournament_categories': fetch_tournament_categories(tournament_id),
        'summary': _summarize_import_players(players_data),
        'needs_attention_count': sum(1 for player in players_data if player.get('warnings')),
        'count': len(players_data),
    })


@blueprint.route('/<int:tournament_id>/players/bulk', methods=['POST'])
def bulk_import_players(tournament_id: int):
    """Bulk import pre-parsed players from JSON array.
    
    Expected JSON: { "players": [{"name": "...", "category": "...", "country": "..."}] }
    """
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    players = data.get('players', [])
    
    if not players:
        return jsonify({"error": "No players provided"}), 400
    
    players_data = []
    for p in players:
        name = p.get('name', '').strip()
        first_name = p.get('first_name', '').strip()
        last_name = p.get('last_name', '').strip()
        if not first_name and not last_name:
            if not name:
                continue
            name_parts = name.rsplit(' ', 1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts[0], name_parts[1]
            else:
                first_name, last_name = '', name
        if not name:
            name = f"{first_name} {last_name}".strip()
        
        players_data.append({
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "category": _normalize_import_category(p.get('category', '')).strip(),
            "country": _normalize_import_country(p.get('country', '')).strip(),
            "gender": _normalize_import_gender(p.get('gender', '')).strip(),
        })
    
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400
    
    count = bulk_insert_players(tournament_id, players_data)
    
    return jsonify({
        "message": f"Imported {count} players",
        "count": count
    })


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
