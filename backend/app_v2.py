"""
Wyniki Live v2 - Modern Tennis Scores Application
Refactored with Alpine.js, Tailwind CSS, and modular backend
"""
from __future__ import annotations

from flask import Flask
from prometheus_flask_exporter import PrometheusMetrics

from wyniki_v2.config import logger, settings
from wyniki_v2.api import courts, admin, health, stream, web
from wyniki_v2.init_state import initialize_state


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
    
    # Initialize application state
    with app.app_context():
        initialize_state()
    
    # Initialize Prometheus metrics
    metrics = PrometheusMetrics(app)
    metrics.info('wyniki_live_v2', 'Tennis Live Scores v2', version='2.0.0')
    
    # Register blueprints
    app.register_blueprint(web.blueprint)
    app.register_blueprint(courts.blueprint)
    app.register_blueprint(admin.blueprint)
    app.register_blueprint(health.blueprint)
    app.register_blueprint(stream.blueprint)
    
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
