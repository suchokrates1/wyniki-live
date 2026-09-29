"""Public Web Push subscribe / unsubscribe.

No authentication: anyone reading the public scoreboard may ask to be told when
a match starts, exactly as they can already watch the page. What is stored is
the browser's own push endpoint and keys plus an optional court filter — no
account, no identifier we chose, and the row disappears as soon as the push
service says the endpoint is gone.
"""

from flask import Blueprint, jsonify, request

from ..database import push_subscriptions
from ..services import web_push

blueprint = Blueprint("push", __name__, url_prefix="/api/push")

# A push endpoint is a URL from the browser vendor; anything longer is not one.
MAX_ENDPOINT_LENGTH = 1024
MAX_KEY_LENGTH = 256


@blueprint.route("/key", methods=["GET"])
def push_key():
    """The VAPID public key, or enabled=false when push is not configured."""
    return jsonify({"enabled": web_push.is_enabled(), "public_key": web_push.public_key()})


@blueprint.route("/subscribe", methods=["POST"])
def subscribe():
    if not web_push.is_enabled():
        return jsonify({"error": "Push notifications are not configured"}), 503

    data = request.get_json(silent=True) or {}
    endpoint = str(data.get("endpoint") or "").strip()
    keys = data.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()

    if not endpoint.startswith("https://") or len(endpoint) > MAX_ENDPOINT_LENGTH:
        return jsonify({"error": "Invalid endpoint"}), 400
    if not p256dh or not auth or len(p256dh) > MAX_KEY_LENGTH or len(auth) > MAX_KEY_LENGTH:
        return jsonify({"error": "Invalid keys"}), 400

    court_id = data.get("court_id")
    court_id = str(court_id).strip() if court_id else None
    lang = str(data.get("lang") or "pl").strip()[:5] or "pl"

    push_subscriptions.save_subscription(endpoint, p256dh, auth, court_id, lang)
    return jsonify({"status": "ok", "court_id": court_id})


@blueprint.route("/unsubscribe", methods=["POST"])
def unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = str(data.get("endpoint") or "").strip()
    if not endpoint:
        return jsonify({"error": "Invalid endpoint"}), 400
    removed = push_subscriptions.delete_subscription(endpoint)
    return jsonify({"status": "ok", "removed": removed})
