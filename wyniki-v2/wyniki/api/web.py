"""Web page routes for v2."""
from flask import Blueprint, send_from_directory
from pathlib import Path

blueprint = Blueprint('web', __name__)

# Get the app root directory (where index.html, admin.html are located)
APP_ROOT = Path(__file__).parent.parent.parent


@blueprint.route('/')
def index():
    """Serve main page."""
    return send_from_directory(APP_ROOT, 'index.html')


@blueprint.route('/admin')
@blueprint.route('/admin.html')
def admin():
    """Serve admin page."""
    return send_from_directory(APP_ROOT, 'admin.html')


@blueprint.route('/embed')
@blueprint.route('/embed.html')
@blueprint.route('/embed/<lang>/<int:court>')
def embed(lang=None, court=None):
    """Serve embed page with optional language and court parameters."""
    return send_from_directory(APP_ROOT, 'embed.html')


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
