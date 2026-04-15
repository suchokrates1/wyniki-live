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


@players_public_bp.route('/<int:player_id>/profile', methods=['GET'])
def get_player_profile(player_id: int):
    """Get full player profile: info, tournament history, matches, medals."""
    import json
    from wyniki.db_models import Player, Tournament, MatchHistory
    from wyniki.database import get_full_bracket
    from sqlalchemy import or_

    player = Player.query.get(player_id)
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    full_name = player.full_name
    last_name = (player.last_name or '').strip()

    # Find all Player entries with same last_name (player may appear in multiple tournaments)
    if last_name:
        siblings = Player.query.filter_by(last_name=last_name).filter(
            Player.first_name == player.first_name
        ).all()
    else:
        siblings = [player]

    tournament_ids = list({s.tournament_id for s in siblings if s.tournament_id})

    # Fetch all matches for this player across all tournaments
    all_matches = MatchHistory.query.filter(
        or_(MatchHistory.player_a == full_name, MatchHistory.player_b == full_name)
    ).order_by(MatchHistory.ended_ts.desc()).all()

    # Also try matching by last_name alone (match_history stores surnames)
    if last_name and last_name != full_name:
        surname_matches = MatchHistory.query.filter(
            or_(MatchHistory.player_a == last_name, MatchHistory.player_b == last_name)
        ).order_by(MatchHistory.ended_ts.desc()).all()
        existing_ids = {m.id for m in all_matches}
        for sm in surname_matches:
            if sm.id not in existing_ids:
                all_matches.append(sm)

    def parse_sets_history(m):
        """Parse sets_history from a MatchHistory entry."""
        sets = []
        if m.sets_history:
            try:
                sh = json.loads(m.sets_history) if isinstance(m.sets_history, str) else m.sets_history
                for s in sh:
                    sets.append({
                        'g1': s.get('player1_games', 0),
                        'g2': s.get('player2_games', 0),
                        'tb': s.get('tiebreak_loser_points'),
                        'stb': bool(s.get('is_super_tiebreak', False))
                    })
            except (json.JSONDecodeError, TypeError):
                pass
        if not sets and m.score_a and m.score_b:
            try:
                sa = json.loads(m.score_a) if isinstance(m.score_a, str) else m.score_a
                sb = json.loads(m.score_b) if isinstance(m.score_b, str) else m.score_b
                for i in range(max(len(sa), len(sb))):
                    sets.append({
                        'g1': sa[i] if i < len(sa) else 0,
                        'g2': sb[i] if i < len(sb) else 0,
                        'tb': None, 'stb': False
                    })
            except (json.JSONDecodeError, TypeError):
                pass
        return sets

    def determine_winner(m):
        """Determine winner of a MatchHistory entry."""
        try:
            sa = json.loads(m.score_a) if isinstance(m.score_a, str) else (m.score_a or [])
            sb = json.loads(m.score_b) if isinstance(m.score_b, str) else (m.score_b or [])
            sets_a = sum(1 for i in range(min(len(sa), len(sb))) if sa[i] > sb[i])
            sets_b = sum(1 for i in range(min(len(sa), len(sb))) if sb[i] > sa[i])
            if sets_a > sets_b:
                return m.player_a
            elif sets_b > sets_a:
                return m.player_b
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    def is_this_player(name):
        """Check if a name refers to this player."""
        if not name:
            return False
        return name == full_name or name == last_name

    # Build per-tournament data
    tournaments_data = []
    for tid in tournament_ids:
        tourn = Tournament.query.get(tid)
        if not tourn:
            continue

        # Get bracket data for this tournament
        bracket = get_full_bracket(tid)

        # Find player's group placement
        group_name = None
        group_position = None
        group_total = None
        if bracket and 'groups' in bracket:
            for g in bracket['groups']:
                for si, st in enumerate(g.get('standings', [])):
                    sname = st.get('name', '')
                    if sname == last_name or sname == full_name:
                        group_name = g['name']
                        group_position = si + 1
                        group_total = len(g['standings'])
                        break
                if group_name:
                    break

        # Find knockout placement (medals)
        medal = None  # '🥇','🥈','🥉' or None
        knockout_phase = None
        if bracket and 'knockout' in bracket:
            for phase, slots in bracket['knockout'].items():
                for slot in slots:
                    winner = slot.get('winner', '')
                    p1 = slot.get('player1', '')
                    p2 = slot.get('player2', '')
                    is_participant = (last_name and (last_name in p1 or last_name in p2)) or \
                                    (full_name and (full_name in p1 or full_name in p2))
                    if not is_participant:
                        continue
                    is_winner = winner and (last_name in winner or full_name in winner)
                    phase_lc = phase.lower()
                    if 'finał' in phase_lc or 'final' in phase_lc:
                        if is_winner:
                            medal = 'gold'
                        else:
                            medal = 'silver'
                        knockout_phase = phase
                    elif '3.' in phase or 'trzecie' in phase_lc or 'third' in phase_lc:
                        if is_winner:
                            medal = medal or 'bronze'
                        knockout_phase = phase
                    elif '5.' in phase or 'piąte' in phase_lc or 'fifth' in phase_lc:
                        if is_winner and not medal:
                            medal = '5th'
                        if not knockout_phase:
                            knockout_phase = phase

        # Filter matches for this tournament
        tourn_matches = [m for m in all_matches if m.tournament_id == tid]
        matches_detail = []
        wins = 0
        losses = 0
        for m in sorted(tourn_matches, key=lambda x: x.ended_ts or ''):
            winner = determine_winner(m)
            is_player_a = is_this_player(m.player_a)
            opponent = m.player_b if is_player_a else m.player_a
            won = (is_player_a and winner == m.player_a) or \
                  (not is_player_a and winner == m.player_b)
            if won:
                wins += 1
            else:
                losses += 1

            matches_detail.append({
                'opponent': opponent,
                'score': parse_sets_history(m),
                'won': won,
                'phase': m.phase or '',
                'category': m.category or '',
                'date': m.ended_ts or '',
                'duration': m.duration_seconds or 0
            })

        tournaments_data.append({
            'tournament_id': tid,
            'tournament_name': tourn.name,
            'start_date': tourn.start_date or '',
            'end_date': tourn.end_date or '',
            'group_name': group_name,
            'group_position': group_position,
            'group_total': group_total,
            'medal': medal,
            'knockout_phase': knockout_phase,
            'matches_played': len(matches_detail),
            'wins': wins,
            'losses': losses,
            'matches': matches_detail
        })

    # Career totals
    total_matches = sum(t['matches_played'] for t in tournaments_data)
    total_wins = sum(t['wins'] for t in tournaments_data)
    medals = {'gold': 0, 'silver': 0, 'bronze': 0}
    for t in tournaments_data:
        if t['medal'] in medals:
            medals[t['medal']] += 1

    return jsonify({
        'player': {
            'id': player.id,
            'first_name': player.first_name or '',
            'last_name': player.last_name or '',
            'full_name': full_name,
            'gender': player.gender or '',
            'category': player.category or '',
            'country': (player.country or '').upper(),
        },
        'career': {
            'tournaments': len(tournaments_data),
            'matches': total_matches,
            'wins': total_wins,
            'losses': total_matches - total_wins,
            'medals': medals
        },
        'tournaments': sorted(tournaments_data, key=lambda t: t.get('start_date', ''), reverse=True)
    })
