"""Admin API endpoints."""
from flask import Blueprint

blueprint = Blueprint('admin', __name__, url_prefix='/admin')


@blueprint.route('/')
def admin_panel():
    """Admin panel page."""
    return "Admin Panel - Coming soon"
