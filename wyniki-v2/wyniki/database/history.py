"""Database access layer submodule."""
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..config import logger
from ..services.match_result import plausible_duration

from .connection import db_conn, website_visible_sql


def _seconds_between(start: Any, end: Any) -> Optional[int]:
    try:
        started = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        ended = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if ended.tzinfo is None:
        ended = ended.replace(tzinfo=timezone.utc)
    return int((ended - started).total_seconds())


def _history_timing(stored_seconds: Any, tablet_seconds: Any, started_at: Any,
                    created_at: Any, ended_ts: Any) -> tuple[int, Optional[str]]:
    """Duration and start of a finished match, from the most trustworthy source.

    The umpire's own clock (match statistics) wins. The stored value came from the
    overlay clock, which before September 2026 kept running between matches, so it is
    only used when plausible. The start is the tablet's start time; without it, the end
    minus the umpire's duration beats the row's creation time, which lags the first ball.
    """
    tablet = plausible_duration(tablet_seconds)
    duration = tablet or plausible_duration(stored_seconds)
    if duration is None and started_at:
        duration = plausible_duration(_seconds_between(started_at, ended_ts))
    start = started_at
    if not start and tablet and ended_ts:
        try:
            ended = datetime.fromisoformat(str(ended_ts).replace("Z", "+00:00"))
            if ended.tzinfo is None:
                ended = ended.replace(tzinfo=timezone.utc)
            derived = datetime.fromtimestamp(ended.timestamp() - tablet, tz=timezone.utc).isoformat()
            # A backfilled end time moves the derived start past the row's creation: distrust it.
            lead = _seconds_between(derived, created_at) if created_at else None
            if lead is not None and 0 <= lead <= 1800:
                start = derived
        except (TypeError, ValueError):
            start = None
    return duration or 0, start or created_at

def insert_match_history(entry: Dict[str, Any]) -> None:
    """Insert a match history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            values = (
                entry.get("kort_id"),
                entry.get("ended_ts"),
                entry.get("duration_seconds", 0),
                entry.get("player_a"),
                entry.get("player_b"),
                json.dumps(entry.get("score_a", [])),
                json.dumps(entry.get("score_b", [])),
                entry.get("category"),
                entry.get("phase", "Grupowa"),
                entry.get("match_id"),
                entry.get("stats_mode"),
                json.dumps(entry.get("sets_history")) if entry.get("sets_history") else None,
                entry.get("tournament_id"),
                entry.get("finish_reason", "normal"),
                entry.get("winner_name"),
                entry.get("injured_player_name"),
                entry.get("result_note"),
            )
            existing_id = None
            if entry.get("match_id"):
                cursor.execute(
                    "SELECT id FROM match_history WHERE match_id = ? LIMIT 1",
                    (entry.get("match_id"),),
                )
                existing = cursor.fetchone()
                existing_id = existing["id"] if existing else None
            if existing_id:
                cursor.execute("""
                    UPDATE match_history
                    SET kort_id = ?, ended_ts = ?, duration_seconds = ?,
                        player_a = ?, player_b = ?, score_a = ?, score_b = ?,
                        category = ?, phase = ?, match_id = ?, stats_mode = ?, sets_history = ?,
                        tournament_id = ?, finish_reason = ?, winner_name = ?,
                        injured_player_name = ?, result_note = ?
                    WHERE id = ?
                """, (*values, existing_id))
            else:
                cursor.execute("""
                    INSERT INTO match_history (
                        kort_id, ended_ts, duration_seconds,
                        player_a, player_b, score_a, score_b,
                        category, phase, match_id, stats_mode, sets_history,
                        tournament_id, finish_reason, winner_name, injured_player_name, result_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, values)
            conn.commit()
        logger.info("match_history_inserted", kort_id=entry.get("kort_id"))
    except Exception as e:
        logger.error("insert_match_history_error", error=str(e), entry=entry)

