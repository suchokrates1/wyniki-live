"""
Wyniki Live v2 - Modern Tennis Scores Application
Refactored with Alpine.js, Tailwind CSS, and modular backend
"""
from __future__ import annotations

# Monkey-patch standard library for gevent compatibility
# Must be done before any other imports
from gevent import monkey
monkey.patch_all()

from flask import Flask
from prometheus_client import CollectorRegistry
from prometheus_flask_exporter import PrometheusMetrics
from sqlalchemy import event

from wyniki.config import logger, settings
from wyniki.db_models import db
from wyniki.api import courts, admin, health, stream, web, events
from wyniki.api.admin_tournaments import blueprint as tournaments_blueprint, players_public_bp, tournaments_public_bp
from wyniki.api.admin_global_players import blueprint as global_players_blueprint
from wyniki.api.umpire_api import blueprint as umpire_api_blueprint
from wyniki.api.overlay_api import blueprint as overlay_api_blueprint
from wyniki.api.brackets import bracket_public_bp, bracket_admin_bp
from wyniki.init_state import initialize_state


def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
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
        event.listen(db.engine, "connect", _enable_sqlite_foreign_keys)
        db.create_all()
        initialize_state()
    
    # Initialize Prometheus metrics
    metrics = PrometheusMetrics(app, registry=CollectorRegistry())
    metrics.info('wyniki_live_v2', 'Tennis Live Scores v2', version='2.0.0')
    
    # Register blueprints
    app.register_blueprint(web.blueprint)
    app.register_blueprint(courts.blueprint)
    app.register_blueprint(admin.blueprint)
    app.register_blueprint(tournaments_blueprint)
    app.register_blueprint(players_public_bp)
    app.register_blueprint(tournaments_public_bp)
    app.register_blueprint(global_players_blueprint)
    app.register_blueprint(health.blueprint)
    app.register_blueprint(stream.blueprint)
    app.register_blueprint(events.blueprint)
    app.register_blueprint(umpire_api_blueprint)
    app.register_blueprint(overlay_api_blueprint)
    app.register_blueprint(bracket_public_bp)
    app.register_blueprint(bracket_admin_bp)
    
    # Add /assets route as alias to /static/assets for Vite compatibility
    from flask import send_from_directory
    import os
    
    @app.route('/assets/<path:filename>')
    def serve_assets(filename):
        assets_path = os.path.join(settings.static_dir, 'assets')
        return send_from_directory(assets_path, filename)

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
