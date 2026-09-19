"""Stream URLs per tournament day and court.

The public live board uses today's URL (Europe/Warsaw) for that court, so the
play link on the court name swaps itself when the calendar day changes.
"""
from __future__ import annotations

import threading
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from ..config import logger
from .connection import _utc_now, db_conn
from .courts import fetch_courts_for_tournament
from .tournaments import fetch_tournament

WARSAW = ZoneInfo("Europe/Warsaw")
ALL_COURTS_ID = "__all__"
NO_STREAM_URL = "__none__"
MAX_DAYS = 21
MAX_URL_LEN = 500

_CACHE_LOCK = threading.Lock()
_TODAY_URLS: Dict[str, Any] = {"day": None, "urls": {}}


class StreamUrlError(ValueError):
    """One or more cells have a URL that is not http(s)."""

    def __init__(self, cells: Optional[List[Dict[str, str]]] = None):
        super().__init__("invalid_url")
        self.cells = list(cells or [])


def ensure_court_stream_tables(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tournament_court_streams (
            tournament_id INTEGER NOT NULL,
            kort_id TEXT NOT NULL,
            stream_date TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tournament_id, kort_id, stream_date),
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
        )
    """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_court_streams_date "
        "ON tournament_court_streams(stream_date)"
    )


def invalidate_watch_url_cache() -> None:
    with _CACHE_LOCK:
        _TODAY_URLS["day"] = None
        _TODAY_URLS["urls"] = {}


def today_warsaw(now: Optional[datetime] = None) -> str:
    stamp = now or datetime.now(WARSAW)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=WARSAW)
    return stamp.astimezone(WARSAW).date().isoformat()


def parse_iso_date(raw: Any) -> Optional[date]:
    text = str(raw or "").strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def tournament_days(start_raw: Any, end_raw: Any, *, max_days: int = MAX_DAYS) -> List[str]:
    start = parse_iso_date(start_raw)
    end = parse_iso_date(end_raw) or start
    if start is None:
        return []
    if end < start:
        start, end = end, start
    days: List[str] = []
    cursor = start
    while cursor <= end and len(days) < max_days:
        days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return days


def normalize_stream_url(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    if len(text) > MAX_URL_LEN:
        raise StreamUrlError()
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise StreamUrlError()
    if parsed.username or parsed.password:
        raise StreamUrlError()
    return text


def _court_payload(courts: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [
        {
            "kort_id": str(court.get("kort_id") or ""),
            "name": str(court.get("name") or court.get("kort_id") or ""),
        }
        for court in courts
        if court.get("kort_id")
    ]


def get_tournament_court_streams(tournament_id: int) -> Dict[str, Any]:
    tournament = fetch_tournament(tournament_id) or {}
    courts = fetch_courts_for_tournament(tournament_id)
    court_ids = [str(court["kort_id"]) for court in courts if court.get("kort_id")]
    days = tournament_days(tournament.get("start_date"), tournament.get("end_date"))
    links: Dict[str, Dict[str, str]] = {day: {cid: "" for cid in court_ids} for day in days}
    shared: Dict[str, str] = {}
    off_courts: set[str] = set()

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT kort_id, stream_date, url
                FROM tournament_court_streams
                WHERE tournament_id = ?
                """,
                (int(tournament_id),),
            )
            for row in cursor.fetchall():
                day = str(row["stream_date"] or "")
                kort_id = str(row["kort_id"] or "")
                url = str(row["url"] or "").strip()
                if not day or not kort_id:
                    continue
                if day not in links:
                    links[day] = {cid: "" for cid in court_ids}
                if kort_id == ALL_COURTS_ID:
                    shared[day] = url
                    continue
                if kort_id not in court_ids:
                    continue
                if url == NO_STREAM_URL:
                    off_courts.add(kort_id)
                    continue
                links[day][kort_id] = url
    except Exception as exc:
        logger.error("get_tournament_court_streams_error", error=str(exc), tournament_id=tournament_id)

    ordered_days = list(days)
    extras = sorted(day for day in set(links) | set(shared) if day not in days)
    ordered_days.extend(extras)
    return {
        "days": ordered_days,
        "today": today_warsaw(),
        "courts": _court_payload(courts),
        "links": {day: links.get(day, {cid: "" for cid in court_ids}) for day in ordered_days},
        "shared": {day: shared.get(day, "") for day in ordered_days},
        "shared_all_courts": any(bool(shared.get(day)) for day in ordered_days),
        "off_courts": [cid for cid in court_ids if cid in off_courts],
    }


