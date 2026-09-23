"""The only ORM write door.

Request handlers change rows, then call these functions. They do not call
db.session.add or db.session.commit, and they do not paste SQL. Raw sqlite3
stays in the other modules of this package and is not used here, so one
function does not open a second connection beside the session.
"""
from __future__ import annotations

from ..db_models import db


def add_row(instance):
    db.session.add(instance)
    return instance


def delete_row(instance) -> None:
    db.session.delete(instance)


def flush_writes() -> None:
    db.session.flush()


def commit_writes() -> None:
    db.session.commit()


def rollback_writes() -> None:
    db.session.rollback()
