"""Admin API endpoints."""
from flask import Blueprint, jsonify, request

from ..services.court_manager import refresh_courts_from_db, available_courts
from ..config import logger

blueprint = Blueprint('admin', __name__, url_prefix='/admin')


@blueprint.route('/api/courts', methods=['GET'])
def get_courts():
    """Get all courts."""
    try:
        from .. import database
        
        courts_data = database.fetch_courts()
        return jsonify(courts_data)
    except Exception as e:
        logger.error(f"Failed to get courts: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts', methods=['POST'])
def add_court():
    """Add a new court."""
    try:
        from ..services import court_manager
        from .. import database
        
        data = request.get_json() or {}
        kort_id = data.get("kort_id")
        pin = data.get("pin")
        
        if not kort_id:
            return jsonify({"error": "kort_id required"}), 400
        
        court_manager.ensure_court_state(kort_id)
        
        # Save to database
        database.upsert_court(kort_id, pin)
        
        logger.info(f"Court added: kort={kort_id}, pin={'set' if pin else 'none'}")
        return jsonify({"status": "ok", "kort_id": kort_id}), 201
    except Exception as e:
        logger.error(f"Failed to add court: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts/<kort_id>/pin', methods=['PUT'])
def update_court_pin(kort_id):
    """Update PIN for a court."""
    try:
        from .. import database
        
        data = request.get_json() or {}
        pin = data.get("pin")
        
        # Validate PIN format (4 digits or null)
        if pin and (len(pin) != 4 or not pin.isdigit()):
            return jsonify({"error": "PIN must be 4 digits"}), 400
        
        database.upsert_court(kort_id, pin)
        
        logger.info(f"Court PIN updated: kort={kort_id}")
        return jsonify({"status": "ok", "kort_id": kort_id})
    except Exception as e:
        logger.error(f"Failed to update court PIN: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/history/latest', methods=['DELETE'])
def delete_latest_history():
    """Delete the latest history entry."""
    try:
        from ..services import history_manager
        
        deleted = history_manager.delete_latest_history()
        
        if deleted:
            logger.info(f"History entry deleted: {deleted}")
            return jsonify({"status": "ok", "deleted": deleted})
        else:
            return jsonify({"status": "ok", "message": "No history to delete"})
    except Exception as e:
        logger.error(f"Failed to delete history: {e}")
        return jsonify({"error": str(e)}), 500


