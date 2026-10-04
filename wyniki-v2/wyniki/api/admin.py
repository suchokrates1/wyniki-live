"""Admin API endpoints."""
from flask import Blueprint, jsonify, request

from ..config import logger

blueprint = Blueprint('admin', __name__, url_prefix='/admin')


@blueprint.route('/api/courts', methods=['GET'])
def get_courts():
    """Get courts for active tournaments only."""
    from .. import database
    
    courts_data = database.fetch_courts(active_only=True)
    return jsonify(courts_data)


@blueprint.route('/api/courts', methods=['POST'])
def add_court():
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
    
    logger.info("court_added", kort=kort_id, pin_set=bool(pin))
    return jsonify({"status": "ok", "kort_id": kort_id}), 201


@blueprint.route('/api/courts/<kort_id>/pin', methods=['PUT'])
def update_court_pin(kort_id):
    from .. import database
    
    data = request.get_json() or {}
    pin = data.get("pin")
    
    # Validate PIN format (4 digits or null)
    if pin and (len(pin) != 4 or not pin.isdigit()):
        return jsonify({"error": "PIN must be 4 digits"}), 400
    
    database.upsert_court(kort_id, pin)
    
    logger.info("court_pin_updated", kort=kort_id)
    return jsonify({"status": "ok", "kort_id": kort_id})


@blueprint.route('/api/courts/<kort_id>', methods=['DELETE'])
def delete_court(kort_id):
    from ..services import court_manager
    from .. import database
    
    # Delete from database
    deleted = database.delete_court(kort_id)
    
    if not deleted:
        return jsonify({"error": "Court not found"}), 404
    
    # Refresh in-memory state
    db_courts_list = database.fetch_courts(active_only=True)
    court_manager.refresh_courts_from_db(db_courts_list)
    
    logger.info("court_deleted", kort=kort_id)
    return jsonify({"status": "ok", "kort_id": kort_id})


@blueprint.route('/api/courts/<kort_id>/reset', methods=['POST'])
def reset_court(kort_id):
    """Reset court state - clear all match data."""
    from ..services import court_manager
    from ..services.event_broker import emit_score_update

    state = court_manager.get_court_state(kort_id)
    if state is None:
        return jsonify({"error": "Court not found"}), 404

    with court_manager.STATE_LOCK:
        identity = {
            "court_name": state.get("court_name"),
            "display_order": state.get("display_order"),
            "tournament_id": state.get("tournament_id"),
            "tournament_name": state.get("tournament_name"),
        }
        fresh = court_manager._empty_court_state()
        fresh.update(identity)
        state.clear()
        state.update(fresh)

    emit_score_update(kort_id, state)
    logger.info("court_reset", kort=kort_id)
    return jsonify({"status": "ok", "kort_id": kort_id})


@blueprint.route('/api/courts/<kort_id>', methods=['PUT'])
def update_court(kort_id):
    """Update court (rename kort_id)."""
    from ..services import court_manager
    from .. import database
    
    data = request.get_json() or {}
    new_kort_id = data.get("kort_id")
    
    if not new_kort_id:
        return jsonify({"error": "New kort_id required"}), 400
    
    if new_kort_id == kort_id:
        return jsonify({"status": "ok", "kort_id": kort_id})
    
    # Rename in database
    renamed = database.rename_court(kort_id, new_kort_id)
    
    if not renamed:
        return jsonify({"error": "Court not found or new ID already exists"}), 400
    
    # Refresh in-memory state
    db_courts_list = database.fetch_courts(active_only=True)
    court_manager.refresh_courts_from_db(db_courts_list)
    
    logger.info("court_renamed", kort=kort_id, new_kort=new_kort_id)
    return jsonify({"status": "ok", "kort_id": new_kort_id})


@blueprint.route('/api/history/latest', methods=['DELETE'])
def delete_latest_history():
    """Delete the latest history entry."""
    from ..services import history_manager
    
    deleted = history_manager.delete_latest_history()
    
    if deleted:
        logger.info("history_entry_deleted", entry=deleted)
        return jsonify({"status": "ok", "deleted": deleted})
    else:
        return jsonify({"status": "ok", "message": "No history to delete"})


