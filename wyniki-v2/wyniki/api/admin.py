"""Admin API endpoints."""
from flask import Blueprint, jsonify, request

from ..services.court_manager import refresh_courts_from_db, available_courts
from ..config import logger

blueprint = Blueprint('admin', __name__, url_prefix='/admin')


@blueprint.route('/api/courts', methods=['GET'])
def get_courts():
    """Get all courts."""
    try:
        from ..services import court_manager
        
        courts_data = []
        for kort_id, overlay_id in court_manager.available_courts():
            state = court_manager.COURTS.get(kort_id, {})
            courts_data.append({
                "kort_id": kort_id,
                "overlay_id": overlay_id,
                "active": state.get("active", False)
            })
        return jsonify(courts_data)
    except Exception as e:
        logger.error(f"Failed to get courts: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts/<kort_id>', methods=['PUT'])
def update_court_overlay(kort_id):
    """Update overlay ID for a court."""
    try:
        from ..services import court_manager
        from .. import database
        
        data = request.get_json() or {}
        overlay_id = data.get("overlay_id")
        
        with court_manager.STATE_LOCK:
            if overlay_id:
                court_manager.COURTS_OVERLAY_MAP[kort_id] = overlay_id
            else:
                court_manager.COURTS_OVERLAY_MAP.pop(kort_id, None)
        
        # Save to database
        database.upsert_court(kort_id, overlay_id)
        
        logger.info(f"Court overlay updated: kort={kort_id}, overlay={overlay_id}")
        return jsonify({"status": "ok", "kort_id": kort_id, "overlay_id": overlay_id})
    except Exception as e:
        logger.error(f"Failed to update court overlay: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts', methods=['POST'])
def add_court():
    """Add a new court."""
    try:
        from ..services import court_manager
        from .. import database
        
        data = request.get_json() or {}
        kort_id = data.get("kort_id")
        overlay_id = data.get("overlay_id")
        
        if not kort_id:
            return jsonify({"error": "kort_id required"}), 400
        
        court_manager.ensure_court_state(kort_id)
        
        if overlay_id:
            with court_manager.STATE_LOCK:
                court_manager.COURTS_OVERLAY_MAP[kort_id] = overlay_id
        
        # Save to database
        database.upsert_court(kort_id, overlay_id)
        
        logger.info(f"Court added: kort={kort_id}, overlay={overlay_id}")
        return jsonify({"status": "ok", "kort_id": kort_id}), 201
    except Exception as e:
        logger.error(f"Failed to add court: {e}")
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


