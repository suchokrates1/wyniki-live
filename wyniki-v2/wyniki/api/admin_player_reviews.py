"""Player edits made by series organizers, waiting for the admin. Behind the admin guard.

Accept keeps the change; revert puts the old values back (a class goes back through the
class history, like any other class change).
"""
from __future__ import annotations

from flask import Blueprint, jsonify

from ..database.series_records import decide_player_review, get_player_review, pending_player_reviews
from ..services import tournament_entries

blueprint = Blueprint("admin_player_reviews", __name__, url_prefix="/admin/api/player-reviews")


@blueprint.route("", methods=["GET"])
def pending():
    return jsonify(pending_player_reviews())


@blueprint.route("/<int:review_id>/accept", methods=["POST"])
def accept(review_id: int):
    if not decide_player_review(review_id, "accepted"):
        return jsonify({"error": "Review not found or already decided"}), 404
    return jsonify({"success": True})


@blueprint.route("/<int:review_id>/revert", methods=["POST"])
def revert(review_id: int):
    review = get_player_review(review_id)
    if not review or review["status"] != "pending":
        return jsonify({"error": "Review not found or already decided"}), 404
    old = {key: value or "" for key, value in review["before"].items()}
    if "category" in old:
        old["classification_note"] = f"cofnięta zmiana od {review['account_email']}"
    body, status = tournament_entries.update_global_player(review["global_player_id"], old)
    if status != 200:
        return jsonify(body), status
    decide_player_review(review_id, "reverted")
    return jsonify({"success": True, "player": body})
