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


@blueprint.route('/stream1')
@blueprint.route('/stream1.html')
def stream1():
    """Serve stream player for court 1."""
    response = send_from_directory(APP_ROOT / 'static', 'stream1.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response


@blueprint.route('/stream2')
@blueprint.route('/stream2.html')
def stream2():
    """Serve stream player for court 2."""
    response = send_from_directory(APP_ROOT / 'static', 'stream2.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response


@blueprint.route('/stream3')
@blueprint.route('/stream3.html')
def stream3():
    """Serve stream player for court 3."""
    response = send_from_directory(APP_ROOT / 'static', 'stream3.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response


@blueprint.route('/stream4')
@blueprint.route('/stream4.html')
def stream4():
    """Serve stream player for court 4."""
    response = send_from_directory(APP_ROOT / 'static', 'stream4.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response


@blueprint.route('/overlay/<overlay_id>')
def overlay_page(overlay_id):
    """Serve overlay page for any preset (e.g. /overlay/1, /overlay/all, /overlay/split_1_2)."""
    response = send_from_directory(APP_ROOT, 'overlay.html')
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response
