"""The clip a player hears on their public profile: how the lector says their name.

Files live next to the database, one mp3 per global player: /data/name-audio/<id>.mp3.
The public page only offers the button when that file is there.
"""
from __future__ import annotations

from pathlib import Path

from ..config import settings


def spoken_line(full_name: str) -> str:
    """The same sentence the recorder speaks and the player is asked to check."""
    name = " ".join((full_name or "").split())
    if not name:
        return ""
    return f"{name}, serwuje."


def audio_file(global_id: int) -> Path:
    return Path(settings.database_path).parent / "name-audio" / f"{int(global_id)}.mp3"


def public_url(global_id: int | None) -> str:
    """Empty when this person has no clip yet. The mtime keeps a re-record from staying cached."""
    if not global_id:
        return ""
    path = audio_file(global_id)
    if not path.is_file():
        return ""
    return f"/data/name-audio/{int(global_id)}.mp3?v={int(path.stat().st_mtime)}"
