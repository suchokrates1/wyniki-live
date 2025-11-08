"""Courts API endpoints."""
from flask import Blueprint, jsonify

from wyniki_v2.config import logger

blueprint = Blueprint('courts', __name__, url_prefix='/api')


@blueprint.route('/snapshot')
def snapshot():
    """Get current state of all courts."""
    # TODO: Implement with real state management
    return jsonify({
        "1": {
            "A": {"full_name": "Test Player A", "points": "0", "current_games": 0, "set1": 0},
            "B": {"full_name": "Test Player B", "points": "0", "current_games": 0, "set1": 0},
            "match_status": {"active": False},
            "match_time": {"running": False, "seconds": 0}
        }
    })


@blueprint.route('/history')
def history():
    """Get match history."""
    return jsonify([])
