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
from ..config import loggerger

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
        courts = available_courts()
        return jsonify([{"kort_id": k, "overlay_id": o} for k, o in courts])
    except Exception as e:
        logger.error(f"Failed to get courts: {e}")
        return jsonify({"error": str(e)}), 500

