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
    "wyniki/database/brackets.py": 2184,
    "wyniki/api/umpire_api.py": 1886,
    "wyniki/database/schedule.py": 1715,
    "frontend/index.html": 1306,
    "frontend/office.html": 1647,
    "frontend/src/umpire/app.js": 1642,
    "wyniki/api/admin_tournaments.py": 683,
    "frontend/src/admin/overlay.js": 1293,
    "frontend/src/modules/office/playersView.js": 1135,
    "wyniki/api/office.py": 1034,
    "frontend/src/modules/office/autoScheduleView.js": 876,
    "wyniki/services/office_workflow.py": 889,
    "wyniki/database/connection.py": 826,
    "frontend/src/overlay.js": 547,
    "wyniki/services/director_commands.py": 688,
    "frontend/umpire.html": 664,
    "frontend/src/modules/office/matchesView.js": 618,
    "frontend/src/umpire/match-engine/models.js": 634,
    "wyniki/services/auto_scheduler.py": 582,
    "wyniki/api/admin_global_players.py": 379,
    "frontend/src/modules/office/coreView.js": 563,
    "wyniki/services/court_manager.py": 572,
    "frontend/src/admin/courts.js": 313,
    "frontend/src/modules/office/drawsView.js": 465,
    "wyniki/database/categories.py": 467,
    "wyniki/api/player_import.py": 463,
    "wyniki/database/tournaments.py": 445,
    "frontend/src/modules/office/scheduleView.js": 399,
    "wyniki/db_models.py": 433,
    "wyniki/api/admin.py": 394,
    "frontend/src/shared/categories.js": 427,
    "frontend/src/modules/bracket.js": 376,
    "wyniki/services/draw_builder.py": 376,
    "wyniki/database/knockout_formats.py": 367,
    "wyniki/database/classifications.py": 339,
    "wyniki/services/panic.py": 369,
    "frontend/src/modules/liveCourtView.js": 341,
    "frontend/src/main.js": 346,
    "frontend/src/modules/pwaShellView.js": 332,
    "wyniki/database/players.py": 314,
    "wyniki/services/overlay_settings.py": 326,
    "wyniki/database/court_streams.py": 310,
    "frontend/src/admin/globalPlayers.js": 319,
    "frontend/src/umpire/match/matchController.js": 318,
    "frontend/src/shared/tvScoreboard.js": 336,
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
