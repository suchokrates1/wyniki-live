"""Restore in-memory overlay courts from a dumped /api/snapshot file."""
import json
import os
import time

from wyniki.services.court_manager import (
    COURTS,
    STATE_LOCK,
    _empty_court_state,
    restore_courts_from_snapshot,
    restore_overlay_snapshot_file,
)


def setup_function():
    with STATE_LOCK:
        COURTS.clear()


def test_restore_puts_live_score_back_over_empty_identity():
    with STATE_LOCK:
        COURTS["t31-3"] = _empty_court_state()
        COURTS["t31-3"]["court_name"] = "3"
        COURTS["t31-3"]["display_order"] = 3
        COURTS["t31-3"]["tournament_id"] = 31

    restore_courts_from_snapshot({
        "t31-3": {
            "court_name": "3",
            "display_order": 3,
            "tournament_id": 31,
            "A": {"full_name": "Grace Hobbs", "set1": 0, "current_games": 0},
            "B": {"full_name": "Marguerite Quinn", "set1": 0, "current_games": 0},
            "match_status": {"active": True},
            "umpire_screen": "Match:BASIC_SCORING",
        },
        "unknown-court": {"A": {"full_name": "Ghost"}},
    })

    live = COURTS["t31-3"]
    assert live["A"]["full_name"] == "Grace Hobbs"
    assert live["B"]["full_name"] == "Marguerite Quinn"
    assert live["match_status"]["active"] is True
    assert "unknown-court" not in COURTS


def test_restore_keeps_db_identity_when_snapshot_omits_it():
    with STATE_LOCK:
        COURTS["t31-9"] = _empty_court_state()
        COURTS["t31-9"]["court_name"] = "9"
        COURTS["t31-9"]["display_order"] = 6
        COURTS["t31-9"]["tournament_id"] = 31

    restore_courts_from_snapshot({
        "t31-9": {
            "A": {"full_name": "Vaida Litinskaitė", "set1": 1},
            "B": {"full_name": "Živilė Karoblienė", "set1": 3},
            "match_status": {"active": True},
        }
    })

    live = COURTS["t31-9"]
    assert live["court_name"] == "9"
    assert live["display_order"] == 6
    assert live["tournament_id"] == 31
    assert live["A"]["full_name"] == "Vaida Litinskaitė"


def test_restore_file_is_consumed_and_ignored_when_stale(tmp_path):
    with STATE_LOCK:
        COURTS["t31-16"] = _empty_court_state()
        COURTS["t31-16"]["court_name"] = "17"

    snapshot = tmp_path / "overlay_snapshot.json"
    snapshot.write_text(json.dumps({
        "courts": {
            "t31-16": {
                "court_name": "17",
                "A": {"full_name": "Bianka Graeming"},
                "B": {"full_name": "Mariarosa Scotton"},
                "match_status": {"active": True},
            }
        }
    }), encoding="utf-8")

    restored = restore_overlay_snapshot_file(snapshot, max_age_seconds=60)
    assert restored == 1
    assert COURTS["t31-16"]["A"]["full_name"] == "Bianka Graeming"
    assert snapshot.exists() is False
    assert (tmp_path / "overlay_snapshot.json.applied").exists()

    COURTS["t31-16"]["A"]["full_name"] = "cleared"
    stale = tmp_path / "overlay_snapshot.json"
    stale.write_text(json.dumps({
        "courts": {
            "t31-16": {
                "A": {"full_name": "should-not-apply"},
                "match_status": {"active": True},
            }
        }
    }), encoding="utf-8")
    past = time.time() - 10_000
    os.utime(stale, (past, past))
    assert restore_overlay_snapshot_file(stale, max_age_seconds=60) == 0
    assert COURTS["t31-16"]["A"]["full_name"] == "cleared"
