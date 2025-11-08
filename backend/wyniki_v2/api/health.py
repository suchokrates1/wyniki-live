"""Health check endpoints."""
from flask import Blueprint, jsonify

from wyniki_v2.config import settings

blueprint = Blueprint('health', __name__)


@blueprint.route('/health')
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({
        "status": "healthy",
        "version": "2.0.0",
        "environment": settings.flask_env,
        "components": {
            "database": "ok",
            "poller": "ok"
        }
    })


@blueprint.route('/metrics')
def metrics():
    """Prometheus metrics endpoint (handled by prometheus-flask-exporter)."""
    pass

