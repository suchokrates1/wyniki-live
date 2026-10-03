"""New modules stay under 300 lines. Files already past that stay frozen.

The recorded length is today's size. A file on the list fails this test when
it grows or shrinks: raise or lower the number in the same commit, and remove
the file from the list once it is back under 300. A file that is not on the
list fails when it reaches 300 lines.

Translations, stylesheets, tests and the Vite copy under wyniki/static are
outside this rule. The open debt note is vault
notes/areas/vest-media/Dlug-techniczny-plan.md.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).parent
SOURCE_ROOTS = (ROOT / "wyniki", ROOT / "frontend")
SKIP_PARTS = {"node_modules", "dist", "__pycache__", "static", "i18n", "e2e", "e2e-tournament"}
SOURCE_SUFFIXES = {".py", ".js", ".html"}
NEW_MODULE_LIMIT = 300

# Frozen on 2026-10-02. Not a target.
RECORDED_LINES = {
    "wyniki/database/brackets.py": 2175,
    "frontend/admin.html": 1057,
    "wyniki/api/umpire_api.py": 1896,
    "wyniki/database/schedule.py": 1736,
    "frontend/index.html": 1712,
    "frontend/office.html": 1650,
    "frontend/src/umpire/app.js": 1641,
    "frontend/src/admin/tournaments.js": 928,
    "wyniki/api/admin_tournaments.py": 1423,
    "frontend/src/admin/overlay.js": 1293,
    "frontend/src/modules/office/playersView.js": 1183,
    "wyniki/api/office.py": 1097,
    "frontend/src/modules/office/autoScheduleView.js": 908,
    "wyniki/services/office_workflow.py": 889,
    "wyniki/database/connection.py": 825,
    "frontend/src/overlay.js": 810,
    "wyniki/services/director_commands.py": 688,
    "frontend/umpire.html": 667,
    "frontend/src/modules/office/matchesView.js": 643,
    "frontend/src/umpire/match-engine/models.js": 634,
    "wyniki/services/auto_scheduler.py": 605,
    "wyniki/api/admin_global_players.py": 592,
    "frontend/src/modules/office/coreView.js": 572,
    "wyniki/services/court_manager.py": 570,
    "frontend/src/admin/courts.js": 313,
    "frontend/src/modules/office/drawsView.js": 476,
    "wyniki/database/categories.py": 463,
    "wyniki/api/player_import.py": 463,
    "wyniki/database/tournaments.py": 445,
    "frontend/src/modules/office/scheduleView.js": 434,
    "wyniki/db_models.py": 433,
    "wyniki/api/admin.py": 429,
    "frontend/src/shared/categories.js": 427,
    "frontend/src/modules/bracket.js": 388,
    "wyniki/services/draw_builder.py": 375,
    "wyniki/database/knockout_formats.py": 367,
    "wyniki/database/classifications.py": 351,
    "wyniki/services/panic.py": 369,
    "frontend/src/modules/liveCourtView.js": 341,
    "frontend/src/main.js": 337,
    "frontend/src/modules/pwaShellView.js": 332,
    "wyniki/database/players.py": 330,
    "frontend/src/admin/officeTab.js": 330,
    "wyniki/services/overlay_settings.py": 326,
    "frontend/src/modules/bracketView.js": 323,
    "wyniki/database/court_streams.py": 320,
    "frontend/src/admin/globalPlayers.js": 319,
    "frontend/src/umpire/match/matchController.js": 318,
    "frontend/src/shared/tvScoreboard.js": 301,
}


def _line_count(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def _source_files():
    for root in SOURCE_ROOTS:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            if SKIP_PARTS.intersection(path.parts):
                continue
            if path.name.endswith((".test.js", ".spec.js")) or path.name == "i18n.js":
                continue
            yield path.relative_to(ROOT).as_posix(), path


def test_recorded_modules_stay_at_their_recorded_length():
    mismatches = []
    for relative, recorded in RECORDED_LINES.items():
        actual = _line_count(ROOT / relative)
        if actual != recorded:
            mismatches.append(f"{relative} has {actual} lines; the recorded length is {recorded}")
    assert mismatches == [], (
        "A recorded module changed length. Set the recorded length to the real one, "
        "and drop the file from the list once it is under 300. "
        + " ".join(mismatches)
    )


def test_a_new_module_stays_under_300_lines():
    oversized = [
        f"{relative} has {_line_count(path)} lines"
        for relative, path in _source_files()
        if relative not in RECORDED_LINES and _line_count(path) >= NEW_MODULE_LIMIT
    ]
    assert oversized == [], (
        f"A module reached {NEW_MODULE_LIMIT} lines. "
        "Split it. "
        + " ".join(oversized)
    )
