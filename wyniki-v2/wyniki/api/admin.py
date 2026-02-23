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


@blueprint.route('/api/courts/<kort_id>', methods=['DELETE'])
def delete_court(kort_id):
    """Delete a court."""
    try:
        from ..services import court_manager
        from .. import database
        
        # Delete from database
        deleted = database.delete_court(kort_id)
        
        if not deleted:
            return jsonify({"error": "Court not found"}), 404
        
        # Refresh in-memory state
        db_courts_list = database.fetch_courts()
        db_courts = [row["kort_id"] for row in db_courts_list]
        court_manager.refresh_courts_from_db(db_courts)
        
        logger.info(f"Court deleted: kort={kort_id}")
        return jsonify({"status": "ok", "kort_id": kort_id})
    except Exception as e:
        logger.error(f"Failed to delete court: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/courts/<kort_id>', methods=['PUT'])
def update_court(kort_id):
    """Update court (rename kort_id)."""
    try:
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
        db_courts_list = database.fetch_courts()
        db_courts = [row["kort_id"] for row in db_courts_list]
        court_manager.refresh_courts_from_db(db_courts)
        
        logger.info(f"Court renamed: {kort_id} -> {new_kort_id}")
        return jsonify({"status": "ok", "kort_id": new_kort_id})
    except Exception as e:
        logger.error(f"Failed to update court: {e}")
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


@blueprint.route('/api/demo', methods=['POST'])
def seed_demo():
    """Seed demo data for admin preview. Does NOT affect production overlays."""
    try:
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
    except Exception as e:
        logger.error(f"Failed to seed demo data: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/demo', methods=['DELETE'])
def clear_demo():
    """Clear demo data and deactivate demo overlay."""
    try:
        from ..services import court_manager
        from ..services.event_broker import event_broker

        was_active = court_manager.is_demo_overlay_active()
        court_manager.clear_demo_data()

        # If demo overlay was active, broadcast real courts so overlays recover
        if was_active:
            real_snapshot = court_manager.serialize_all_states()
            for kort_id, state in real_snapshot.items():
                payload = {
                    "type": "state_update",
                    "kort_id": kort_id,
                    "data": court_manager.serialize_public_court_state(
                        court_manager.get_court_state(kort_id) or {}
                    ),
                }
                event_broker.broadcast(payload)

        return jsonify({"status": "ok", "message": "Demo wyczyszczone"})
    except Exception as e:
        logger.error(f"Failed to clear demo: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/demo/overlay', methods=['POST'])
def toggle_demo_overlay():
    """Toggle demo data visibility in production overlays (OBS)."""
    try:
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
        logger.info(f"Demo overlay toggled: {active}")
        return jsonify({"status": "ok", "active": active, "message": msg})
    except Exception as e:
        logger.error(f"Failed to toggle demo overlay: {e}")
        return jsonify({"error": str(e)}), 500


@blueprint.route('/api/demo/status', methods=['GET'])
def demo_status():
    """Get current demo state."""
    from ..services import court_manager
    return jsonify({
        "demo_loaded": court_manager.has_demo_data(),
        "demo_overlay_active": court_manager.is_demo_overlay_active(),
        "demo_courts": court_manager.get_demo_courts_snapshot() if court_manager.has_demo_data() else {},
    })


