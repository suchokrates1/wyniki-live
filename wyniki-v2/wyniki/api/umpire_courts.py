"""Court discovery, schedule suggestion, PIN authorization, and player routes for umpire devices."""
from __future__ import annotations

import hmac

from flask import jsonify, request

from ..config import logger
from ..database import (
    commit_writes,
    fetch_courts,
    find_suggested_schedule_match,
    get_active_tournament_id,
    get_row,
    get_tournament_id_for_court,
    rollback_writes,
    tournament_players_by_name,
    write_session,
)
from ..db_models import Court
from ..services import login_throttle
from ..services.api_auth import (
    court_session_expires_at,
    issue_court_token,
    require_court_access,
)
from ..services.court_manager import get_court_state, normalize_kort_id
from ..services.player_registry import create_tournament_player, player_payload
from ..services.umpire_roster import (
    _format_mobile_court_name,
    _mobile_schedule_suggestion_payload,
    _resolve_tournament_for_court,
)

COURT_PIN_MAX_FAILURES = 10
INTERNAL_ERROR = "Internal error"


def register(blueprint) -> None:
    @blueprint.route('/courts', methods=['GET'])
    def get_courts():
        """Get list of available courts for app."""
        try:
            selected_tournament_id = request.args.get("tournament_id", type=int)
            courts_list = fetch_courts()
            if selected_tournament_id is not None:
                courts_list = [
                    court for court in courts_list if court.get("tournament_id") == selected_tournament_id
                ]

            courts_data = []
            for court in courts_list:
                kort_id = court["kort_id"]
                state = get_court_state(kort_id)
                is_active = bool(state and state.get("match_status", {}).get("active", False))
                display_name = _format_mobile_court_name(court)
                courts_data.append({
                    "kort_id": kort_id,
                    "name": display_name,
                    "tournament_id": court.get("tournament_id"),
                    "tournament_name": court.get("tournament_name"),
                    "status": "occupied" if is_active else "available",
                    "is_available": not is_active,
                })

            return jsonify({
                "courts": courts_data,
                "count": len(courts_data),
                "total_count": len(courts_data),
            }), 200
        except Exception as e:
            logger.error("umpire_courts_failed", error=str(e), exc_info=True)
            return jsonify({"error": INTERNAL_ERROR}), 500

    @blueprint.route('/courts/<kort_id>/suggested-match', methods=['GET'])
    def get_court_suggested_match(kort_id: str):
        """Return nearest scheduled match for the selected court and current app time."""
        tournament_id = (
            request.args.get("tournament_id", type=int)
            or get_tournament_id_for_court(kort_id)
            or get_active_tournament_id()
        )
        court_id = normalize_kort_id(kort_id)
        if not tournament_id or not court_id:
            return jsonify({"suggestion": None}), 200
        entry = find_suggested_schedule_match(
            tournament_id,
            court_id,
            reference_time=request.args.get("at"),
        )
        return jsonify({"suggestion": _mobile_schedule_suggestion_payload(entry, tournament_id)}), 200

    @blueprint.route('/players', methods=['GET', 'POST', 'OPTIONS'])
    def get_players():
        """Get list of available players for app, or add a new player (POST)."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response, 204

        if request.method == 'POST':
            try:
                data = request.get_json(silent=True)
                if not data:
                    return jsonify({"ok": False, "error": "invalid-payload"}), 400

                kort_id = data.get("kort_id")
                provided_pin = str(data.get("pin", "")).strip()
                if not kort_id:
                    return jsonify({"ok": False, "error": "kort_id required"}), 400

                court = get_row(Court, kort_id)
                if not court:
                    return jsonify({"ok": False, "error": "court-not-found"}), 404
                access_error = require_court_access(kort_id)
                if access_error:
                    return access_error
                if not request.headers.get("Authorization"):
                    if not provided_pin:
                        return jsonify({"ok": False, "error": "pin required for legacy client"}), 400
                    if court.pin and provided_pin != court.pin:
                        return jsonify({"ok": False, "error": "invalid-pin", "authorized": False}), 403

                normalized_player = player_payload(data)
                if not normalized_player["last_name"] and not normalized_player["name"]:
                    return jsonify({"ok": False, "error": "last_name or surname required"}), 400

                tournament = _resolve_tournament_for_court(kort_id)
                if not tournament:
                    return jsonify({"ok": False, "error": "no tournament for court"}), 400

                player = create_tournament_player(
                    write_session(),
                    tournament_id=tournament.id,
                    name=normalized_player["name"],
                    first_name=normalized_player["first_name"],
                    last_name=normalized_player["last_name"],
                    country=normalized_player["country"],
                    category=normalized_player["category"],
                    gender=normalized_player["gender"],
                )
                commit_writes()
                logger.info("umpire_player_created", player_id=player.id, name=player.full_name)
                country_code = (player.country or '').strip() or None
                return jsonify({
                    "ok": True,
                    "player": {
                        "id": player.id,
                        "first_name": player.first_name or '',
                        "last_name": player.last_name or '',
                        "surname": player.last_name or player.name,
                        "full_name": player.full_name,
                        "name": player.full_name,
                        "country_code": country_code,
                        "category": player.category,
                        "flag_url": f"https://flagcdn.com/w80/{country_code.lower()}.png" if country_code else None,
                    },
                }), 201
            except Exception as e:
                rollback_writes()
                logger.error("umpire_player_create_failed", error=str(e), exc_info=True)
                return jsonify({"ok": False, "error": INTERNAL_ERROR}), 500

        try:
            kort_id = request.args.get("court_id") or request.args.get("kort_id")
            tournament = _resolve_tournament_for_court(kort_id)
            if not tournament:
                return jsonify({
                    "players": [],
                    "count": 0,
                    "message": "No tournament for selected court",
                }), 200

            players = tournament_players_by_name(tournament.id)
            players_data = []
            for player in players:
                fn = player.first_name or ''
                ln = player.last_name or ''
                full = player.full_name
                country_code = (player.country or '').strip() or None
                players_data.append({
                    "id": player.id,
                    "first_name": fn,
                    "last_name": ln,
                    "surname": ln or player.name,
                    "full_name": full,
                    "name": full,
                    "country_code": country_code,
                    "flag_url": f"https://flagcdn.com/w80/{country_code.lower()}.png" if country_code else None,
                })
            return jsonify({"players": players_data, "count": len(players_data)}), 200
        except Exception as e:
            logger.error("umpire_players_failed", error=str(e), exc_info=True)
            return jsonify({"error": INTERNAL_ERROR}), 500

    @blueprint.route('/courts/<kort_id>/authorize', methods=['POST'])
    def authorize_court(kort_id: str):
        """Verify PIN for court access."""
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"ok": False, "authorized": False, "error": "invalid-payload"}), 400

        provided_pin = str(data.get('pin', '')).strip()
        if not provided_pin:
            return jsonify({"ok": False, "authorized": False, "error": "pin-required"}), 400

        court = get_row(Court, kort_id)
        if not court:
            logger.warning("court_not_found", kort=kort_id)
            return jsonify({"ok": False, "authorized": False, "error": "court-not-found"}), 404

        door = f"court-pin:{kort_id}"
        refused = login_throttle.refusal(door, limit=COURT_PIN_MAX_FAILURES)
        if refused:
            logger.warning("court_pin_throttled", kort=kort_id)
            return refused

        correct_pin = court.pin or "0000"
        authorized = hmac.compare_digest(provided_pin.encode(), correct_pin.encode())
        logger.info("court_pin_checked", kort=kort_id, authorized=authorized)

        if authorized:
            login_throttle.forget(door)
            return jsonify({
                "ok": True,
                "authorized": True,
                "court_id": kort_id,
                "kort_id": kort_id,
                "token": issue_court_token(kort_id),
                "expires_at": court_session_expires_at(),
                "message": "Access granted",
            }), 200

        login_throttle.note_failure(door)
        return jsonify({"ok": False, "authorized": False, "error": "invalid-pin"}), 403
