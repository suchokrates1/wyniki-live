"""The schema is built by hand-written DDL and read through two layers; they must agree.

init_db() creates tables and patches older databases with ALTERs in the same pass, while
SQLAlchemy models describe the same tables for the ORM half of the app. A column added on
one side only is invisible until a request touches it during a tournament.
"""
from __future__ import annotations

import sqlite3

import pytest


@pytest.fixture()
def database(tmp_path, monkeypatch):
    from wyniki.config import settings

    db_path = tmp_path / "schema.sqlite3"
    monkeypatch.setattr(settings, "database_path", str(db_path))
    from wyniki import database as db

    db.init_db()
    return db_path


def _schema(db_path) -> dict[str, set[str]]:
    connection = sqlite3.connect(str(db_path))
    try:
        tables = [
            row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        return {
            table: {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            for table in tables
        }
    finally:
        connection.close()


def test_init_db_can_run_again_without_changing_the_schema(database):
    from wyniki import database as db

    before = _schema(database)
    db.init_db()
    assert _schema(database) == before


def test_one_shot_migrations_are_recorded_and_not_repeated(database):
    from wyniki import database as db

    connection = sqlite3.connect(str(database))
    try:
        applied = {row[0] for row in connection.execute("SELECT name FROM schema_migrations")}
    finally:
        connection.close()
    assert {"clear_default_schedule_notes", "normalize_genders"} <= applied

    db.init_db()
    connection = sqlite3.connect(str(database))
    try:
        rows = connection.execute(
            "SELECT name, COUNT(*) FROM schema_migrations GROUP BY name HAVING COUNT(*) > 1"
        ).fetchall()
    finally:
        connection.close()
    assert rows == []


def test_orm_models_match_the_tables_init_db_creates(database):
    from wyniki.db_models import db as sqlalchemy_db

    schema = _schema(database)
    missing = []
    for table in sqlalchemy_db.Model.metadata.sorted_tables:
        if table.name not in schema:
            missing.append(f"table {table.name}")
            continue
        for column in table.columns:
            if column.name not in schema[table.name]:
                missing.append(f"{table.name}.{column.name}")
    assert missing == [], (
        "SQLAlchemy models describe columns the hand-written schema does not create: "
        f"{missing}"
    )
