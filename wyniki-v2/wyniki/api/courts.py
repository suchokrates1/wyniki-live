"""Courts API endpoints."""
from flask import Blueprint, jsonify

from ..services.court_manager import serialize_public_snapshot
from ..services.history_manager import get_history
from ..db_models import MatchStatistics
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
    """Get match history."""
    try:
        history_data = get_history()
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
        return jsonify(stats.to_dict())
    except Exception as e:
        logger.error(f"Failed to get match stats: {e}")
        return jsonify({"error": str(e)}), 500

