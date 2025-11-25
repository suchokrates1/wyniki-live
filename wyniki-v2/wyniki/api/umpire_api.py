"""API endpoints for receiving data from Umpire mobile app."""
from flask import Blueprint, jsonify, request
from datetime import datetime
import json

from ..db_models import db, Player, Match, MatchStatistics, Tournament, Court
from ..services.court_manager import ensure_court_state, STATE_LOCK
from ..services.event_broker import emit_score_update
from ..config import logger

blueprint = Blueprint('umpire_api', __name__, url_prefix='/api')


@blueprint.route('/courts', methods=['GET'])
def get_courts():
    """Get list of available courts for app."""
    from ..services.court_manager import available_courts
    
    try:
        courts_list = available_courts()
        
        # Format for mobile app
        courts_data = []
        for kort_id, overlay_id in courts_list:
            courts_data.append({
                "id": kort_id,
                "name": f"Kort {kort_id}",
                "status": "available",  # TODO: Check if court is occupied
                "overlay_id": overlay_id
            })
        
        return jsonify({
            "courts": courts_data,
            "count": len(courts_data)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting courts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@blueprint.route('/players', methods=['GET'])
def get_players():
    """Get list of available players for app."""
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
            players_data.append({
                "id": str(player.id),
                "surname": player.name,
                "full_name": player.name,
                "country_code": player.country,
                "flag_url": None
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
        pin = data.get('pin', '')
        
        # TODO: Implement proper PIN verification from database
        # For now, accept any 4-digit PIN
        if len(pin) == 4 and pin.isdigit():
            return jsonify({
                "authorized": True,
                "court_id": kort_id,
                "message": "Access granted"
            }), 200
        else:
            return jsonify({
                "authorized": False,
                "error": "Invalid PIN"
            }), 401
            
    except Exception as e:
        logger.error(f"Error authorizing court: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


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
            with STATE_LOCK:
                court_state["match_status"]["active"] = False
                court_state["match_status"]["last_completed"] = datetime.utcnow().isoformat()
            
            emit_score_update(kort_id, court_state)
        
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


@blueprint.route('/match-events', methods=['POST'])
def log_match_event():
    """Log match event (point, game, set, etc.)."""
    try:
        data = request.get_json()
        
        # Log event for analytics
        logger.info(f"Match event: {data.get('event_type')} on court {data.get('court_id')}")
        
        # TODO: Store events in database for detailed analysis
        
        return jsonify({
            "message": "Event logged successfully",
            "event_id": f"evt_{datetime.utcnow().timestamp()}"
        }), 200
        
    except Exception as e:
        logger.error(f"Error logging event: {e}", exc_info=True)
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
