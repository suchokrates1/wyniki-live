"""API endpoints for receiving data from Umpire mobile app."""
from flask import Blueprint, jsonify, request
from datetime import datetime
import json

from ..db_models import db, Player, Match, MatchStatistics, Tournament, Court
from ..services.court_manager import ensure_court_state, normalize_kort_id, STATE_LOCK, _empty_player_state
from ..services.event_broker import emit_score_update
from ..services.history_manager import add_match_to_history
from ..config import logger

blueprint = Blueprint('umpire_api', __name__, url_prefix='/api')


@blueprint.route('/courts', methods=['GET'])
def get_courts():
    """Get list of available courts for app."""
    from ..services.court_manager import available_courts, get_court_state
    
    try:
        courts_list = available_courts()
        
        # Format for mobile app
        courts_data = []
        for kort_id in courts_list:
            # Check if court has an active match
            state = get_court_state(kort_id)
            is_active = False
            if state:
                match_status = state.get("match_status", {})
                is_active = match_status.get("active", False)
            
            courts_data.append({
                "kort_id": kort_id,
                "name": None,
                "status": "occupied" if is_active else "available",
                "is_available": not is_active
            })
        
        return jsonify({
            "courts": courts_data,
            "count": len(courts_data),
            "total_count": len(courts_data)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting courts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/players', methods=['GET', 'POST', 'OPTIONS'])
def get_players():
    """Get list of available players for app, or add a new player (POST)."""
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response, 204
    
    # POST - add new player (requires court PIN)
    if request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({"ok": False, "error": "invalid-payload"}), 400
            
            # Verify court PIN for authorization
            kort_id = data.get("kort_id")
            provided_pin = str(data.get("pin", "")).strip()
            
            if not kort_id or not provided_pin:
                return jsonify({"ok": False, "error": "kort_id and pin required"}), 400
            
            # Check court and PIN
            court = Court.query.get(kort_id)
            if not court:
                return jsonify({"ok": False, "error": "court-not-found"}), 404
            
            if court.pin and provided_pin != court.pin:
                return jsonify({"ok": False, "error": "invalid-pin", "authorized": False}), 403
            
            # Get player data
            surname = data.get("surname", "").strip() or data.get("name", "").strip()
            first_name = data.get("first_name", "").strip()
            last_name = data.get("last_name", "").strip()
            
            # If first/last not provided but surname is, split it
            if not first_name and not last_name and surname:
                parts = surname.rsplit(' ', 1)
                if len(parts) == 2:
                    first_name, last_name = parts[0], parts[1]
                else:
                    first_name, last_name = '', surname
            
            if not last_name and not surname:
                return jsonify({"ok": False, "error": "last_name or surname required"}), 400
            
            full_name = f"{first_name} {last_name}".strip() if first_name else last_name
            
            country_code = data.get("country_code", "").strip() or None
            category = data.get("category", "").strip() or None
            
            # Get active tournament
            tournament = Tournament.query.filter_by(active=1).first()
            if not tournament:
                return jsonify({"ok": False, "error": "no active tournament"}), 400
            
            # Create player
            player = Player(
                tournament_id=tournament.id,
                name=full_name,
                first_name=first_name,
                last_name=last_name,
                country=country_code,
                category=category
            )
            db.session.add(player)
            db.session.commit()
            
            logger.info(f"Player created: {player.id} - {full_name}")
            
            return jsonify({
                "ok": True,
                "player": {
                    "id": str(player.id),
                    "first_name": player.first_name or '',
                    "last_name": player.last_name or '',
                    "surname": player.last_name or player.name,
                    "full_name": player.full_name,
                    "name": player.full_name,
                    "country_code": player.country,
                    "category": player.category,
                    "flag_url": f"https://flagcdn.com/w80/{player.country.lower()}.png" if player.country else None
                }
            }), 201
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error creating player: {e}", exc_info=True)
            return jsonify({"ok": False, "error": str(e)}), 500
    
    # GET - list players
    try:
        # Get active tournament
        tournament = Tournament.query.filter_by(active=1).first()
        
        if not tournament:
            return jsonify({
                "players": [],
                "count": 0,
                "message": "No active tournament"
            }), 200
        
        players = Player.query.filter_by(tournament_id=tournament.id).order_by(Player.name).all()
        
        players_data = []
        for player in players:
            fn = player.first_name or ''
            ln = player.last_name or ''
            full = player.full_name
            players_data.append({
                "id": str(player.id),
                "first_name": fn,
                "last_name": ln,
                "surname": ln or player.name,
                "full_name": full,
                "name": full,
                "country_code": player.country,
                "flag_url": f"https://flagcdn.com/w80/{player.country.lower()}.png" if player.country else None
            })
        
        return jsonify({
            "players": players_data,
            "count": len(players_data)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting players: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/courts/<kort_id>/authorize', methods=['POST'])
def authorize_court(kort_id: str):
    """Verify PIN for court access."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "ok": False,
                "authorized": False,
                "error": "invalid-payload"
            }), 400
        
        provided_pin = str(data.get('pin', '')).strip()
        
        if not provided_pin:
            return jsonify({
                "ok": False,
                "authorized": False,
                "error": "pin-required"
            }), 400
        
        # Get court from database
        court = Court.query.get(kort_id)
        
        if not court:
            logger.warning(f"Court not found: {kort_id}")
            return jsonify({
                "ok": False,
                "authorized": False,
                "error": "court-not-found"
            }), 404
        
        # Verify PIN
        correct_pin = court.pin or "0000"
        authorized = provided_pin == correct_pin
        
        logger.info(f"PIN check for kort {kort_id}: authorized={authorized}")
        
        if authorized:
            return jsonify({
                "ok": True,
                "authorized": True,
                "court_id": kort_id,
                "message": "Access granted"
            }), 200
        else:
            return jsonify({
                "ok": False,
                "authorized": False,
                "error": "invalid-pin"
            }), 403
            
    except Exception as e:
        logger.error(f"Error authorizing court: {e}", exc_info=True)
        return jsonify({
            "ok": False,
            "authorized": False,
            "error": "internal-error"
        }), 500


@blueprint.route('/matches', methods=['POST'])
def create_match():
    """Create new match on server."""
    try:
        data = request.get_json()
        score = data.get("score", {})
        kort_id = data.get("court_id")
        
        # Ensure court exists
        if kort_id:
            ensure_court_state(kort_id)
        
        # Create match
        match = Match(
            court_id=kort_id,
            player1_name=data.get("player1_name"),
            player2_name=data.get("player2_name"),
            status=data.get("status", "in_progress"),
            player1_sets=score.get("player1_sets", 0),
            player2_sets=score.get("player2_sets", 0),
            player1_games=score.get("player1_games", 0),
            player2_games=score.get("player2_games", 0),
            player1_points=score.get("player1_points", 0),
            player2_points=score.get("player2_points", 0),
            sets_history=json.dumps(score.get("sets_history", []))
        )
        
        db.session.add(match)
        db.session.commit()
        
        # Initialize court state with match data
        if kort_id:
            court_state = ensure_court_state(kort_id)
            with STATE_LOCK:
                court_state["A"]["surname"] = match.player1_name
                court_state["B"]["surname"] = match.player2_name
                court_state["match_status"]["active"] = True
                court_state["updated"] = datetime.utcnow().isoformat()
            
            emit_score_update(kort_id, court_state)
        
        logger.info(f"Match created: {match.id} on court {kort_id}")
        
        return jsonify(match.to_dict()), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating match: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/matches/<int:match_id>', methods=['GET'])
def get_match(match_id: int):
    """Get match details."""
    try:
        match = Match.query.get(match_id)
        
        if not match:
            return jsonify({"error": "Match not found"}), 404
        
        return jsonify(match.to_dict()), 200
        
    except Exception as e:
        logger.error(f"Error getting match: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/matches/<int:match_id>', methods=['PUT'])
def update_match(match_id: int):
    """Update match score and state."""
    try:
        data = request.get_json()
        
        match = Match.query.get(match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        
        # Update match data
        score = data.get("score", {})
        match.player1_sets = score.get("player1_sets", 0)
        match.player2_sets = score.get("player2_sets", 0)
        match.player1_games = score.get("player1_games", 0)
        match.player2_games = score.get("player2_games", 0)
        match.player1_points = score.get("player1_points", 0)
        match.player2_points = score.get("player2_points", 0)
        match.sets_history = json.dumps(score.get("sets_history", []))
        match.status = data.get("status", "in_progress")
        match.updated_at = datetime.utcnow().isoformat()
        
        db.session.commit()
        
        # Update court state for live display
        kort_id = match.court_id
        if kort_id:
            court_state = ensure_court_state(kort_id)
            with STATE_LOCK:
                # Update player names
                court_state["A"]["surname"] = match.player1_name
                court_state["B"]["surname"] = match.player2_name
                
                # Update current scores
                court_state["A"]["current_games"] = match.player1_games
                court_state["B"]["current_games"] = match.player2_games
                
                court_state["A"]["points"] = str(match.player1_points)
                court_state["B"]["points"] = str(match.player2_points)
                
                court_state["match_status"]["active"] = (match.status == "in_progress")
                
                # Handle sets history
                sets_history = json.loads(match.sets_history) if match.sets_history else []
                for idx, set_score in enumerate(sets_history):
                    set_num = idx + 1
                    if set_num == 1:
                        court_state["A"]["set1"] = set_score.get("player1_games", 0)
                        court_state["B"]["set1"] = set_score.get("player2_games", 0)
                    elif set_num == 2:
                        court_state["A"]["set2"] = set_score.get("player1_games", 0)
                        court_state["B"]["set2"] = set_score.get("player2_games", 0)
                    elif set_num == 3:
                        court_state["A"]["set3"] = set_score.get("player1_games", 0)
                        court_state["B"]["set3"] = set_score.get("player2_games", 0)
                
                court_state["current_set"] = len(sets_history) + 1
                court_state["updated"] = datetime.utcnow().isoformat()
            
            # Emit SSE update
            emit_score_update(kort_id, court_state)
            
            logger.info(f"Match {match_id} updated on court {kort_id}")
        
        return jsonify(match.to_dict()), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating match: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/matches/<int:match_id>/finish', methods=['POST'])
def finish_match(match_id: int):
    """Mark match as finished."""
    try:
        match = Match.query.get(match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        
        match.status = "finished"
        match.updated_at = datetime.utcnow().isoformat()
        db.session.commit()
        
        # Update court state
        kort_id = match.court_id
        if kort_id:
            court_state = ensure_court_state(kort_id)

            # Ensure set scores are correct from Match DB record (belt-and-suspenders)
            sets_history = json.loads(match.sets_history) if match.sets_history else []
            with STATE_LOCK:
                court_state["match_status"]["active"] = False
                court_state["match_status"]["last_completed"] = datetime.utcnow().isoformat()
                
                # Overwrite set scores from authoritative sets_history
                if sets_history:
                    for idx, set_score in enumerate(sets_history):
                        set_num = idx + 1
                        court_state["A"][f"set{set_num}"] = set_score.get("player1_games", 0)
                        court_state["B"][f"set{set_num}"] = set_score.get("player2_games", 0)
                    court_state["current_set"] = len(sets_history)
                    # Clear phantom set data beyond actual sets played
                    for i in range(len(sets_history) + 1, 4):
                        court_state["A"][f"set{i}"] = 0
                        court_state["B"][f"set{i}"] = 0
                
                # Store match_id for history linkage
                court_state["history_meta"] = court_state.get("history_meta", {})
                court_state["history_meta"]["match_id"] = match_id
                court_state["history_meta"]["stats_mode"] = court_state.get("stats_mode")

                # Auto-detect category from player DB records
                # If both players share the same category, include it
                try:
                    active_tournament = Tournament.query.filter_by(active=1).first()
                    if active_tournament:
                        p1 = Player.query.filter_by(
                            tournament_id=active_tournament.id,
                            name=match.player1_name
                        ).first()
                        p2 = Player.query.filter_by(
                            tournament_id=active_tournament.id,
                            name=match.player2_name
                        ).first()
                        if p1 and p2 and p1.category and p2.category:
                            if p1.category == p2.category:
                                court_state["history_meta"]["category"] = p1.category
                except Exception as e:
                    logger.warning(f"Could not detect category: {e}")

                # Store match duration from Match record
                if match.statistics:
                    duration_ms = match.statistics.match_duration_ms or 0
                    court_state["match_time"] = court_state.get("match_time", {})
                    if duration_ms > 0:
                        court_state["match_time"]["seconds"] = duration_ms // 1000
            
            # Add match to history for frontend display
            add_match_to_history(kort_id, court_state)
            
            emit_score_update(kort_id, court_state)
            
            # Clear court state for next match (keep structure, reset data)
            with STATE_LOCK:
                court_state["A"] = _empty_player_state()
                court_state["B"] = _empty_player_state()
                court_state["current_set"] = 1
                court_state["serve"] = None
                court_state["tie"] = {"A": 0, "B": 0, "visible": None, "locked": False}
                court_state["stats"] = {}
                court_state["stats_mode"] = None
                court_state["history_meta"] = {}
            
            # Emit cleared state after a short delay so frontend sees final score first
            import threading
            def emit_cleared():
                emit_score_update(kort_id, court_state)
            threading.Timer(5.0, emit_cleared).start()
        
        logger.info(f"Match {match_id} finished on court {kort_id}")
        
        return jsonify(match.to_dict()), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error finishing match: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/match-statistics', methods=['POST'])
def receive_statistics():
    """Receive match statistics from app."""
    try:
        data = request.get_json()
        
        match_id = data.get("match_id")
        if not match_id:
            return jsonify({"error": "match_id required"}), 400
        
        # Check if match exists
        match = Match.query.get(match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        
        # Get or create statistics
        stats = MatchStatistics.query.filter_by(match_id=match_id).first()
        if not stats:
            stats = MatchStatistics(match_id=match_id)
            db.session.add(stats)
        
        # Update player 1 stats
        p1_stats = data.get("player1_stats", {})
        stats.player1_aces = p1_stats.get("aces", 0)
        stats.player1_double_faults = p1_stats.get("double_faults", 0)
        stats.player1_winners = p1_stats.get("winners", 0)
        stats.player1_forced_errors = p1_stats.get("forced_errors", 0)
        stats.player1_unforced_errors = p1_stats.get("unforced_errors", 0)
        stats.player1_first_serves = p1_stats.get("first_serves", 0)
        stats.player1_first_serves_in = p1_stats.get("first_serves_in", 0)
        stats.player1_first_serve_percentage = p1_stats.get("first_serve_percentage", 0.0)
        
        # Update player 2 stats
        p2_stats = data.get("player2_stats", {})
        stats.player2_aces = p2_stats.get("aces", 0)
        stats.player2_double_faults = p2_stats.get("double_faults", 0)
        stats.player2_winners = p2_stats.get("winners", 0)
        stats.player2_forced_errors = p2_stats.get("forced_errors", 0)
        stats.player2_unforced_errors = p2_stats.get("unforced_errors", 0)
        stats.player2_first_serves = p2_stats.get("first_serves", 0)
        stats.player2_first_serves_in = p2_stats.get("first_serves_in", 0)
        stats.player2_first_serve_percentage = p2_stats.get("first_serve_percentage", 0.0)
        
        # Update match info
        stats.match_duration_ms = data.get("match_duration_ms", 0)
        stats.winner = data.get("winner")
        stats.stats_mode = data.get("stats_mode")
        stats.received_at = datetime.utcnow().isoformat()
        
        db.session.commit()
        
        logger.info(f"Statistics saved for match {match_id}")
        logger.info(f"Player 1 stats: Aces={stats.player1_aces}, DF={stats.player1_double_faults}")
        logger.info(f"Player 2 stats: Aces={stats.player2_aces}, DF={stats.player2_double_faults}")
        
        return jsonify({"message": "Statistics received successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error receiving statistics: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


def _raw_points_to_tennis(raw_a: int, raw_b: int) -> tuple[str, str]:
    """Convert raw point integers to tennis display values.

    Normal game: 0→"0", 1→"15", 2→"30", 3→"40", deuce/advantage logic.
    """
    DISPLAY = ["0", "15", "30", "40"]
    if raw_a <= 3 and raw_b <= 3 and not (raw_a == 3 and raw_b == 3):
        return DISPLAY[raw_a], DISPLAY[raw_b]
    # Deuce territory (both >= 3)
    if raw_a == raw_b:
        return "40", "40"
    if raw_a > raw_b:
        return "ADV", "40"
    return "40", "ADV"


@blueprint.route('/match-events', methods=['POST'])
def log_match_event():
    """Process match event and push real-time score update via SSE."""
    try:
        data = request.get_json()
        event_type = data.get('event_type', '')
        kort_id = normalize_kort_id(data.get('court_id'))

        logger.info(f"Match event: {event_type} on court {kort_id}")

        if not kort_id:
            return jsonify({"success": True, "message": "No court_id, event logged only"}), 200

        score = data.get('score', {})
        player1 = data.get('player1', {})
        player2 = data.get('player2', {})

        raw_pts_a = int(score.get('player1_points', 0))
        raw_pts_b = int(score.get('player2_points', 0))
        is_tiebreak = bool(score.get('is_tiebreak', False))
        is_super_tiebreak = bool(score.get('is_super_tiebreak', False))

        court_state = ensure_court_state(kort_id)
        with STATE_LOCK:
            # --- Serve ---
            if player1.get('is_serving'):
                court_state["serve"] = "A"
            elif player2.get('is_serving'):
                court_state["serve"] = "B"

            # --- Player names (keep up-to-date) ---
            if player1.get('name'):
                court_state["A"]["surname"] = player1["name"]
                if not court_state["A"].get("full_name"):
                    court_state["A"]["full_name"] = player1["name"]
            if player2.get('name'):
                court_state["B"]["surname"] = player2["name"]
                if not court_state["B"].get("full_name"):
                    court_state["B"]["full_name"] = player2["name"]

            # --- Flags (Android sends 'flag' as ISO country code) ---
            if player1.get('flag'):
                court_state["A"]["flag_code"] = player1["flag"]
                court_state["A"]["flag_url"] = f"https://flagcdn.com/w80/{player1['flag'].lower()}.png"
            if player2.get('flag'):
                court_state["B"]["flag_code"] = player2["flag"]
                court_state["B"]["flag_url"] = f"https://flagcdn.com/w80/{player2['flag'].lower()}.png"

            # --- Points ---
            if is_tiebreak or is_super_tiebreak:
                # Tiebreak: raw integers displayed as-is
                court_state["A"]["points"] = "0"
                court_state["B"]["points"] = "0"
                court_state["tie"]["A"] = raw_pts_a
                court_state["tie"]["B"] = raw_pts_b
                court_state["tie"]["visible"] = True
            else:
                # Normal game: convert raw → tennis display
                disp_a, disp_b = _raw_points_to_tennis(raw_pts_a, raw_pts_b)
                court_state["A"]["points"] = disp_a
                court_state["B"]["points"] = disp_b
                court_state["tie"]["A"] = 0
                court_state["tie"]["B"] = 0
                court_state["tie"]["visible"] = None

            # --- Games ---
            games_a = int(score.get('player1_games', 0))
            games_b = int(score.get('player2_games', 0))
            court_state["A"]["current_games"] = games_a
            court_state["B"]["current_games"] = games_b

            # --- Sets ---
            sets_a = int(score.get('player1_sets', 0))
            sets_b = int(score.get('player2_sets', 0))
            current_set = sets_a + sets_b + 1
            court_state["current_set"] = current_set

            # --- Sets history (from Android >= vC4) ---
            # Populate completed set scores from sets_history if available
            sets_history = score.get('sets_history', [])
            if sets_history:
                for sh in sets_history:
                    sn = int(sh.get('set_number', 0))
                    if 1 <= sn <= 3:
                        court_state["A"][f"set{sn}"] = int(sh.get('player1_games', 0))
                        court_state["B"][f"set{sn}"] = int(sh.get('player2_games', 0))

            # Write current games to set{N} for the active set
            # Only write if this set is not already finalized in sets_history
            completed_set_nums = {int(sh.get('set_number', 0)) for sh in sets_history} if sets_history else set()
            if current_set not in completed_set_nums:
                court_state["A"][f"set{current_set}"] = games_a
                court_state["B"][f"set{current_set}"] = games_b

            # Store stats_mode for later use
            stats_mode = score.get('stats_mode')
            if stats_mode:
                court_state["stats_mode"] = stats_mode

            # --- Match status ---
            match_finished = bool(score.get('match_finished', False))
            court_state["match_status"]["active"] = not match_finished
            if match_finished:
                court_state["match_status"]["last_completed"] = datetime.utcnow().isoformat()

            # --- Live stats (for overlay) ---
            live_stats = data.get('stats')
            if live_stats:
                court_state["stats"] = {
                    "player_a": {
                        "aces": live_stats.get("player1_aces", 0),
                        "double_faults": live_stats.get("player1_double_faults", 0),
                        "winners": live_stats.get("player1_winners", 0),
                        "forced_errors": live_stats.get("player1_forced_errors"),
                        "unforced_errors": live_stats.get("player1_unforced_errors", 0),
                        "first_serves_in": live_stats.get("player1_first_serves_in"),
                        "first_serves_total": live_stats.get("player1_first_serves_total"),
                        "first_serve_pct": live_stats.get("player1_first_serve_pct", 0),
                        "second_serves_in": live_stats.get("player1_second_serves_in"),
                        "second_serves_total": live_stats.get("player1_second_serves_total"),
                        "second_serve_pct": live_stats.get("player1_second_serve_pct"),
                    },
                    "player_b": {
                        "aces": live_stats.get("player2_aces", 0),
                        "double_faults": live_stats.get("player2_double_faults", 0),
                        "winners": live_stats.get("player2_winners", 0),
                        "forced_errors": live_stats.get("player2_forced_errors"),
                        "unforced_errors": live_stats.get("player2_unforced_errors", 0),
                        "first_serves_in": live_stats.get("player2_first_serves_in"),
                        "first_serves_total": live_stats.get("player2_first_serves_total"),
                        "first_serve_pct": live_stats.get("player2_first_serve_pct", 0),
                        "second_serves_in": live_stats.get("player2_second_serves_in"),
                        "second_serves_total": live_stats.get("player2_second_serves_total"),
                        "second_serve_pct": live_stats.get("player2_second_serve_pct"),
                    },
                }

            court_state["updated"] = datetime.utcnow().isoformat()

        # Emit SSE update to all listeners
        emit_score_update(kort_id, court_state)

        return jsonify({
            "success": True,
            "message": "Event processed",
            "event_id": f"evt_{datetime.utcnow().timestamp()}"
        }), 200

    except Exception as e:
        logger.error(f"Error processing match event: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/players', methods=['POST'])
def add_player():
    """Add new player from app."""
    try:
        data = request.get_json()
        
        surname = data.get("surname", "").strip()
        if not surname:
            return jsonify({"error": "surname is required"}), 400
        
        # Get active tournament
        tournament = Tournament.query.filter_by(active=1).first()
        if not tournament:
            return jsonify({"error": "No active tournament"}), 400
        
        # Check if player exists
        existing = Player.query.filter_by(
            tournament_id=tournament.id,
            name=surname
        ).first()
        
        if existing:
            return jsonify({
                "id": str(existing.id),
                "surname": existing.name,
                "full_name": existing.name,
                "country_code": existing.country,
                "flag_url": None
            }), 200
        
        # Create new player
        player = Player(
            tournament_id=tournament.id,
            name=surname,
            country=data.get("country_code"),
            category=data.get("category")
        )
        
        db.session.add(player)
        db.session.commit()
        
        logger.info(f"New player added: {surname} (ID: {player.id})")
        
        return jsonify({
            "id": str(player.id),
            "surname": player.name,
            "full_name": player.name,
            "country_code": player.country,
            "flag_url": None
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding player: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
