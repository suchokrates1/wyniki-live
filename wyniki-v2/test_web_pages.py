"""Every page route serves the built file from wyniki/static.

The overlay used to be served from the repository root instead, which is why its code
drifted away from the Vite build for so long.
"""
from __future__ import annotations

import pytest

PAGES = [
    ("/", "index.html"),
    ("/admin", "admin.html"),
    ("/umpire", "umpire.html"),
    ("/office", "office.html"),
    ("/office/1", "office.html"),
    ("/privacy", "privacy.html"),
    ("/embed", "embed.html"),
    ("/overlay/1", "overlay.html"),
    ("/overlay/all", "overlay.html"),
    ("/overlay/2/split_1_2", "overlay.html"),
]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "pages.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    from wyniki.api import web

    static_dir = tmp_path / "static"
    static_dir.mkdir()
    for _, filename in PAGES:
        (static_dir / filename).write_text(f"<!doctype html><title>{filename}</title>", encoding="utf-8")
    monkeypatch.setattr(web, "STATIC_DIR", static_dir)
    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.mark.parametrize(("path", "filename"), PAGES)
def test_page_comes_from_the_build_output(client, path, filename):
    response = client.get(path)
    assert response.status_code == 200
    assert filename in response.get_data(as_text=True)
    assert "no-store" in response.headers["Cache-Control"]
