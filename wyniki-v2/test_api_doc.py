"""API.md is generated from the routes, and this keeps it that way."""
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).parent


def _api_doc():
    spec = importlib.util.spec_from_file_location("api_doc", ROOT / "scripts" / "api_doc.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_api_md_lists_exactly_the_routes_the_app_has(full_app_with_temp_db):
    expected = _api_doc().render(full_app_with_temp_db)
    actual = (ROOT / "API.md").read_text(encoding="utf-8")
    assert actual == expected, "API.md is out of date: run `python scripts/api_doc.py` and commit the result"
