"""Test runtime defaults that should not depend on calendar date or seeded prod data."""
from datetime import datetime, timezone

import pytest


@pytest.fixture(autouse=True)
def _extend_court_auth_grace():
    from wyniki.config import settings

    settings.court_auth_grace_until = datetime(2099, 12, 31, tzinfo=timezone.utc)
    yield
