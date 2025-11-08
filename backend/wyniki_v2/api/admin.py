"""Admin API endpoints."""
from flask import Blueprint, jsonify, request

from ..services.court_manager import refresh_courts_from_db, available_courts
from ..services.throttle_manager import (
    get_uno_config, 
    update_uno_config,
    get_uno_usage_summary,
    is_uno_requests_enabled,
    set_uno_requests_enabled,
)
from ..services.uno_queue import get_all_queue_status, clear_queue
from ..config import logger

blueprint = Blueprint('admin', __name__, url_prefix='/admin')


@blueprint.route('/api/uno/config', methods=['GET'])
def get_uno_config_route():
    """Get UNO throttling configuration."""
    try:
        config = get_uno_config()
        return jsonify(config)
    except Exception as e:
        logger.error(f"Failed to get UNO config: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/uno/config', methods=['POST'])
def update_uno_config_route():
    """Update UNO throttling configuration."""
    try:
        data = request.get_json() or {}
        config = update_uno_config(
            limit=data.get('limit'),
            threshold=data.get('threshold'),
            slowdown_factor=data.get('slowdown_factor'),
            slowdown_sleep=data.get('slowdown_sleep'),
        )
        return jsonify(config)
    except Exception as e:
        logger.error(f"Failed to update UNO config: {e}")
        return jsonify({"error": str(e)}), 400


@blueprint.route('/api/uno/status', methods=['GET'])
def get_uno_status():
    """Get UNO request status for all courts."""
    try:
        summary = get_uno_usage_summary()
        enabled = is_uno_requests_enabled()
        return jsonify({
            "enabled": enabled,
            "courts": summary,
        })
    except Exception as e:
        logger.error(f"Failed to get UNO status: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/uno/toggle', methods=['POST'])
def toggle_uno_requests():
    """Enable/disable UNO requests."""
    try:
        data = request.get_json() or {}
        enabled = data.get('enabled', False)
        reason = data.get('reason', 'manual toggle')
        set_uno_requests_enabled(enabled, reason)
        return jsonify({"enabled": enabled, "reason": reason})
    except Exception as e:
        logger.error(f"Failed to toggle UNO requests: {e}")
        return jsonify({"error": str(e)}), 400


@blueprint.route('/api/uno/queue', methods=['GET'])
def get_queue_status_route():
    """Get command queue status."""
    try:
        status = get_all_queue_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Failed to get queue status: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/uno/queue/<kort_id>', methods=['DELETE'])
def clear_queue_route(kort_id):
    """Clear command queue for court."""
    try:
        count = clear_queue(kort_id)
        return jsonify({"cleared": count, "kort_id": kort_id})
    except Exception as e:
        logger.error(f"Failed to clear queue: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts', methods=['GET'])
def get_courts():
    """Get all courts."""
    try:
        from ..services import court_manager
        
        courts_data = []
        for kort_id in court_manager.available_courts():
            state = court_manager.COURTS.get(kort_id, {})
            overlay_id = court_manager.COURTS_OVERLAY_MAP.get(kort_id)
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


