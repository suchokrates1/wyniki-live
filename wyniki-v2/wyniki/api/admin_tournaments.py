"""Admin API routes for tournaments and players management."""
from flask import Blueprint, jsonify, request
from typing import Dict, Any

from ..database import (
    fetch_tournaments,
    fetch_tournament,
    insert_tournament,
    update_tournament,
    delete_tournament,
    set_active_tournament,
    fetch_players,
    fetch_active_tournament_players,
    insert_player,
    update_player,
    delete_player,
    bulk_insert_players
)
from ..config import logger

blueprint = Blueprint('admin_tournaments', __name__, url_prefix='/admin/api/tournaments')


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
    return jsonify(tournament)


@blueprint.route('', methods=['POST'])
def create_tournament():
    """Create a new tournament."""
    data = request.get_json()
    
    name = data.get('name')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    active = data.get('active', False)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    tournament_id = insert_tournament(name, start_date, end_date, active)
    
    if tournament_id:
        return jsonify({"id": tournament_id, "message": "Tournament created"}), 201
    else:
        return jsonify({"error": "Failed to create tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['PUT'])
def update_tournament_route(tournament_id: int):
    """Update a tournament."""
    data = request.get_json()
    
    name = data.get('name')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    active = data.get('active', False)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    success = update_tournament(tournament_id, name, start_date, end_date, active)
    
    if success:
        return jsonify({"message": "Tournament updated"})
    else:
        return jsonify({"error": "Failed to update tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['DELETE'])
def delete_tournament_route(tournament_id: int):
    """Delete a tournament."""
    success = delete_tournament(tournament_id)
    
    if success:
        return jsonify({"message": "Tournament deleted"})
    else:
        return jsonify({"error": "Failed to delete tournament"}), 500


@blueprint.route('/<int:tournament_id>/activate', methods=['POST'])
def activate_tournament(tournament_id: int):
    """Set a tournament as active."""
    success = set_active_tournament(tournament_id)
    
    if success:
        return jsonify({"message": "Tournament activated"})
    else:
        return jsonify({"error": "Failed to activate tournament"}), 500


# ==================== PLAYERS ====================

@blueprint.route('/<int:tournament_id>/players', methods=['GET'])
def get_tournament_players(tournament_id: int):
    """Get all players for a tournament."""
    players = fetch_players(tournament_id)
    return jsonify(players)


@blueprint.route('/<int:tournament_id>/players', methods=['POST'])
def create_player(tournament_id: int):
    """Add a player to a tournament."""
    data = request.get_json()
    
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    name = data.get('name', '').strip()
    
    # Backward compat: if only name provided, split it
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
    data = request.get_json()
    
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    name = data.get('name', '').strip()
    
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
    
    category = data.get('category', '')
    country = data.get('country', '')
    gender = data.get('gender', '')
    
    success = update_player(player_id, name, category, country,
                            first_name=first_name, last_name=last_name,
                            gender=gender)
    
    if success:
        return jsonify({"message": "Player updated"})
    else:
        return jsonify({"error": "Failed to update player"}), 500


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['DELETE'])
def delete_player_route(tournament_id: int, player_id: int):
    """Delete a player."""
    success = delete_player(player_id)
    
    if success:
        return jsonify({"message": "Player deleted"})
    else:
        return jsonify({"error": "Failed to delete player"}), 500


@blueprint.route('/<int:tournament_id>/players/import', methods=['POST'])
def import_players(tournament_id: int):
    """Bulk import players from text format.
    
    Expected format (one per line):
    Name Category Country
    Example: John Doe B1 us
    """
    data = request.get_json()
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    # Parse text
    players_data = []
    lines = text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        parts = line.rsplit(' ', 2)  # Split from right to get category and country
        
        if len(parts) == 3:
            name, category, country = parts
        elif len(parts) == 2:
            name, category = parts
            country = ""
        else:
            name = line
            category = ""
            country = ""
        
        name = name.strip()
        name_parts = name.rsplit(' ', 1)
        if len(name_parts) == 2:
            first_name, last_name = name_parts[0], name_parts[1]
        else:
            first_name, last_name = '', name
        
        players_data.append({
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "category": category.strip(),
            "country": country.strip()
        })
    
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400
    
    count = bulk_insert_players(tournament_id, players_data)
    
    return jsonify({
        "message": f"Imported {count} players",
        "count": count
    })


@blueprint.route('/<int:tournament_id>/players/bulk', methods=['POST'])
def bulk_import_players(tournament_id: int):
    """Bulk import pre-parsed players from JSON array.
    
    Expected JSON: { "players": [{"name": "...", "category": "...", "country": "..."}] }
    """
    data = request.get_json()
    players = data.get('players', [])
    
    if not players:
        return jsonify({"error": "No players provided"}), 400
    
    players_data = []
    for p in players:
        name = p.get('name', '').strip()
        if not name:
            continue
        name_parts = name.rsplit(' ', 1)
        if len(name_parts) == 2:
            first_name, last_name = name_parts[0], name_parts[1]
        else:
            first_name, last_name = '', name
        
        players_data.append({
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "category": p.get('category', '').strip(),
            "country": p.get('country', '').strip()
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


@players_public_bp.route('/active', methods=['GET'])
def get_active_players():
    """Get players from active tournament (for Umpire App)."""
    players = fetch_active_tournament_players()
    
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
    """Get all players across all tournaments with match stats."""
    from wyniki.db_models import Player, Tournament, MatchHistory
    from sqlalchemy import func, or_
    
    # Query all players
    players = Player.query.join(Tournament).order_by(Player.last_name, Player.first_name).all()
    
    result = []
    for p in players:
        full_name = p.full_name
        
        # Count matches where player appeared (as player_a or player_b)
        match_count = MatchHistory.query.filter(
            or_(MatchHistory.player_a == full_name, MatchHistory.player_b == full_name)
        ).count()
        
        # Count wins
        wins = 0
        matches = MatchHistory.query.filter(
            or_(MatchHistory.player_a == full_name, MatchHistory.player_b == full_name)
        ).all()
        for m in matches:
            if not m.score_a or not m.score_b:
                continue
            try:
                import json
                sa = json.loads(m.score_a) if isinstance(m.score_a, str) else m.score_a
                sb = json.loads(m.score_b) if isinstance(m.score_b, str) else m.score_b
                sets_a = sum(1 for i in range(len(sa)) for _ in [1] if i < len(sb) and sa[i] > sb[i])
                sets_b = sum(1 for i in range(len(sb)) for _ in [1] if i < len(sa) and sb[i] > sa[i])
                if m.player_a == full_name and sets_a > sets_b:
                    wins += 1
                elif m.player_b == full_name and sets_b > sets_a:
                    wins += 1
            except (json.JSONDecodeError, TypeError):
                pass
        
        result.append({
            'id': p.id,
            'name': full_name,
            'first_name': p.first_name or '',
            'last_name': p.last_name or '',
            'gender': p.gender or '',
            'category': p.category or '',
            'country': (p.country or '').upper(),
            'tournament_id': p.tournament_id,
            'tournament_name': p.tournament.name if p.tournament else '',
            'matches_played': match_count,
            'wins': wins,
            'losses': match_count - wins
        })
    
    return jsonify(result)
