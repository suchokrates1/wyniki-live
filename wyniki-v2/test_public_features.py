"""Trial features reach the public page as a meta tag only where the stack switches them on."""
import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-features.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    # The page itself comes from the Vite build, which CI does not run for the backend
    # job; a stand-in with the same <head> is all the meta-tag stamping needs.
    from wyniki.api import web

    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text(
        "<!doctype html><html><head><title>Wyniki</title></head><body></body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(web, "STATIC_DIR", static_dir)
    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_production_page_carries_no_feature_meta(client, monkeypatch):
    from wyniki.config import settings

    monkeypatch.setattr(settings, "public_features", "")
    html = client.get("/").get_data(as_text=True)
    assert 'name="bt-features"' not in html


def test_switched_on_features_are_stamped_and_sanitised(client, monkeypatch):
    from wyniki.config import settings

    monkeypatch.setattr(settings, "public_features", "court-next, Bad\"><script>, other")
    html = client.get("/").get_data(as_text=True)
    assert '<meta name="bt-features" content="court-next other">' in html
    assert "<script>," not in html
