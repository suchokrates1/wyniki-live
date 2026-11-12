"""Thin HTTP handlers for umpire match lifecycle and live match events."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..config import logger
from ..database import get_row, rollback_writes
from ..db_models import Match
from ..services.api_auth import (
    court_id_from_bearer as court_id_from_bearer,
    require_court_access,
    require_match_read,
)
from ..services.court_manager import normalize_kort_id
from ..services.director_commands import director_command_broker as director_command_broker
from ..services.umpire_client_meta import (
    _clean_client_text as _clean_client_text,
    _clean_int as _clean_int,
    _request_client_meta as _request_client_meta,
)
from ..services.umpire_live_events import process_umpire_match_event
from ..services.umpire_match_service import (
    create_umpire_match,
    finish_umpire_match,
    save_umpire_statistics,
    update_umpire_match,
)
from ..services.umpire_overlay_sync import (
    _apply_umpire_put_sets as _apply_umpire_put_sets,
    _sync_court_match_timer_from_match as _sync_court_match_timer_from_match,
    _sync_live_score_to_court_state as _sync_live_score_to_court_state,
)
from ..services.umpire_roster import (
    _apply_db_flags_to_court_state as _apply_db_flags_to_court_state,
    _flag_fields_from_person_payload as _flag_fields_from_person_payload,
    _mobile_player_payload_for_name as _mobile_player_payload_for_name,
)

blueprint = Blueprint('umpire_api', __name__, url_prefix='/api')

# What a 500 says. The exception itself goes to the log, never to the caller: its text
# names tables, columns and file paths.
INTERNAL_ERROR = "Internal error"


@blueprint.route('/matches', methods=['POST'])
def create_match():
    """Create new match on server."""
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid payload"}), 400
        access_error = require_court_access(data.get("court_id"))
        if access_error:
            return access_error
        payload, status = create_umpire_match(data)
        return jsonify(payload), status
    except Exception as e:
        rollback_writes()
        logger.error("match_create_failed", error=str(e), exc_info=True)
        return jsonify({"error": INTERNAL_ERROR}), 500


@blueprint.route('/matches/<int:match_id>', methods=['GET'])
def get_match(match_id: int):
    """Match details for the court playing it, or for an administrator."""
    match = get_row(Match, match_id)
    if not match:
        return jsonify({"error": "Match not found"}), 404
    access_error = require_match_read(match.court_id)
    if access_error:
        return access_error
    return jsonify(match.to_dict()), 200


@blueprint.route('/matches/<int:match_id>', methods=['PUT'])
def update_match(match_id: int):
    """Update match score and state."""
    try:
        data = request.get_json(silent=True)
        match = get_row(Match, match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        access_error = require_court_access(match.court_id)
        if access_error:
            return access_error
        if not isinstance(data, dict) or not isinstance(data.get("score", {}), dict):
            return jsonify({"error": "Invalid payload"}), 400
        return jsonify(update_umpire_match(match, data)), 200
    except ValueError as e:
        rollback_writes()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        rollback_writes()
        logger.error("match_update_failed", error=str(e), exc_info=True)
        return jsonify({"error": INTERNAL_ERROR}), 500


@blueprint.route('/matches/<int:match_id>/finish', methods=['POST'])
def finish_match(match_id: int):
    """Mark match as finished."""
    try:
        data = request.get_json(silent=True) or {}
        match = get_row(Match, match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        access_error = require_court_access(match.court_id)
        if access_error:
            if match.status == "finished":
                logger.info("stale_finish_ack", match_id=match_id, match_court=match.court_id)
                return jsonify(match.to_dict()), 200
            return access_error
        return jsonify(finish_umpire_match(match, data)), 200
    except ValueError as e:
        rollback_writes()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        rollback_writes()
        logger.error("match_finish_failed", error=str(e), exc_info=True)
        return jsonify({"error": INTERNAL_ERROR}), 500


@blueprint.route('/match-statistics', methods=['POST'])
def receive_statistics():
    """Receive match statistics from app."""
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid payload"}), 400
        match_id = data.get("match_id")
        if not match_id:
            return jsonify({"error": "match_id required"}), 400
        match = get_row(Match, match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        access_error = require_court_access(match.court_id)
        if access_error:
            if match.status == "finished":
                logger.info("stale_statistics_ack", match_id=match_id, match_court=match.court_id)
                return jsonify({"message": "Statistics ignored (stale outbox)"}), 200
            return access_error
        payload, status = save_umpire_statistics(match, data)
        return jsonify(payload), status
    except Exception as e:
        rollback_writes()
        logger.error("match_stats_failed", error=str(e), exc_info=True)
        return jsonify({"error": INTERNAL_ERROR}), 500


@blueprint.route('/match-events', methods=['POST'])
def log_match_event():
    """Process match event and push real-time score update via SSE."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid payload"}), 400
    kort_id = normalize_kort_id(data.get('court_id'))
    access_error = require_court_access(kort_id)
    if access_error:
        return access_error
    if not kort_id:
        return jsonify({"error": "court_id required"}), 400
    payload, status = process_umpire_match_event(kort_id, data)
    return jsonify(payload), status


from .umpire_courts import register as register_umpire_courts  # noqa: E402
from .umpire_presence import register as register_umpire_presence  # noqa: E402

register_umpire_courts(blueprint)
register_umpire_presence(blueprint)
