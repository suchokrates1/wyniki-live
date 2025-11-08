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
