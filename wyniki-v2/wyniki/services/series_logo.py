"""A series' logo, served under /data/series-logos/.

Two versions: the logo itself (dark ink, for a light page) and, if the series has one, its version
for a dark background (light ink). The page picks the one that reads on its theme.
"""
from __future__ import annotations

from ..database import series
from .uploaded_pictures import drop, field_for, read_picture, store

FOLDER = "series-logos"

__all__ = ["field_for", "remove", "save"]


def save(series_id: int, slug: str, uploaded_file, field: str = "logo_path") -> tuple[dict, int]:
    """Stores the uploaded picture as that version of the series' logo; the old one goes."""
    data, extension, error = read_picture(uploaded_file)
    if error or data is None:
        return error or ({"error": "No file"}, 400)
    stem = f"{slug or 'series'}{'-dark' if field == 'logo_dark_path' else ''}"
    path = store(FOLDER, stem, data, extension)
    drop(FOLDER, series.set_logo(series_id, path, field))
    return {field: path}, 200


def remove(series_id: int, field: str = "logo_path") -> dict:
    drop(FOLDER, series.set_logo(series_id, "", field))
    return {field: ""}
