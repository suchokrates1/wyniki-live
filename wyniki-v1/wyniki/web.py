"""Flask application factory."""
from __future__ import annotations

from flask import Flask

from . import routes
from .config import settings
from .poller import sync_poller_state


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.secret_key = settings.secret_key
    routes.register_routes(app)
    sync_poller_state()
    return app


app = create_app()
