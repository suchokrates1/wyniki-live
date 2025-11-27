"""Courts API endpoints."""
from flask import Blueprint, jsonify

from ..services.court_manager import serialize_public_snapshot
from ..services.history_manager import get_history
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