@blueprint.route('/api/e2e/cleanup', methods=['POST'])
def cleanup_e2e_artifacts():
    """Delete emulator E2E artifacts created with an E2E-* marker."""
    try:
        from ..database import (
            commit_writes,
            delete_e2e_global_players,
            delete_e2e_history,
            delete_e2e_matches,
            delete_tournament,
            e2e_matches,
            e2e_tournaments,
            fetch_courts,
            forget_all_rows,
        )
        from ..services.court_manager import refresh_courts_from_db

        data = request.get_json(silent=True) or {}
        marker = str(data.get("marker") or "").strip()

        if not marker.startswith("E2E-"):
            return jsonify({"error": "marker must start with E2E-"}), 400

        tournament_ids = [row.id for row in e2e_tournaments(marker)]
        deleted_tournaments = 0
        for tournament_id in tournament_ids:
            if delete_tournament(tournament_id):
                deleted_tournaments += 1
        forget_all_rows()

        match_ids = [row.id for row in e2e_matches(marker)]
        deleted_statistics, deleted_matches = delete_e2e_matches(match_ids)
        deleted_history = delete_e2e_history(marker, match_ids)
        deleted_global_players = delete_e2e_global_players(marker)

        commit_writes()
        refresh_courts_from_db(fetch_courts(active_only=True))

        return jsonify({
            "status": "ok",
            "marker": marker,
            "deleted_matches": deleted_matches,
            "deleted_statistics": deleted_statistics,
            "deleted_history": deleted_history,
            "deleted_tournaments": deleted_tournaments,
            "deleted_global_players": deleted_global_players,
        })
    except Exception as e:
        try:
            from ..database import rollback_writes
            rollback_writes()
        except Exception:
            logger.exception("Failed to roll back after E2E cleanup error")
        logger.error("e2e_cleanup_failed", error=str(e))
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/e2e/artifacts', methods=['GET'])
def get_e2e_artifacts():
    """Return emulator E2E artifacts created with an E2E-* marker."""
    from ..database import e2e_history, e2e_matches, e2e_statistics, e2e_tournaments

    marker = str(request.args.get("marker") or "").strip()
    if not marker.startswith("E2E-"):
        return jsonify({"error": "marker must start with E2E-"}), 400

    matches = e2e_matches(marker)
    match_ids = [match.id for match in matches]
    history = e2e_history(marker, match_ids)
    statistics = e2e_statistics(match_ids)
    tournaments = e2e_tournaments(marker)

    return jsonify({
        "marker": marker,
        "matches": [match.to_dict() for match in matches],
        "history": [entry.to_dict() | {"match_id": entry.match_id, "sets_history": entry.sets_history} for entry in history],
        "statistics": [stat.to_dict() for stat in statistics],
        "tournaments": [tournament.to_dict() for tournament in tournaments],
    })


@blueprint.route('/api/settings/email', methods=['GET'])
def get_email_settings():
    """Get SMTP/email settings used for match and tournament reports."""
    from ..services.email_reports import get_email_settings as load_email_settings

    return jsonify(load_email_settings())


@blueprint.route('/api/settings/email', methods=['PUT'])
def update_email_settings():
    """Persist SMTP/email settings."""
    from ..services.email_reports import save_email_settings

    data = request.get_json(silent=True) or {}
    save_email_settings(data)
    return jsonify({"status": "ok"})


@blueprint.route('/api/demo', methods=['POST'])
def seed_demo():
    """Seed demo data for admin preview. Does NOT affect production overlays."""
    from ..services import court_manager

    ok, msg, demo_courts = court_manager.seed_demo_data()
    if not ok:
        return jsonify({"error": msg}), 400

    logger.info("Demo data seeded via API (admin preview only)")
    return jsonify({
        "status": "ok",
        "message": msg,
        "demo_courts": demo_courts,
        "demo_overlay_active": court_manager.is_demo_overlay_active(),
    })


