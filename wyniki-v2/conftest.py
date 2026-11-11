"""Test runtime defaults that should not depend on calendar date or seeded prod data."""
import os
from datetime import datetime, UTC

import pytest

# The app refuses to start in production mode with the placeholder key from the
# repository. Tests get their own, set before anything imports the settings.
os.environ.setdefault("SECRET_KEY", "pytest-only-secret-key")


@pytest.fixture(autouse=True)
def _extend_court_auth_grace():
    from wyniki.config import settings

    settings.court_auth_grace_until = datetime(2099, 12, 31, tzinfo=UTC)
    yield


@pytest.fixture()
def full_app_with_temp_db(tmp_path, monkeypatch):
    """The whole app against a throwaway database.

    Shared here rather than in one test module so integration tests that cross
    features - an office action that fires a notification, say - do not have to
    grow inside the module that happened to need it first.
    """
    db_path = tmp_path / "wyniki-full.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app
