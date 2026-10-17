"""The public profile plays the recorded name, and a visitor can say the profile is wrong."""
from __future__ import annotations

from wyniki import database
from wyniki.services.name_audio import audio_file


def _ada(app):
    tournament_id = database.insert_tournament("Spring Open", "2026-05-01", "2026-05-02", active=True)
    entry_id = database.insert_player(
        tournament_id, "Ada Nowak", "B1", "PL", first_name="Ada", last_name="Nowak", gender="K",
    )
    entry = next(row for row in database.fetch_players(tournament_id) if row["id"] == entry_id)
    return app.test_client(), entry["global_player_id"], entry_id


def test_the_profile_links_the_name_clip_only_when_the_file_exists(full_app_with_temp_db):
    client, global_id, _entry_id = _ada(full_app_with_temp_db)
    profile = client.get(f"/api/players/{global_id}/profile?global=1").get_json()
    assert profile["player"]["name_audio_url"] == ""
    assert profile["player"]["global_id"] == global_id

    path = audio_file(global_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"ID3" + b"\x00" * 32)

    profile = client.get(f"/api/players/{global_id}/profile?global=1").get_json()
    assert profile["player"]["name_audio_url"].startswith(f"/data/name-audio/{global_id}.mp3?v=")
    assert client.get(f"/data/name-audio/{global_id}.mp3").status_code == 200
    assert client.get("/data/name-audio/999999.mp3").status_code == 404


def test_a_report_is_stored_and_the_desk_can_close_it(full_app_with_temp_db):
    client, global_id, _entry_id = _ada(full_app_with_temp_db)

    saved = client.post("/api/players/reports", json={
        "global_player_id": global_id, "message": "Nazwisko czytane źle",
    })
    assert saved.status_code == 200

    rows = client.get("/admin/api/profile-reports").get_json()
    assert [(row["player_name"], row["message"], row["status"]) for row in rows] == [
        ("Ada Nowak", "Nazwisko czytane źle", "open"),
    ]

    # a bot that fills the hidden field gets the same answer and leaves no row
    assert client.post("/api/players/reports", json={
        "global_player_id": global_id, "message": "kup tanio", "leave_blank": "http://spam",
    }).status_code == 200
    assert len(client.get("/admin/api/profile-reports").get_json()) == 1

    assert client.post("/api/players/reports", json={"global_player_id": global_id, "message": "x"}).status_code == 400
    assert client.post("/api/players/reports", json={"global_player_id": 999999, "message": "źle"}).status_code == 404

    assert client.post(f"/admin/api/profile-reports/{rows[0]['id']}/done").status_code == 200
    assert client.get("/admin/api/profile-reports").get_json() == []
    assert client.post(f"/admin/api/profile-reports/{rows[0]['id']}/done").status_code == 404


def test_five_reports_a_day_is_the_limit(full_app_with_temp_db):
    client, global_id, _entry_id = _ada(full_app_with_temp_db)
    for number in range(5):
        response = client.post("/api/players/reports", json={
            "global_player_id": global_id, "message": f"uwaga {number}",
        })
        assert response.status_code == 200
    assert client.post("/api/players/reports", json={
        "global_player_id": global_id, "message": "szósta uwaga",
    }).status_code == 429
