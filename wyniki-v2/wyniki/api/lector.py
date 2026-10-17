"""The court lector page. It is not the overlay: that page is also on the main picture."""
from __future__ import annotations

from flask import Blueprint, Response, abort, jsonify, send_from_directory

from ..services import court_lector

blueprint = Blueprint("lector", __name__)

_PAGE = """<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Lektor kort 1</title>
</head>
<body>
<audio id="clip" preload="auto"></audio>
<script>
let token = "";
async function look() {
  try {
    const response = await fetch("/api/lektor/1", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    if (!body.token || body.token === token || !body.url) return;
    token = body.token;
    const clip = document.getElementById("clip");
    clip.src = body.url;
    clip.play().catch(() => {});
  } catch (error) {}
}
look();
setInterval(look, 1000);
</script>
</body>
</html>
"""


@blueprint.route("/lektor/<court_id>")
def lector_page(court_id: str):
    """The page that plays court 1. Court 2 and the rest are not served."""
    if court_id != court_lector.COURT_ID:
        abort(404)
    response = Response(_PAGE, mimetype="text/html")
    response.headers["Cache-Control"] = "no-store"
    return response


@blueprint.route("/api/lektor/<court_id>")
def lector_status(court_id: str):
    """Whether court 1 has a clip ready, and the address of that clip."""
    if court_id != court_lector.COURT_ID:
        abort(404)
    response = jsonify(court_lector.playback.snapshot())
    response.headers["Cache-Control"] = "no-store"
    return response


@blueprint.route("/data/lector/court-1.mp3")
def lector_audio():
    """The current court 1 announcement. Missing until the score has sat still."""
    path = court_lector.announcement_path()
    if not path.is_file():
        abort(404)
    response = send_from_directory(path.parent, path.name, mimetype="audio/mpeg")
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
