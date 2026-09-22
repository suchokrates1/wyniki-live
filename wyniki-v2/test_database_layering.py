"""The app reaches SQLite two ways; each one stays on its own side of the line.

Raw sqlite3 belongs to `wyniki/database/`, SQLAlchemy to the API and services above it.
Mixing them in one module means two connections, two transactions and a write that a
read in the same request does not see.
"""
from __future__ import annotations

import re
from pathlib import Path

PACKAGE = Path(__file__).parent / "wyniki"
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
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if ORM.search(line) and "db_models" not in line:
                offenders.append(f"{path.name}:{number}")
    # brackets.py still writes two Match rows through the ORM; nothing new may join it.
    assert len(offenders) <= 2, f"new ORM use inside the database layer: {offenders}"
