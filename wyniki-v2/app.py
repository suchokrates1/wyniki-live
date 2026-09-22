"""
Wyniki Live v2 - Modern Tennis Scores Application
Refactored with Alpine.js, Tailwind CSS, and modular backend
"""
from __future__ import annotations

# Monkey-patch standard library for gevent compatibility
# Must be done before any other imports
from gevent import monkey
monkey.patch_all()

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException
from prometheus_client import CollectorRegistry
from prometheus_flask_exporter import PrometheusMetrics
from sqlalchemy import event

from wyniki.config import logger, settings
from wyniki.database.connection import apply_sqlite_pragmas
from wyniki.db_models import db
from wyniki.api import courts, admin, health, stream, web, office, admin_auth
from wyniki.api.admin_tournaments import blueprint as tournaments_blueprint, players_public_bp, tournaments_public_bp
from wyniki.api.admin_global_players import blueprint as global_players_blueprint
from wyniki.api.umpire_api import blueprint as umpire_api_blueprint
from wyniki.api.overlay_api import blueprint as overlay_api_blueprint
from wyniki.api.brackets import bracket_public_bp, bracket_admin_bp
from wyniki.services.api_auth import require_admin_access
from wyniki.init_state import initialize_state


def _apply_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    """SQLAlchemy connections get the same WAL / busy-timeout settings as raw sqlite3."""
    cursor = dbapi_connection.cursor()
    try:
        apply_sqlite_pragmas(cursor)
    finally:
        cursor.close()


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        static_folder=str(settings.static_dir),
        static_url_path='/static'
    )
    
    # Configure Flask
    app.config['SECRET_KEY'] = settings.secret_key
    app.config['DEBUG'] = settings.debug
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{settings.database_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize SQLAlchemy
    db.init_app(app)
    
    # Create tables
    with app.app_context():
        event.listen(db.engine, "connect", _apply_sqlite_pragmas)
        db.create_all()
        initialize_state()
    
    # Initialize Prometheus metrics
    metrics = PrometheusMetrics(app, registry=CollectorRegistry())
    metrics.info('wyniki_live_v2', 'Tennis Live Scores v2', version='2.0.0')

    @app.before_request
    def protect_administrator_mutations():
        """Protect administrator APIs and overlay writes without affecting public reads."""
        if app.config.get("TESTING"):
            return None
        if request.path == "/admin/api/auth":
            return None
        if request.path.startswith("/admin/api/"):
            return require_admin_access()
        if request.path.startswith("/api/overlay/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            return require_admin_access()
        return None

    @app.errorhandler(Exception)
    def api_error_as_json(exc):
        """API callers get a JSON error body instead of Flask's HTML 500 page."""
        if isinstance(exc, HTTPException):
            return exc
        if not request.path.startswith(("/api/", "/admin/api/")):
            raise exc
        logger.error("unhandled_api_error", path=request.path, error=str(exc), exc_info=True)
        return jsonify({"error": str(exc)}), 500

    # Register blueprints
    app.register_blueprint(web.blueprint)
    app.register_blueprint(courts.blueprint)
    app.register_blueprint(admin.blueprint)
    app.register_blueprint(admin_auth.blueprint)
    app.register_blueprint(tournaments_blueprint)
    app.register_blueprint(players_public_bp)
    app.register_blueprint(tournaments_public_bp)
    app.register_blueprint(global_players_blueprint)
    app.register_blueprint(health.blueprint)
    app.register_blueprint(stream.blueprint)
    app.register_blueprint(office.blueprint)
    app.register_blueprint(umpire_api_blueprint)
    app.register_blueprint(overlay_api_blueprint)
    app.register_blueprint(bracket_public_bp)
    app.register_blueprint(bracket_admin_bp)
    
    from flask import send_from_directory
    import os

    # Serve player photos from persistent data volume
    @app.route('/data/photos/<path:filename>')
    def serve_photos(filename):
        data_dir = os.path.dirname(settings.database_path)
        photos_path = os.path.join(data_dir, 'photos')
        return send_from_directory(photos_path, filename)

    @app.route('/data/tournament-logos/<path:filename>')
    def serve_tournament_logos(filename):
        data_dir = os.path.dirname(settings.database_path)
        logos_path = os.path.join(data_dir, 'tournament-logos')
        return send_from_directory(logos_path, filename)
    
    logger.info(
        "application_started",
        version="2.0.0",
        port=settings.port,
        environment=settings.flask_env
    )
    
    return app


app = create_app()


if __name__ == '__main__':
    app.run(
        host=settings.host,
        port=settings.port,
        debug=settings.debug
    )
