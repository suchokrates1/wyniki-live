"""The court lector page. It is not the overlay: that page is also on the main picture."""
from __future__ import annotations

from flask import Blueprint, Response, abort, jsonify, send_from_directory

from ..services import court_lector

blueprint = Blueprint("lector", __name__)

def _page(court_id: str) -> str:
    return f"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Lektor kort {court_id}</title>
</head>
<body>
<audio id="clip" preload="auto"></audio>
<script>
let token = "";
async function look() {{
  try {{
    const response = await fetch("/api/lektor/{court_id}", {{ cache: "no-store" }});
    if (!response.ok) return;
    const body = await response.json();
    if (!body.token || body.token === token || !body.url) return;
    token = body.token;
    const clip = document.getElementById("clip");
    clip.src = body.url;
    clip.play().catch(() => {{}});
  }} catch (error) {{}}
}}
look();
setInterval(look, 1000);
</script>
</body>
</html>
"""


def _known_court(court_id: str) -> bool:
    from ..database.courts import fetch_courts
    from ..services.lector_lines import court_sentence

    if court_sentence(court_id) is None:
        return False
    return any(str(row.get("name") or "").strip() == court_id for row in fetch_courts())


@blueprint.route("/lektor/<court_id>")
def lector_page(court_id: str):
    """The page that plays one court. A court that does not exist is not served."""
    if not _known_court(court_id):
        abort(404)
    response = Response(_page(court_id), mimetype="text/html")
    response.headers["Cache-Control"] = "no-store"
    return response


@blueprint.route("/api/lektor/<court_id>")
def lector_status(court_id: str):
    """Whether this court has a clip ready, and the address of that clip."""
    if not _known_court(court_id):
        abort(404)
    response = jsonify(court_lector.playback_for(court_id).snapshot())
    response.headers["Cache-Control"] = "no-store"
    return response


@blueprint.route("/data/lector/<filename>")
def lector_audio(filename: str):
    """The current announcement for that court. Missing until the score has sat still."""
    if not filename.startswith("court-") or not filename.endswith(".mp3"):
        abort(404)
    court_id = filename.removeprefix("court-").removesuffix(".mp3")
    path = court_lector.announcement_path(court_id)
    if not path.is_file():
        abort(404)
    response = send_from_directory(path.parent, path.name, mimetype="audio/mpeg")
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
