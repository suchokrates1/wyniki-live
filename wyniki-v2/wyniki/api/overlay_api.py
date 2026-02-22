"""Overlay settings API endpoints."""
from flask import Blueprint, jsonify, request

from ..services.overlay_settings import get_overlay_settings, update_overlay_settings
from ..config import logger

blueprint = Blueprint('overlay_api', __name__, url_prefix='/api/overlay')


@blueprint.route('/settings', methods=['GET'])
def get_settings():
    """Get current overlay settings."""
    try:
        settings = get_overlay_settings()
        return jsonify(settings)
    except Exception as e:
        logger.error(f"Failed to get overlay settings: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/settings', methods=['PUT'])
def put_settings():
    """Update overlay settings."""
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        updated = update_overlay_settings(data)
        return jsonify(updated)
    except Exception as e:
        logger.error(f"Failed to update overlay settings: {e}")
        return jsonify({"error": str(e)}), 500
