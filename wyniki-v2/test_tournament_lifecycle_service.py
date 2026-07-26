"""Unit tests for wyniki.services.tournament_lifecycle (no UI)."""
from __future__ import annotations

from datetime import date

import pytest


@pytest.fixture()
def database(tmp_path, monkeypatch):
    db_path = tmp_path / "lifecycle.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database as db

    db.init_db()
    return db


def test_lifecycle_groups_schedule_ko_snapshot(database):
    from wyniki.services import tournament_lifecycle as life

    tid = database.insert_tournament(
        name="Lifecycle Cup",
        start_date=str(date.today()),
        end_date=str(date.today()),
        active=True,
        city="E2E",
        country="PL",
        is_simulation=True,
    )
    assert tid

    pids = []
    for i in range(4):
        pid = database.insert_player(
            tournament_id=tid,
            name=f"P{i} L{i}",
            first_name=f"P{i}",
            last_name=f"L{i}",
            category="B1",
            country="PL",
            gender="M",
        )
        assert pid
        pids.append(int(pid))

    assert database.save_bracket_groups(
        tid,
        [{"name": "B1 — Grupa A", "players": pids}],
    )

    seeded = life.seed_group_schedule(tid)
    assert seeded["tournament_id"] == tid
    assert seeded["groups"] >= 1
    assert int(seeded["schedule_entries"] or 0) >= 1 or isinstance(seeded["schedule_entries"], list)

    snap = life.lifecycle_snapshot(tid)
    assert snap["group_count"] >= 1

    ko = life.seed_knockout_schedule(tid)
    assert ko["tournament_id"] == tid
