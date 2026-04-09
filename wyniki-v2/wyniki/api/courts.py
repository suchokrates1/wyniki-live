"""Courts API endpoints."""
from flask import Blueprint, jsonify

from ..services.court_manager import serialize_public_snapshot
from ..services.history_manager import get_history
from ..db_models import Match, MatchStatistics, Player
from ..config import logger

blueprint = Blueprint('courts', __name__, url_prefix='/api')


@blueprint.route('/snapshot')
def snapshot():
    """Get current state of all courts."""
    try:
        courts_data = serialize_public_snapshot()
        return jsonify({"courts": courts_data})
    except Exception as e:
        logger.error(f"Failed to get snapshot: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/history')
def history():
    """Get match history for the active tournament."""
    try:
        from ..database import get_active_tournament_id, fetch_match_history
        from ..config import settings
        tid = get_active_tournament_id()
        # Serve from DB filtered by tournament
        history_data = fetch_match_history(limit=settings.match_history_size, tournament_id=tid)
        return jsonify(history_data)
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/match-stats/<int:match_id>')
def match_stats(match_id: int):
    """Get match statistics for Details button in history."""
    try:
        stats = MatchStatistics.query.filter_by(match_id=match_id).first()
        if not stats:
            return jsonify({"error": "Statistics not found"}), 404
        data = stats.to_dict()
        # Enrich with match timestamps
        match_record = Match.query.get(match_id)
        if match_record:
            data["started_at"] = match_record.created_at
            data["ended_at"] = match_record.updated_at
        # Resolve winner surname to full name via Player DB
        if data.get("winner"):
            winner_name = data["winner"].strip()
            player = Player.query.filter_by(last_name=winner_name).first()
            if player:
                data["winner"] = player.full_name
        return jsonify(data)
    except Exception as e:
        logger.error(f"Failed to get match stats: {e}")
        return jsonify({"error": str(e)}), 500