@blueprint.route('/api/demo', methods=['DELETE'])
def clear_demo():
    """Clear demo data and deactivate demo overlay."""
    from ..services import court_manager
    from ..services.event_broker import event_broker

    was_active = court_manager.is_demo_overlay_active()
    court_manager.clear_demo_data()

    # If demo overlay was active, broadcast real courts so overlays recover
    if was_active:
        real_snapshot = court_manager.serialize_all_states()
        for kort_id in real_snapshot:
            payload = {
                "type": "state_update",
                "kort_id": kort_id,
                "data": court_manager.serialize_public_court_state(
                    court_manager.get_court_state(kort_id) or {}
                ),
            }
            event_broker.broadcast(payload)

    return jsonify({"status": "ok", "message": "Demo wyczyszczone"})


@blueprint.route('/api/demo/overlay', methods=['POST'])
def toggle_demo_overlay():
    """Toggle demo data visibility in production overlays (OBS)."""
    from ..services import court_manager
    from ..services.event_broker import event_broker

    data = request.get_json(silent=True) or {}
    active = bool(data.get("active", False))

    if active and not court_manager.has_demo_data():
        return jsonify({"error": "Najpierw załaduj dane demo"}), 400

    court_manager.set_demo_overlay(active)

    # Broadcast appropriate courts so overlays update immediately
    if active:
        demo_snapshot = court_manager.get_demo_courts_snapshot()
        for kort_id, state in demo_snapshot.items():
            payload = {
                "type": "state_update",
                "kort_id": kort_id,
                "data": state,
            }
            event_broker.broadcast(payload)
    else:
        # Restore real courts in overlays
        for kort_id in court_manager.available_courts():
            real_state = court_manager.get_court_state(kort_id)
            if real_state:
                payload = {
                    "type": "state_update",
                    "kort_id": kort_id,
                    "data": court_manager.serialize_public_court_state(real_state),
                }
                event_broker.broadcast(payload)

    msg = "Demo widoczne w overlayach" if active else "Overlaye przywrócone do danych produkcyjnych"
    logger.info("demo_overlay_toggled", active=active)
    return jsonify({"status": "ok", "active": active, "message": msg})


@blueprint.route('/api/demo/status', methods=['GET'])
def demo_status():
    """Get current demo state."""
    from ..services import court_manager
    return jsonify({
        "demo_loaded": court_manager.has_demo_data(),
        "demo_overlay_active": court_manager.is_demo_overlay_active(),
        "demo_courts": court_manager.get_demo_courts_snapshot() if court_manager.has_demo_data() else {},
    })


@blueprint.route('/api/director/tablets', methods=['GET'])
def director_tablets():
    """Live umpire tablets (heartbeat/events) plus in-progress matches on a court."""
    from ..database import court_names, matches_in_progress
    from ..services.director_commands import tablet_presence
    from ..services.tablet_aliases import annotate_tablet

    court_id = str(request.args.get("court_id") or "").strip() or None
    matches_on_court = matches_in_progress(court_id)
    match_ids_on_court = {match.id for match in matches_on_court}
    tablets = tablet_presence.list_visible_on_court(court_id, match_ids_on_court)
    seen_match_ids = {row.get("match_id") for row in tablets if row.get("match_id")}
    for match in matches_on_court:
        if match.id in seen_match_ids:
            continue
        tablets.append({
            "session_court_id": match.court_id,
            "match_id": match.id,
            "client_match_uuid": match.client_match_uuid,
            "player1_name": match.player1_name,
            "player2_name": match.player2_name,
            "screen": None,
            "battery_level": None,
            "app_version": None,
            "last_seen": match.updated_at,
            "from_db": True,
        })
    court_ids = {row.get("session_court_id") for row in tablets if row.get("session_court_id")}
    names = court_names(court_ids)
    for row in tablets:
        annotate_tablet(row, names.get(row.get("session_court_id")))
    return jsonify({"tablets": tablets})


@blueprint.route('/api/matches/<int:match_id>/control', methods=['POST'])
def director_control_match(match_id: int):
    """Push court, names, score, and match rules onto the umpire tablet."""
    try:
        from ..db_models import Match
        from ..database import get_row
        from ..services.director_commands import apply_director_control

        match = get_row(Match, match_id)
        if not match:
            return jsonify({"error": "Match not found"}), 404
        payload = request.get_json(silent=True) or {}
        command = apply_director_control(match, payload)
        return jsonify({"status": "ok", "command": command, "match": match.to_dict()}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("director_control_failed", error=str(e), exc_info=True)
        return jsonify({"error": str(e)}), 500



