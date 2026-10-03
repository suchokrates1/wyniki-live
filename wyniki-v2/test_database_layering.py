"""The app reaches SQLite two ways; each one stays on its own side of the line.

Raw sqlite3 belongs to `wyniki/database/`. ORM writes (add, delete, flush, commit,
rollback) belong to `unit_of_work.py` or `db_models.py`, ORM reads by id to
`orm_rows.py`. A request handler calls those functions and does not hold the
session itself. Mixing both connections inside one function means a write that a
read in the same request does not see.
"""
from __future__ import annotations

import re
from pathlib import Path

PACKAGE = Path(__file__).parent / "wyniki"
# The modules that are allowed to hold the session: one writes, the rest read.
ORM_READ_MODULES = {
    "unit_of_work.py",
    "orm_rows.py",
    "global_player_rows.py",
    "public_profiles.py",
    "e2e_artifacts.py",
}
DATABASE_LAYER = PACKAGE / "database"
RAW_SQLITE = re.compile(r"\bdb_conn\(\)|\bcursor\.execute\(|\bconn\.execute\(")
ORM = re.compile(r"\bdb\.session\b|\b\w+\.query\.")


def _modules_above_the_database_layer():
    return [
        path for path in PACKAGE.rglob("*.py")
        if DATABASE_LAYER not in path.parents and path.parent != DATABASE_LAYER
    ]


def test_raw_sql_stays_in_the_database_layer():
    offenders = [
        path.relative_to(PACKAGE).as_posix()
        for path in _modules_above_the_database_layer()
        if RAW_SQLITE.search(path.read_text(encoding="utf-8"))
    ]
    assert offenders == [], (
        "raw sqlite3 outside wyniki/database: "
        f"{offenders}. Add a named function to the database layer and call that instead."
    )


def test_database_layer_does_not_use_the_orm_session():
    offenders = []
    for path in DATABASE_LAYER.glob("*.py"):
        if path.name in ORM_READ_MODULES:
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if ORM.search(line) and "db_models" not in line:
                offenders.append(f"{path.name}:{number}")
    # unit_of_work.py writes, orm_rows.py and global_player_rows.py read; those three are
    # the only modules allowed to touch the session.
    # brackets.py used to read a match through it while writing through db_conn(); one
    # function reading the same rows down two connections is what this forbids.
    assert offenders == [], f"ORM use inside the database layer: {offenders}"


ORM_WRITE = re.compile(r"\bdb\.session\.(?:add|commit|delete|flush|rollback)\b")
SESSION = re.compile(r"\bdb\.session\b|\b[A-Z]\w*\.query\b")


def test_orm_writes_stay_behind_the_database_layer():
    offenders = []
    for path in PACKAGE.rglob("*.py"):
        if DATABASE_LAYER in path.parents or path == PACKAGE / "db_models.py":
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if ORM_WRITE.search(line):
                offenders.append(f"{path.relative_to(PACKAGE).as_posix()}:{number}")
    assert offenders == [], (
        "db.session add/commit outside wyniki/database and db_models: "
        f"{offenders}. Call add_row, delete_row, flush_writes, commit_writes "
        "or rollback_writes instead."
    )


def test_request_handlers_do_not_hold_the_orm_session():
    """`wyniki/api` asks the database layer for rows; it does not reach for the session.

    A handler holding the session can read a row the layer below has already
    changed, or cache one it is about to. `Model.query` is the same session under
    a shorter name, so it is banned here too; the named functions in orm_rows.py,
    global_player_rows.py, public_profiles.py and e2e_artifacts.py are the door.
    """
    offenders = []
    for path in (PACKAGE / "api").rglob("*.py"):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if SESSION.search(line):
                offenders.append(f"{path.relative_to(PACKAGE).as_posix()}:{number}")
    assert offenders == [], (
        "the ORM session, by either name, inside wyniki/api: "
        f"{offenders}. Model.query is db.session with a shorter spelling; ask the "
        "database layer for the rows instead."
    )
