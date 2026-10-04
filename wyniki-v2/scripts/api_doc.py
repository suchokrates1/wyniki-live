"""Write API.md from the routes the app really has.

    python scripts/api_doc.py

A hand-written API document drifted until it described 37 of 198 routes, some of them
long gone. This one is read off Flask's url_map, one line per route, described by the
first line of the view's docstring; test_api_doc.py fails when the file is out of date.
"""
from __future__ import annotations

import inspect
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "API.md"

HEADER = """# HTTP API

Every route the app serves, generated from the code by `python scripts/api_doc.py`.
`test_api_doc.py` fails when this file and the routes disagree, so regenerate it after
adding, removing or renaming a route. A route is described by the first line of its
view's docstring; an empty cell means the view has none yet.

The umpire app's calls are explained in more detail in [UMPIRE_API.md](UMPIRE_API.md).
"""

IGNORED_METHODS = {"HEAD", "OPTIONS"}


def _summary(view) -> str:
    doc = inspect.getdoc(view) or ""
    first = doc.strip().splitlines()[0].strip() if doc.strip() else ""
    return first.replace("|", "\\|")


def render(app) -> str:
    """The whole API.md for this app, grouped by blueprint, sorted by path."""
    sections: dict[str, list[tuple[str, str, str]]] = {}
    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        blueprint = rule.endpoint.rsplit(".", 1)[0] if "." in rule.endpoint else "app"
        methods = ", ".join(sorted(set(rule.methods or ()) - IGNORED_METHODS))
        view = app.view_functions[rule.endpoint]
        sections.setdefault(blueprint, []).append((rule.rule, methods, _summary(view)))

    lines = [HEADER]
    for blueprint in sorted(sections):
        lines.append(f"\n## {blueprint}\n")
        lines.append("| Method | Path | What it does |")
        lines.append("|---|---|---|")
        for path, methods, summary in sorted(sections[blueprint]):
            lines.append(f"| {methods} | `{path}` | {summary} |")
    return "\n".join(lines) + "\n"


def build_app():
    """The app as production builds it, over a throwaway database."""
    sys.path.insert(0, str(ROOT))
    os.environ.setdefault("DATABASE_PATH", os.path.join(tempfile.mkdtemp(), "api-doc.sqlite3"))
    from wyniki.config import settings

    settings.database_path = os.environ["DATABASE_PATH"]
    from app import create_app

    return create_app()


def main() -> None:
    OUTPUT.write_text(render(build_app()), encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
