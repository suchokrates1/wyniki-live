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
# Following a whole draw would be a notification firehose, not a feature.
MAX_FOLLOWED_PLAYERS = 10


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

    raw_players = data.get("players")
    if not isinstance(raw_players, list):
        raw_players = []
    players = [str(name).strip()[:120] for name in raw_players[:MAX_FOLLOWED_PLAYERS] if str(name).strip()]

    raw_prefs = data.get("preferences")
    preferences = raw_prefs if isinstance(raw_prefs, dict) else {}
    reminder = preferences.get("reminder_minutes")
    if reminder is not None:
        try:
            preferences["reminder_minutes"] = max(5, min(180, int(reminder)))
        except (TypeError, ValueError):
            preferences.pop("reminder_minutes", None)

    push_subscriptions.save_subscription(
        endpoint, p256dh, auth, court_id, lang, preferences=preferences, players=players
    )
    return jsonify({"status": "ok", "court_id": court_id, "players": players})


@blueprint.route("/unsubscribe", methods=["POST"])
def unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = str(data.get("endpoint") or "").strip()
    if not endpoint:
        return jsonify({"error": "Invalid endpoint"}), 400
    removed = push_subscriptions.delete_subscription(endpoint)
    return jsonify({"status": "ok", "removed": removed})
