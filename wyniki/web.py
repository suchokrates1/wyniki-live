"""Flask application factory."""
from __future__ import annotations

from flask import Flask

from . import routes
from .config import settings


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.secret_key = settings.secret_key
    routes.register_routes(app)
    return app


app = create_app()
