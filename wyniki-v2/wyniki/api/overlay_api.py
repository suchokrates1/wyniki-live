"""Overlay settings API endpoints."""
from flask import Blueprint, jsonify, request

from ..services.overlay_settings import (
    get_overlay_settings,
    update_overlay_settings,
    delete_overlay,
)
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
    """Update overlay settings (merge semantics)."""
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        updated = update_overlay_settings(data)
        return jsonify(updated)
    except Exception as e:
        logger.error(f"Failed to update overlay settings: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/overlays/<overlay_id>', methods=['DELETE'])
def remove_overlay(overlay_id):
    """Delete a single overlay preset."""
    try:
        if delete_overlay(overlay_id):
            return jsonify({"ok": True})
        return jsonify({"error": "Overlay not found"}), 404
    except Exception as e:
        logger.error(f"Failed to delete overlay: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/logo', methods=['POST'])
def upload_logo():
    """Upload tournament logo as base64 data-URL (JSON body: {logo: "data:..."})."""
    try:
        data = request.get_json(force=True)
        logo = data.get("logo")
        if not logo or not isinstance(logo, str):
            return jsonify({"error": "Missing 'logo' field (base64 data-URL)"}), 400
        updated = update_overlay_settings({"tournament_logo": logo})
        return jsonify({"ok": True, "tournament_logo": updated.get("tournament_logo")})
    except Exception as e:
        logger.error(f"Failed to upload logo: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/logo', methods=['DELETE'])
def delete_logo():
    """Remove tournament logo."""
    try:
        update_overlay_settings({"tournament_logo": None})
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Failed to delete logo: {e}")
        return jsonify({"error": str(e)}), 500