def save_tournament_court_streams(tournament_id: int, payload: Any) -> Dict[str, Any]:
    incoming = payload.get("links") if isinstance(payload, dict) else None
    if incoming is None and isinstance(payload, dict) and "shared" not in payload:
        incoming = payload
    if not isinstance(incoming, dict):
        incoming = {}
    shared_incoming = payload.get("shared") if isinstance(payload, dict) else None
    if not isinstance(shared_incoming, dict):
        shared_incoming = {}
    shared_mode = bool(payload.get("shared_all_courts")) if isinstance(payload, dict) else False

    tournament = fetch_tournament(tournament_id) or {}
    courts = fetch_courts_for_tournament(tournament_id)
    court_ids = {str(court["kort_id"]) for court in courts if court.get("kort_id")}
    allowed_days = set(tournament_days(tournament.get("start_date"), tournament.get("end_date")))
    rows: List[tuple] = []
    errors: List[Dict[str, str]] = []

    def _append_row(kid: str, day_key: str, url_raw: Any) -> None:
        try:
            url = normalize_stream_url(url_raw)
        except StreamUrlError:
            errors.append({"day": day_key, "kort_id": kid})
            return
        if url:
            rows.append((int(tournament_id), kid, day_key, url, _utc_now()))

    off_raw = payload.get("off_courts") if isinstance(payload, dict) else None
    off_courts = {
        str(kid)
        for kid in (off_raw or [])
        if str(kid) in court_ids
    }

    if shared_mode:
        shared_days: List[str] = []
        for day_raw, url_raw in shared_incoming.items():
            day = parse_iso_date(day_raw)
            if day is None:
                continue
            day_key = day.isoformat()
            if allowed_days and day_key not in allowed_days:
                continue
            _append_row(ALL_COURTS_ID, day_key, url_raw)
            shared_days.append(day_key)
        for kid in off_courts:
            for day_key in shared_days or sorted(allowed_days):
                rows.append((int(tournament_id), kid, day_key, NO_STREAM_URL, _utc_now()))
    else:
        for day_raw, cell in incoming.items():
            day = parse_iso_date(day_raw)
            if day is None or not isinstance(cell, dict):
                continue
            day_key = day.isoformat()
            if allowed_days and day_key not in allowed_days:
                continue
            for kort_id, url_raw in cell.items():
                kid = str(kort_id)
                if kid not in court_ids:
                    continue
                _append_row(kid, day_key, url_raw)

    if errors:
        raise StreamUrlError(errors)

    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM tournament_court_streams WHERE tournament_id = ?",
            (int(tournament_id),),
        )
        cursor.executemany(
            """
            INSERT INTO tournament_court_streams
                (tournament_id, kort_id, stream_date, url, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()

    invalidate_watch_url_cache()
    logger.info(
        "tournament_court_streams_saved",
        tournament_id=int(tournament_id),
        links=len(rows),
    )
    return get_tournament_court_streams(tournament_id)


def fetch_watch_urls_for_date(day: Optional[str] = None) -> Dict[str, str]:
    target = day or today_warsaw()
    use_cache = day is None
    if use_cache:
        with _CACHE_LOCK:
            if _TODAY_URLS["day"] == target:
                return dict(_TODAY_URLS["urls"])

    urls: Dict[str, str] = {}
    shared_by_tournament: Dict[int, str] = {}
    off_courts: set[str] = set()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT tournament_id, kort_id, url
                FROM tournament_court_streams
                WHERE stream_date = ? AND TRIM(COALESCE(url, '')) != ''
                """,
                (target,),
            )
            for row in cursor.fetchall():
                kid = str(row["kort_id"] or "")
                url = str(row["url"] or "").strip()
                if not kid or not url:
                    continue
                if kid == ALL_COURTS_ID:
                    try:
                        shared_by_tournament[int(row["tournament_id"])] = url
                    except (TypeError, ValueError):
                        continue
                    continue
                if url == NO_STREAM_URL:
                    off_courts.add(kid)
                    continue
                urls[kid] = url
        for tournament_id, url in shared_by_tournament.items():
            for court in fetch_courts_for_tournament(tournament_id):
                kid = str(court.get("kort_id") or "")
                if kid and kid not in urls and kid not in off_courts:
                    urls[kid] = url
    except Exception as exc:
        logger.error("fetch_watch_urls_error", error=str(exc), day=target)
        return {}

    if use_cache:
        with _CACHE_LOCK:
            _TODAY_URLS["day"] = target
            _TODAY_URLS["urls"] = dict(urls)
    return urls


def attach_watch_url(kort_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    public = dict(state) if state else {}
    url = fetch_watch_urls_for_date().get(str(kort_id))
    if url:
        public["watch_url"] = url
    else:
        public.pop("watch_url", None)
    return public
