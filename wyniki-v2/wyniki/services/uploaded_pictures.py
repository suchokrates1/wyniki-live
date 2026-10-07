"""Pictures uploaded through the panels (series and tournament logos), kept next to the database
and served under /data/<folder>/.

Raster pictures only (PNG, JPEG, WebP), checked by their first bytes as well as their name: an SVG
served from our own address could carry a script.
"""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from ..config import settings

ALLOWED = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_BYTES = 2 * 1024 * 1024


def folder_path(folder: str) -> Path:
    return Path(settings.database_path).parent / folder


def read_picture(uploaded_file) -> tuple[bytes | None, str, tuple[dict, int] | None]:
    """(data, extension, None) for a picture we take; (None, '', (error body, status)) otherwise."""
    if not uploaded_file or not uploaded_file.filename:
        return None, "", ({"error": "No file"}, 400)
    extension = Path(uploaded_file.filename).suffix.lower()
    data = uploaded_file.read(MAX_BYTES + 1)
    if extension not in ALLOWED or not data.startswith(ALLOWED[extension]):
        return None, "", ({"error": "PNG, JPEG or WebP only"}, 400)
    if len(data) > MAX_BYTES:
        return None, "", ({"error": "File too large", "max_bytes": MAX_BYTES}, 413)
    return data, ".jpg" if extension == ".jpeg" else extension, None


def store(folder: str, stem: str, data: bytes, extension: str) -> str:
    """Writes the picture under a fresh name and returns its public path."""
    target = folder_path(folder)
    target.mkdir(parents=True, exist_ok=True)
    name = f"{stem}-{uuid4().hex[:8]}{extension}"
    (target / name).write_bytes(data)
    return f"/data/{folder}/{name}"


def drop(folder: str, path: str) -> None:
    """Deletes a picture this folder served; anything else is left alone."""
    prefix = f"/data/{folder}/"
    if path and path.startswith(prefix):
        (folder_path(folder) / Path(path[len(prefix):]).name).unlink(missing_ok=True)


def field_for(variant: str | None) -> str:
    """?variant=dark names the version for a dark background; anything else, the logo itself."""
    return "logo_dark_path" if variant == "dark" else "logo_path"
