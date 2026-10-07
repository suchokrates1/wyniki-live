"""A series' logo: one picture per series, kept next to the database and served under /data/series-logos/.

Raster pictures only (PNG, JPEG, WebP): an SVG served from our own address could carry a script.
"""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from ..config import settings
from ..database import series

ALLOWED = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_BYTES = 2 * 1024 * 1024
FOLDER = "series-logos"


def logos_dir() -> Path:
    return Path(settings.database_path).parent / FOLDER


def _drop(path: str) -> None:
    prefix = f"/data/{FOLDER}/"
    if path.startswith(prefix):
        (logos_dir() / Path(path[len(prefix):]).name).unlink(missing_ok=True)


def save(series_id: int, slug: str, uploaded_file) -> tuple[dict, int]:
    """Stores the uploaded picture as the series' logo; the old one goes."""
    if not uploaded_file or not uploaded_file.filename:
        return {"error": "No file"}, 400
    extension = Path(uploaded_file.filename).suffix.lower()
    data = uploaded_file.read(MAX_BYTES + 1)
    if extension not in ALLOWED or not data.startswith(ALLOWED[extension]):
        return {"error": "PNG, JPEG or WebP only"}, 400
    if len(data) > MAX_BYTES:
        return {"error": "File too large", "max_bytes": MAX_BYTES}, 413
    folder = logos_dir()
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{slug or 'series'}-{uuid4().hex[:8]}{'.jpg' if extension == '.jpeg' else extension}"
    (folder / name).write_bytes(data)
    path = f"/data/{FOLDER}/{name}"
    _drop(series.set_logo(series_id, path))
    return {"logo_path": path}, 200


def remove(series_id: int) -> dict:
    _drop(series.set_logo(series_id, ""))
    return {"logo_path": ""}