def delete_latest_history_entry() -> Optional[Dict]:
    """Delete the most recent history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            
            # Get latest entry
            cursor.execute("""
                SELECT * FROM match_history
                ORDER BY id DESC
                LIMIT 1
            """)
            row = cursor.fetchone()
            
            if not row:
                return None
            
            deleted = dict(row)
            
            # Delete it
            cursor.execute("DELETE FROM match_history WHERE id = ?", (row["id"],))
            conn.commit()
            
        logger.info("history_entry_deleted", id=deleted["id"])
        return deleted
    except Exception as e:
        logger.error("delete_history_entry_error", error=str(e))
        return None

def fetch_match_history(
    limit: int = 100,
    tournament_id: Optional[int] = None,
    public_only: bool = False,
    stats_enabled_only: bool = False,
    offset: int = 0,
) -> List[Dict]:
    """Fetch match history from database, enriched with full names."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            conditions = []
            params: List[Any] = []
            if tournament_id is not None:
                conditions.append("mh.tournament_id = ?")
                params.append(tournament_id)
            if public_only:
                conditions.append(f"(mh.tournament_id IS NULL OR ({website_visible_sql('t')}))")
            if stats_enabled_only:
                conditions.append("(mh.tournament_id IS NULL OR COALESCE(t.stats_enabled, 1) = 1)")

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            cursor.execute(f"""
                SELECT mh.* FROM match_history mh
                LEFT JOIN tournaments t ON t.id = mh.tournament_id
                {where_clause}
                ORDER BY mh.ended_ts DESC, mh.id DESC
                LIMIT ? OFFSET ?
            """, (*params, limit, max(0, int(offset or 0))))
            rows = cursor.fetchall()
            
            # Detect available columns
            col_names = [desc[0] for desc in cursor.description] if cursor.description else []

            # Build lookup: match_id -> (player1_name, player2_name, created_at)
            match_ids = [r["match_id"] for r in rows if "match_id" in col_names and r["match_id"]]
            match_lookup: Dict[int, Dict] = {}
            duration_lookup: Dict[int, int] = {}
            if match_ids:
                placeholders = ",".join("?" for _ in match_ids)
                cursor.execute(
                    f"SELECT id, player1_name, player2_name, created_at, started_at FROM matches WHERE id IN ({placeholders})",
                    match_ids,
                )
                for mr in cursor.fetchall():
                    match_lookup[mr["id"]] = {
                        "p1": mr["player1_name"],
                        "p2": mr["player2_name"],
                        "started_at": mr["started_at"],
                        "created_at": mr["created_at"],
                    }
                # Fetch duration from match_statistics for entries with duration=0
                cursor.execute(
                    f"SELECT match_id, match_duration_ms FROM match_statistics WHERE match_id IN ({placeholders})",
                    match_ids,
                )
                for sr in cursor.fetchall():
                    if sr["match_duration_ms"]:
                        duration_lookup[sr["match_id"]] = sr["match_duration_ms"] // 1000

            # Build lookup: last_name -> full_name from players table
            cursor.execute("SELECT first_name, last_name, name FROM players")
            player_name_map: Dict[str, str] = {}
            for pr in cursor.fetchall():
                fn = (pr["first_name"] or "").strip()
                ln = (pr["last_name"] or "").strip()
                full = f"{fn} {ln}".strip() if fn else (pr["name"] or ln)
                if ln:
                    player_name_map[ln] = full

            cursor.execute("""
                SELECT c.kort_id, c.name, t.name AS tournament_name
                FROM courts c
                LEFT JOIN tournaments t ON t.id = c.tournament_id
            """)
            court_lookup = {
                row["kort_id"]: {
                    "court_name": row["name"] or row["kort_id"],
                    "tournament_name": row["tournament_name"],
                }
                for row in cursor.fetchall()
            }

            result = []
            for row in rows:
                entry = {
                    "id": row["id"],
                    "kort_id": row["kort_id"],
                    "ended_ts": row["ended_ts"],
                    "duration_seconds": row["duration_seconds"],
                    "player_a": row["player_a"],
                    "player_b": row["player_b"],
                    "category": row["category"] if "category" in col_names else None,
                    "phase": row["phase"] if "phase" in col_names else "Grupowa",
                    "finish_reason": row["finish_reason"] if "finish_reason" in col_names else "normal",
                    "winner_name": row["winner_name"] if "winner_name" in col_names else None,
                    "injured_player_name": row["injured_player_name"] if "injured_player_name" in col_names else None,
                    "result_note": row["result_note"] if "result_note" in col_names else None,
                }
                
                # Read scores - prefer score_a/score_b JSON, fall back to old per-set columns
                if "score_a" in col_names and row["score_a"]:
                    entry["score_a"] = json.loads(row["score_a"])
                    entry["score_b"] = json.loads(row["score_b"]) if row["score_b"] else []
                elif "set1_a" in col_names:
                    entry["score_a"] = [row["set1_a"] or 0, row["set2_a"] or 0, row["tie_a"] or 0]
                    entry["score_b"] = [row["set1_b"] or 0, row["set2_b"] or 0, row["tie_b"] or 0]
                else:
                    entry["score_a"] = []
                    entry["score_b"] = []
                
                # Optional columns
                mid = row["match_id"] if "match_id" in col_names else None
                entry["match_id"] = mid
                entry["stats_mode"] = row["stats_mode"] if "stats_mode" in col_names else None
                
                # Sets history with tiebreak scores
                if "sets_history" in col_names and row["sets_history"]:
                    entry["sets_history"] = json.loads(row["sets_history"])
                else:
                    entry["sets_history"] = None

                # Enrich names — always resolve through player DB
                # Start with best available raw name, then resolve
                ml = match_lookup.get(mid) if mid else None
                raw_a = entry["player_a"]
                raw_b = entry["player_b"]
                if ml:
                    raw_a = ml["p1"] or raw_a
                    raw_b = ml["p2"] or raw_b
                entry["player_a"] = _resolve_name(raw_a, player_name_map)
                entry["player_b"] = _resolve_name(raw_b, player_name_map)
                entry["duration_seconds"], entry["started_at"] = _history_timing(
                    entry["duration_seconds"],
                    duration_lookup.get(mid) if mid else None,
                    ml["started_at"] if ml else None,
                    ml["created_at"] if ml else None,
                    entry["ended_ts"],
                )

                court_meta = court_lookup.get(entry["kort_id"], {})
                entry["court_name"] = court_meta.get("court_name")
                entry["tournament_name"] = court_meta.get("tournament_name")

                result.append(entry)
            return result
    except Exception as e:
        logger.error("fetch_match_history_error", error=str(e))
        return []

def _resolve_name(raw: Optional[str], lookup: Dict[str, str]) -> str:
    """Try to resolve a surname or 'X / Y' doubles pair to full names."""
    if not raw or raw == "-":
        return raw or "-"
    # Doubles format: "Surname1 / Surname2"
    if " / " in raw:
        parts = [lookup.get(p.strip(), p.strip()) for p in raw.split(" / ")]
        return " / ".join(parts)
    return lookup.get(raw.strip(), raw)
