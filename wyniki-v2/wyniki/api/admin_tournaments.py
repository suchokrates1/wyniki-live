"""Admin API routes for tournaments and players management."""
from flask import Blueprint, jsonify, request
from pathlib import Path
from typing import Dict, Any
from uuid import uuid4

from werkzeug.utils import secure_filename

from ..db_models import db
from ..database import (
    fetch_tournaments,
    fetch_active_tournaments,
    fetch_tournament,
    insert_tournament,
    update_tournament,
    delete_tournament,
    set_active_tournament,
    set_tournament_active_state,
    create_tournament_courts,
    sync_tournament_courts,
    fetch_courts_for_tournament,
    fetch_courts,
    fetch_players,
    fetch_active_tournament_players,
    fetch_players_for_active_tournaments,
    insert_player,
    update_player,
    delete_player,
    bulk_insert_players
)
from ..config import logger, settings

blueprint = Blueprint('admin_tournaments', __name__, url_prefix='/admin/api/tournaments')


def _json_no_cache(payload, status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def _request_payload() -> Dict[str, Any]:
    """Read tournament payload from JSON or multipart form."""
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def _normalize_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


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
    return jsonify(tournament)


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
    
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    active = _normalize_bool(data.get('active', False))
    city = (data.get('city') or '').strip()
    country = (data.get('country') or '').strip().upper()
    report_email = (data.get('report_email') or '').strip()
    requested_court_count = _normalize_int(data.get('court_count'), existing.get('court_count') or 0)
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


@blueprint.route('/<int:tournament_id>/activate', methods=['POST'])
def activate_tournament(tournament_id: int):
    """Set a tournament as active."""
    success = set_active_tournament(tournament_id)
    
    if success:
        return jsonify({"message": "Tournament activated"})
    else:
        return jsonify({"error": "Failed to activate tournament"}), 500


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
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    
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


@blueprint.route('/<int:tournament_id>/players/import', methods=['POST'])
def import_players(tournament_id: int):
    """Bulk import players from text format.
    
    Expected format (one per line):
    Name Category Country
    Example: John Doe B1 us
    """
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
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
            "category": p.get('category', '').strip(),
            "country": p.get('country', '').strip(),
            "gender": p.get('gender', '').strip(),
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
    """Get active tournaments for the Android app selection screen."""
    return _json_no_cache(fetch_active_tournaments())


@players_public_bp.route('/active', methods=['GET'])
def get_active_players():
    """Get players from all active tournaments (for Umpire App)."""
    players = fetch_players_for_active_tournaments()
    
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
    Deduplicates by global_player_id, aggregating stats across tournaments.
    """
    import json
    from wyniki.db_models import Player, Tournament, MatchHistory
    from sqlalchemy import func, or_
    
    # Query all players
    players = Player.query.join(Tournament).order_by(Player.last_name, Player.first_name).all()
    
    # Deduplicate by global_player_id — aggregate stats across tournaments
    seen_global = {}
    result = []
    for p in players:
        gid = p.global_player_id
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
        
        if gid and gid in seen_global:
            # Already seen this global player — skip (stats are same since same full_name)
            continue
        
        if gid:
            seen_global[gid] = True
        
        result.append({
            'id': p.id,
            'global_player_id': gid,
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
    """Get full player profile: info, tournament history, matches, medals.
    Accepts either a Player id (tournament entry) or a GlobalPlayer id via ?global=1
    """
    import json
    from wyniki.db_models import Player, GlobalPlayer, Tournament, MatchHistory
    from wyniki.database import get_full_bracket
    from sqlalchemy import or_

    is_global = request.args.get('global', '0') == '1'

    if is_global:
        gp = db.session.get(GlobalPlayer, player_id)
        if not gp:
            return jsonify({'error': 'Player not found'}), 404
        full_name = gp.full_name
        last_name = (gp.last_name or '').strip()
        first_name_val = gp.first_name or ''
        gender_val = gp.gender or ''
        category_val = gp.category or ''
        country_val = (gp.country or '').upper()
        photo_url = gp.photo_url or ''
        birth_date = gp.birth_date or ''
        age_val = gp.age
        siblings = Player.query.filter_by(global_player_id=gp.id).all()
        if not siblings and last_name:
            siblings = Player.query.filter_by(last_name=last_name, first_name=gp.first_name).all()
    else:
        player = db.session.get(Player, player_id)
        if not player:
            return jsonify({'error': 'Player not found'}), 404
        full_name = player.full_name
        last_name = (player.last_name or '').strip()
        first_name_val = player.first_name or ''
        gender_val = player.gender or ''
        category_val = player.category or ''
        country_val = (player.country or '').upper()
        photo_url = ''
        birth_date = ''
        age_val = None

        # If player has global_player_id, use it for cross-tournament lookup
        if player.global_player_id:
            gp = db.session.get(GlobalPlayer, player.global_player_id)
            if gp:
                photo_url = gp.photo_url or ''
                birth_date = gp.birth_date or ''
                age_val = gp.age
            siblings = Player.query.filter_by(global_player_id=player.global_player_id).all()
        elif last_name:
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
        tourn = db.session.get(Tournament, tid)
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

            raw_sets = parse_sets_history(m)
            # Flip scores when profile player is player_b
            if not is_player_a:
                raw_sets = [{'g1': s['g2'], 'g2': s['g1'], 'tb': s.get('tb'), 'stb': s.get('stb', False)} for s in raw_sets]

            matches_detail.append({
                'opponent': opponent,
                'score': raw_sets,
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
            'id': player_id,
            'first_name': first_name_val,
            'last_name': last_name,
            'full_name': full_name,
            'gender': gender_val,
            'category': category_val,
            'country': country_val,
            'photo_url': photo_url,
            'birth_date': birth_date,
            'age': age_val,
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
