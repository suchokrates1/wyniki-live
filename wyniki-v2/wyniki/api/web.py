"""Web page routes for v2."""
from flask import Blueprint, send_from_directory
from pathlib import Path

blueprint = Blueprint('web', __name__)

# Get the static directory (where built HTML files are located)
STATIC_DIR = Path(__file__).parent.parent / 'static'
# Get the app root directory (for overlay files)
APP_ROOT = Path(__file__).parent.parent.parent


@blueprint.route('/')
def index():
    """Serve main page."""
    response = send_from_directory(STATIC_DIR, 'index.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@blueprint.route('/admin')
@blueprint.route('/admin/')
@blueprint.route('/admin.html')
def admin():
    """Serve admin page."""
    response = send_from_directory(STATIC_DIR, 'admin.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@blueprint.route('/office')
@blueprint.route('/office/')
@blueprint.route('/office/<int:slot>')
@blueprint.route('/office/<int:slot>/')
@blueprint.route('/office.html')
def office(slot: int | None = None):
    """Serve standalone office page."""
    response = send_from_directory(STATIC_DIR, 'office.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@blueprint.route('/embed')
@blueprint.route('/embed.html')
@blueprint.route('/embed/<lang>/<int:court>')
def embed(lang=None, court=None):
    """Serve embed page with optional language and court parameters."""
    response = send_from_directory(STATIC_DIR, 'embed.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@blueprint.route('/assets/<path:filename>')
def assets(filename):
    """Serve static assets (JS, CSS, etc.)."""
    response = send_from_directory(STATIC_DIR / 'assets', filename)
    # Cache static assets for 1 hour (they have hashed names)
    response.headers['Cache-Control'] = 'public, max-age=3600, immutable'
    return response


@blueprint.route('/overlay/<overlay_id>')
@blueprint.route('/overlay/<int:tournament_slot>/<overlay_id>')
def overlay_page(overlay_id, tournament_slot=None):
    """Serve overlay page for any preset (e.g. /overlay/1, /overlay/all, /overlay/split_1_2)."""
    response = send_from_directory(APP_ROOT, 'overlay.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response
