"""A series' logo: kept next to the database and served under /data/series-logos/.

Two versions: the logo itself (dark ink, for a light page) and, if the series has one, its version
for a dark background (light ink). The page picks the one that reads on its theme.

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


def field_for(variant: str | None) -> str:
    """?variant=dark names the version for a dark background; anything else, the logo itself."""
    return "logo_dark_path" if variant == "dark" else "logo_path"


def save(series_id: int, slug: str, uploaded_file, field: str = "logo_path") -> tuple[dict, int]:
    """Stores the uploaded picture as that version of the series' logo; the old one goes."""
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
    name = f"{slug or 'series'}{'-dark' if field == 'logo_dark_path' else ''}-{uuid4().hex[:8]}{'.jpg' if extension == '.jpeg' else extension}"
    (folder / name).write_bytes(data)
    path = f"/data/{FOLDER}/{name}"
    _drop(series.set_logo(series_id, path, field))
    return {field: path}, 200


def remove(series_id: int, field: str = "logo_path") -> dict:
    _drop(series.set_logo(series_id, "", field))
    return {field: ""}
