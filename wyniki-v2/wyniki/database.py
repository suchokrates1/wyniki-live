"""Database access layer for v2."""
import json
import sqlite3
from contextlib import contextmanager
from typing import Dict, List, Optional, Generator, Any
from pathlib import Path

from .config import settings, logger


@contextmanager
def db_conn() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections."""
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    connection = sqlite3.connect(str(db_path), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    """Initialize database schema."""
    with db_conn() as conn:
        cursor = conn.cursor()
        
        # Courts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS courts (
                kort_id TEXT PRIMARY KEY,
                pin TEXT,
                active INTEGER DEFAULT 1
            )
        """)
        
        # Tournaments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                active INTEGER DEFAULT 0,
                location TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Players table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                first_name TEXT DEFAULT '',
                last_name TEXT DEFAULT '',
                category TEXT,
                country TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        
        # Match history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS match_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kort_id TEXT NOT NULL,
                ended_ts TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                player_a TEXT,
                player_b TEXT,
                score_a TEXT,
                score_b TEXT,
                category TEXT,
                phase TEXT DEFAULT 'Grupowa',
                match_id INTEGER,
                stats_mode TEXT
            )
        """)
        
        # App settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        # Migration: Add pin column to courts if it doesn't exist
        cursor.execute("PRAGMA table_info(courts)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'pin' not in columns:
            cursor.execute("ALTER TABLE courts ADD COLUMN pin TEXT")
            logger.info("database_migration", action="added_pin_column_to_courts")
        
        # Migration: Add match_id and stats_mode columns to match_history
        cursor.execute("PRAGMA table_info(match_history)")
        mh_columns = [row[1] for row in cursor.fetchall()]
        if 'match_id' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN match_id INTEGER")
            logger.info("database_migration", action="added_match_id_to_match_history")
        if 'stats_mode' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN stats_mode TEXT")
            logger.info("database_migration", action="added_stats_mode_to_match_history")
        
        # Migration: Add score_a/score_b TEXT columns (replaces old set1_a/set1_b/... columns)
        if 'score_a' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN score_a TEXT")
            cursor.execute("ALTER TABLE match_history ADD COLUMN score_b TEXT")
            # Backfill from old per-set columns if they exist
            if 'set1_a' in mh_columns:
                cursor.execute("SELECT id, set1_a, set1_b, set2_a, set2_b, tie_a, tie_b FROM match_history")
                for row in cursor.fetchall():
                    sa = json.dumps([row['set1_a'] or 0, row['set2_a'] or 0, row['tie_a'] or 0])
                    sb = json.dumps([row['set1_b'] or 0, row['set2_b'] or 0, row['tie_b'] or 0])
                    cursor.execute("UPDATE match_history SET score_a=?, score_b=? WHERE id=?", (sa, sb, row['id']))
            logger.info("database_migration", action="added_score_a_score_b_to_match_history")
        
        # Migration: Add first_name/last_name columns to players
        cursor.execute("PRAGMA table_info(players)")
        player_columns = [row[1] for row in cursor.fetchall()]
        if 'first_name' not in player_columns:
            cursor.execute("ALTER TABLE players ADD COLUMN first_name TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE players ADD COLUMN last_name TEXT DEFAULT ''")
            # Backfill: split existing 'name' into first_name + last_name
            cursor.execute("SELECT id, name FROM players")
            for row in cursor.fetchall():
                full = (row['name'] or '').strip()
                parts = full.rsplit(' ', 1)
                if len(parts) == 2:
                    fn, ln = parts[0], parts[1]
                else:
                    fn, ln = '', full  # single word → last name
                cursor.execute(
                    "UPDATE players SET first_name=?, last_name=? WHERE id=?",
                    (fn, ln, row['id'])
                )
            logger.info("database_migration", action="added_first_name_last_name_to_players")
        
        # Migration: Add sets_history column to match_history (for tiebreak scores)
        cursor.execute("PRAGMA table_info(match_history)")
        mh_cols2 = [row[1] for row in cursor.fetchall()]
        if 'sets_history' not in mh_cols2:
            cursor.execute("ALTER TABLE match_history ADD COLUMN sets_history TEXT")
            logger.info("database_migration", action="added_sets_history_to_match_history")
        
        # Migration: Add tournament_id column to match_history
        cursor.execute("PRAGMA table_info(match_history)")
        mh_cols3 = [row[1] for row in cursor.fetchall()]
        if 'tournament_id' not in mh_cols3:
            cursor.execute("ALTER TABLE match_history ADD COLUMN tournament_id INTEGER")
            # Assign existing history to the first tournament (default)
            cursor.execute("SELECT id FROM tournaments ORDER BY id ASC LIMIT 1")
            first_t = cursor.fetchone()
            if first_t:
                cursor.execute("UPDATE match_history SET tournament_id = ? WHERE tournament_id IS NULL", (first_t["id"],))
            logger.info("database_migration", action="added_tournament_id_to_match_history")
        
        # Bracket tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                order_num INTEGER DEFAULT 0,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_group_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                player_id INTEGER,
                player_name TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES bracket_groups(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_knockout (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                phase TEXT NOT NULL,
                position INTEGER DEFAULT 1,
                player1_name TEXT,
                player2_name TEXT,
                winner_name TEXT,
                score_summary TEXT,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        
        # Migration: Add tournament_id, bracket_group_id, phase to matches
        cursor.execute("PRAGMA table_info(matches)")
        m_cols = [row[1] for row in cursor.fetchall()]
        if 'tournament_id' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN tournament_id INTEGER")
            logger.info("database_migration", action="added_tournament_id_to_matches")
        if 'bracket_group_id' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN bracket_group_id INTEGER")
            logger.info("database_migration", action="added_bracket_group_id_to_matches")
        if 'phase' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN phase TEXT")
            logger.info("database_migration", action="added_phase_to_matches")
        
        # Migration: Add location column to tournaments
        cursor.execute("PRAGMA table_info(tournaments)")
        t_cols = [row[1] for row in cursor.fetchall()]
        if 'location' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN location TEXT DEFAULT ''")
            logger.info("database_migration", action="added_location_to_tournaments")
        
        # Migration: Add gender column to players
        cursor.execute("PRAGMA table_info(players)")
        p_cols2 = [row[1] for row in cursor.fetchall()]
        if 'gender' not in p_cols2:
            cursor.execute("ALTER TABLE players ADD COLUMN gender TEXT DEFAULT ''")
            logger.info("database_migration", action="added_gender_to_players")
        
        conn.commit()
    
    logger.info("database_initialized", db_path=settings.database_path)


def detect_bracket_context(player1_name: str, player2_name: str, tournament_id: int) -> Dict[str, Any]:
    """Detect bracket group/phase for a match based on player names.
    
    Returns dict with:
      - group_id: int or None
      - phase: 'Grupowa' | 'Pucharowa' | None
      - warning: str code or None ('different_groups' | 'no_bracket')
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Find groups for player1
            cursor.execute("""
                SELECT bgp.group_id, bg.name
                FROM bracket_group_players bgp
                JOIN bracket_groups bg ON bg.id = bgp.group_id
                WHERE bg.tournament_id = ? AND bgp.player_name = ?
            """, (tournament_id, player1_name))
            p1_groups = cursor.fetchall()

            # Find groups for player2
            cursor.execute("""
                SELECT bgp.group_id, bg.name
                FROM bracket_group_players bgp
                JOIN bracket_groups bg ON bg.id = bgp.group_id
                WHERE bg.tournament_id = ? AND bgp.player_name = ?
            """, (tournament_id, player2_name))
            p2_groups = cursor.fetchall()

            if not p1_groups and not p2_groups:
                return {"group_id": None, "phase": None, "warning": "no_bracket"}

            p1_gids = {r["group_id"] for r in p1_groups}
            p2_gids = {r["group_id"] for r in p2_groups}
            common = p1_gids & p2_gids

            if common:
                gid = next(iter(common))
                return {"group_id": gid, "phase": "Grupowa", "warning": None}
            else:
                return {"group_id": None, "phase": "Pucharowa", "warning": "different_groups"}

    except Exception as e:
        logger.error("detect_bracket_context_error", error=str(e))
        return {"group_id": None, "phase": None, "warning": None}


def advance_knockout(match_id: int, tournament_id: int) -> bool:
    """After a knockout match finishes, find the matching slot, persist the result,
    and auto-advance winners to the next round (SF→Final/3rd place)."""
    try:
        from .db_models import Match as MatchModel
        match = MatchModel.query.get(match_id)
        if not match or match.status != "finished":
            return False

        p1 = match.player1_name
        p2 = match.player2_name
        winner = p1 if match.player1_sets > match.player2_sets else p2

        sets_history = json.loads(match.sets_history) if match.sets_history else []
        score_parts = []
        for s in sets_history:
            g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
            if g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None:
                continue
            score_parts.append(f"{g1}:{g2}")
        score_summary = " ".join(score_parts)

        with db_conn() as conn:
            cursor = conn.cursor()
            # Find the knockout slot matching these two players
            cursor.execute("""
                SELECT id, phase, position FROM bracket_knockout
                WHERE tournament_id = ?
                  AND ((player1_name = ? AND player2_name = ?)
                    OR (player1_name = ? AND player2_name = ?))
                  AND winner_name IS NULL
            """, (tournament_id, p1, p2, p2, p1))
            slot = cursor.fetchone()
            if not slot:
                return False

            # Update the slot with winner and score
            cursor.execute("""
                UPDATE bracket_knockout SET winner_name = ?, score_summary = ?
                WHERE id = ?
            """, (winner, score_summary, slot["id"]))

            loser = p2 if winner == p1 else p1

            # Auto-advance: if semifinal, populate final and 3rd place
            if slot["phase"] == "semifinal":
                _advance_to_next_round(cursor, tournament_id, slot["position"], winner, loser)

            conn.commit()
            logger.info("knockout_advanced", match_id=match_id, winner=winner, phase=slot["phase"])
            return True

    except Exception as e:
        logger.error("advance_knockout_error", error=str(e), match_id=match_id)
        return False


def _advance_to_next_round(cursor, tournament_id: int, sf_position: int, winner: str, loser: str) -> None:
    """Fill in final/3rd-place slots based on semifinal results."""
    # Put winner into final
    cursor.execute("""
        SELECT id, player1_name, player2_name FROM bracket_knockout
        WHERE tournament_id = ? AND phase = 'final' AND position = 1
    """, (tournament_id,))
    final_slot = cursor.fetchone()
    if final_slot:
        if not final_slot["player1_name"]:
            cursor.execute("UPDATE bracket_knockout SET player1_name = ? WHERE id = ?",
                           (winner, final_slot["id"]))
        elif not final_slot["player2_name"]:
            cursor.execute("UPDATE bracket_knockout SET player2_name = ? WHERE id = ?",
                           (winner, final_slot["id"]))

    # Put loser into 3rd place match
    cursor.execute("""
        SELECT id, player1_name, player2_name FROM bracket_knockout
        WHERE tournament_id = ? AND phase = 'third_place' AND position = 1
    """, (tournament_id,))
    third_slot = cursor.fetchone()
    if third_slot:
        if not third_slot["player1_name"]:
            cursor.execute("UPDATE bracket_knockout SET player1_name = ? WHERE id = ?",
                           (loser, third_slot["id"]))
        elif not third_slot["player2_name"]:
            cursor.execute("UPDATE bracket_knockout SET player2_name = ? WHERE id = ?",
                           (loser, third_slot["id"]))


def insert_match_history(entry: Dict[str, Any]) -> None:
    """Insert a match history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO match_history (
                    kort_id, ended_ts, duration_seconds,
                    player_a, player_b, score_a, score_b,
                    category, phase, match_id, stats_mode, sets_history,
                    tournament_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
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
            ))
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


def fetch_courts() -> List[Dict[str, Optional[str]]]:
    """Fetch all courts from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT kort_id, pin, active FROM courts ORDER BY CAST(kort_id AS INTEGER)")
            rows = cursor.fetchall()
        
        courts = [{"kort_id": row["kort_id"], "pin": row["pin"], "active": row["active"]} for row in rows]
        logger.debug("courts_fetched", count=len(courts))
        return courts
    except Exception as e:
        logger.error("fetch_courts_error", error=str(e))
        return []


def insert_court(kort_id: str, pin: Optional[str] = None) -> None:
    """Insert a new court."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR IGNORE INTO courts (kort_id, pin, active)
                VALUES (?, ?, 1)
            """, (kort_id, pin))
            conn.commit()
        logger.info("court_inserted", kort_id=kort_id)
    except Exception as e:
        logger.error("insert_court_error", kort_id=kort_id, error=str(e))


def upsert_court(kort_id: str, pin: Optional[str] = None) -> None:
    """Insert or update court configuration."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO courts (kort_id, pin, active)
                VALUES (?, ?, 1)
                ON CONFLICT(kort_id) DO UPDATE SET pin=excluded.pin
            """, (kort_id, pin))
            conn.commit()
        logger.info("court_upserted", kort_id=kort_id, pin=pin)
    except Exception as e:
        logger.error("upsert_court_error", kort_id=kort_id, error=str(e))


def delete_court(kort_id: str) -> bool:
    """Delete a court from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM courts WHERE kort_id = ?", (kort_id,))
            conn.commit()
            deleted = cursor.rowcount > 0
        if deleted:
            logger.info("court_deleted", kort_id=kort_id)
        return deleted
    except Exception as e:
        logger.error("delete_court_error", kort_id=kort_id, error=str(e))
        return False


def rename_court(old_kort_id: str, new_kort_id: str) -> bool:
    """Rename a court (change kort_id)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Check if new ID already exists
            cursor.execute("SELECT 1 FROM courts WHERE kort_id = ?", (new_kort_id,))
            if cursor.fetchone():
                logger.warning("rename_court_conflict", old_kort_id=old_kort_id, new_kort_id=new_kort_id)
                return False
            cursor.execute("UPDATE courts SET kort_id = ? WHERE kort_id = ?", (new_kort_id, old_kort_id))
            conn.commit()
            renamed = cursor.rowcount > 0
        if renamed:
            logger.info("court_renamed", old_kort_id=old_kort_id, new_kort_id=new_kort_id)
        return renamed
    except Exception as e:
        logger.error("rename_court_error", old_kort_id=old_kort_id, new_kort_id=new_kort_id, error=str(e))
        return False


def fetch_app_settings(keys: List[str]) -> Dict[str, Any]:
    """Fetch app settings from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            
            if keys:
                placeholders = ",".join("?" for _ in keys)
                cursor.execute(f"SELECT key, value FROM app_settings WHERE key IN ({placeholders})", keys)
            else:
                cursor.execute("SELECT key, value FROM app_settings")
            
            rows = cursor.fetchall()
        
        settings_dict = {row["key"]: row["value"] for row in rows}
        
        # Fill in None for missing keys
        if keys:
            for key in keys:
                settings_dict.setdefault(key, None)
        
        return settings_dict
    except Exception as e:
        logger.error("fetch_app_settings_error", error=str(e))
        return {}


def upsert_app_settings(settings_dict: Dict[str, str]) -> None:
    """Insert or update app settings."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for key, value in settings_dict.items():
                if value is None:
                    cursor.execute("DELETE FROM app_settings WHERE key = ?", (key,))
                else:
                    cursor.execute("""
                        INSERT INTO app_settings (key, value)
                        VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """, (key, value))
            conn.commit()
        logger.info("app_settings_upserted", count=len(settings_dict))
    except Exception as e:
        logger.error("upsert_app_settings_error", error=str(e))


def fetch_match_history(limit: int = 100, tournament_id: Optional[int] = None) -> List[Dict]:
    """Fetch match history from database, enriched with full names."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if tournament_id is not None:
                cursor.execute("""
                    SELECT * FROM match_history
                    WHERE tournament_id = ?
                    ORDER BY ended_ts DESC
                    LIMIT ?
                """, (tournament_id, limit))
            else:
                cursor.execute("""
                    SELECT * FROM match_history
                    ORDER BY ended_ts DESC
                    LIMIT ?
                """, (limit,))
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
                    f"SELECT id, player1_name, player2_name, created_at FROM matches WHERE id IN ({placeholders})",
                    match_ids,
                )
                for mr in cursor.fetchall():
                    match_lookup[mr["id"]] = {
                        "p1": mr["player1_name"],
                        "p2": mr["player2_name"],
                        "started_at": mr["created_at"],
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
                    entry["started_at"] = ml["started_at"]
                else:
                    entry["started_at"] = None
                entry["player_a"] = _resolve_name(raw_a, player_name_map)
                entry["player_b"] = _resolve_name(raw_b, player_name_map)

                # Fallback duration from match_statistics
                if not entry["duration_seconds"] and mid and mid in duration_lookup:
                    entry["duration_seconds"] = duration_lookup[mid]

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


# ==================== TOURNAMENTS ====================

def get_active_tournament_id() -> Optional[int]:
    """Get the ID of the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM tournaments WHERE active = 1 LIMIT 1")
            row = cursor.fetchone()
            return row["id"] if row else None
    except Exception as e:
        logger.error("get_active_tournament_id_error", error=str(e))
        return None


def get_active_tournament_name() -> Optional[str]:
    """Get the name of the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM tournaments WHERE active = 1 LIMIT 1")
            row = cursor.fetchone()
            return row["name"] if row else None
    except Exception as e:
        logger.error("get_active_tournament_name_error", error=str(e))
        return None


def fetch_tournaments() -> List[Dict]:
    """Fetch all tournaments."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, start_date, end_date, active, created_at
                FROM tournaments
                ORDER BY start_date DESC
            """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_tournaments_error", error=str(e))
        return []


def fetch_tournament(tournament_id: int) -> Optional[Dict]:
    """Fetch a single tournament by ID."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, start_date, end_date, active, created_at
                FROM tournaments WHERE id = ?
            """, (tournament_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error("fetch_tournament_error", error=str(e), tournament_id=tournament_id)
        return None


def insert_tournament(name: str, start_date: str, end_date: str, active: bool = False) -> Optional[int]:
    """Insert a new tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tournaments (name, start_date, end_date, active)
                VALUES (?, ?, ?, ?)
            """, (name, start_date, end_date, 1 if active else 0))
            conn.commit()
            logger.info("tournament_inserted", id=cursor.lastrowid, name=name)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_tournament_error", error=str(e))
        return None


def update_tournament(tournament_id: int, name: str, start_date: str, end_date: str, active: bool) -> bool:
    """Update a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tournaments
                SET name = ?, start_date = ?, end_date = ?, active = ?
                WHERE id = ?
            """, (name, start_date, end_date, 1 if active else 0, tournament_id))
            conn.commit()
            logger.info("tournament_updated", id=tournament_id)
            return True
    except Exception as e:
        logger.error("update_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def delete_tournament(tournament_id: int) -> bool:
    """Delete a tournament and all its players."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("tournament_deleted", id=tournament_id)
            return True
    except Exception as e:
        logger.error("delete_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def set_active_tournament(tournament_id: int) -> bool:
    """Set a tournament as active (deactivates all others)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Deactivate all
            cursor.execute("UPDATE tournaments SET active = 0")
            # Activate the selected one
            cursor.execute("UPDATE tournaments SET active = 1 WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("active_tournament_set", id=tournament_id)
            return True
    except Exception as e:
        logger.error("set_active_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


# ==================== PLAYERS ====================

def fetch_players(tournament_id: Optional[int] = None) -> List[Dict]:
    """Fetch players, optionally filtered by tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if tournament_id:
                cursor.execute("""
                    SELECT id, tournament_id, name, first_name, last_name, category, country, created_at
                    FROM players
                    WHERE tournament_id = ?
                    ORDER BY last_name, first_name
                """, (tournament_id,))
            else:
                cursor.execute("""
                    SELECT id, tournament_id, name, first_name, last_name, category, country, created_at
                    FROM players
                    ORDER BY tournament_id DESC, last_name, first_name
                """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_players_error", error=str(e))
        return []


def fetch_active_tournament_players() -> List[Dict]:
    """Fetch players from the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.id, p.tournament_id, p.name, p.first_name, p.last_name,
                       p.category, p.country, p.created_at
                FROM players p
                INNER JOIN tournaments t ON p.tournament_id = t.id
                WHERE t.active = 1
                ORDER BY p.last_name, p.first_name
            """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_active_tournament_players_error", error=str(e))
        return []


def insert_player(tournament_id: int, name: str, category: str = "", country: str = "",
                  first_name: str = "", last_name: str = "", gender: str = "") -> Optional[int]:
    """Insert a new player."""
    # If first_name/last_name not provided, split from name
    if not first_name and not last_name and name:
        parts = name.strip().rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name.strip()
    # Ensure name is set (for backward compat)
    if not name:
        name = f"{first_name} {last_name}".strip()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO players (tournament_id, name, first_name, last_name, category, country, gender)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tournament_id, name, first_name, last_name, category, country, gender))
            conn.commit()
            logger.info("player_inserted", id=cursor.lastrowid, name=name, tournament_id=tournament_id)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_player_error", error=str(e))
        return None


def update_player(player_id: int, name: str, category: str, country: str,
                  first_name: str = "", last_name: str = "", gender: str = "") -> bool:
    """Update a player."""
    # If first_name/last_name not provided, split from name
    if not first_name and not last_name and name:
        parts = name.strip().rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name.strip()
    if not name:
        name = f"{first_name} {last_name}".strip()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE players
                SET name = ?, first_name = ?, last_name = ?, category = ?, country = ?, gender = ?
                WHERE id = ?
            """, (name, first_name, last_name, category, country, gender, player_id))
            conn.commit()
            logger.info("player_updated", id=player_id)
            return True
    except Exception as e:
        logger.error("update_player_error", error=str(e), player_id=player_id)
        return False


def delete_player(player_id: int) -> bool:
    """Delete a player."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM players WHERE id = ?", (player_id,))
            conn.commit()
            logger.info("player_deleted", id=player_id)
            return True
    except Exception as e:
        logger.error("delete_player_error", error=str(e), player_id=player_id)
        return False


def bulk_insert_players(tournament_id: int, players_data: List[Dict]) -> int:
    """Bulk insert players. Returns count of inserted players."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            count = 0
            for player in players_data:
                p_name = player.get("name", "")
                fn = player.get("first_name", "")
                ln = player.get("last_name", "")
                # Split name if first/last not provided
                if not fn and not ln and p_name:
                    parts = p_name.strip().rsplit(' ', 1)
                    if len(parts) == 2:
                        fn, ln = parts[0], parts[1]
                    else:
                        fn, ln = '', p_name.strip()
                if not p_name:
                    p_name = f"{fn} {ln}".strip()
                cursor.execute("""
                    INSERT INTO players (tournament_id, name, first_name, last_name, category, country)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    tournament_id,
                    p_name,
                    fn,
                    ln,
                    player.get("category", ""),
                    player.get("country", "")
                ))
                count += 1
            conn.commit()
            logger.info("players_bulk_inserted", count=count, tournament_id=tournament_id)
            return count
    except Exception as e:
        logger.error("bulk_insert_players_error", error=str(e))
        return 0


# ==================== BRACKET ====================

def save_bracket_groups(tournament_id: int, groups: List[Dict]) -> bool:
    """Replace all bracket groups for a tournament.
    groups: [{"name": "A", "players": [player_id, ...]}, ...]
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Delete existing groups (cascade deletes players)
            cursor.execute(
                "DELETE FROM bracket_group_players WHERE group_id IN "
                "(SELECT id FROM bracket_groups WHERE tournament_id = ?)",
                (tournament_id,)
            )
            cursor.execute("DELETE FROM bracket_groups WHERE tournament_id = ?", (tournament_id,))

            # Build player_id -> last_name lookup
            cursor.execute(
                "SELECT id, last_name, name FROM players WHERE tournament_id = ?",
                (tournament_id,)
            )
            name_map = {}
            for row in cursor.fetchall():
                ln = (row["last_name"] or "").strip()
                name_map[row["id"]] = ln if ln else (row["name"] or "").strip()

            for idx, g in enumerate(groups):
                cursor.execute(
                    "INSERT INTO bracket_groups (tournament_id, name, order_num) VALUES (?, ?, ?)",
                    (tournament_id, g["name"], idx)
                )
                gid = cursor.lastrowid
                for pid in g.get("players", []):
                    pname = name_map.get(pid, "")
                    if pname:
                        cursor.execute(
                            "INSERT INTO bracket_group_players (group_id, player_id, player_name) VALUES (?, ?, ?)",
                            (gid, pid, pname)
                        )
            conn.commit()
            logger.info("bracket_groups_saved", tournament_id=tournament_id, count=len(groups))
            return True
    except Exception as e:
        logger.error("save_bracket_groups_error", error=str(e))
        return False


def fetch_bracket_groups(tournament_id: int) -> List[Dict]:
    """Get all bracket groups with players for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, order_num FROM bracket_groups WHERE tournament_id = ? ORDER BY order_num",
                (tournament_id,)
            )
            groups = []
            for g in cursor.fetchall():
                cursor.execute(
                    "SELECT player_id, player_name FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],)
                )
                players = [{"player_id": r["player_id"], "name": r["player_name"]} for r in cursor.fetchall()]
                groups.append({"id": g["id"], "name": g["name"], "players": players})
            return groups
    except Exception as e:
        logger.error("fetch_bracket_groups_error", error=str(e))
        return []


def _find_group_matches(cursor, player_names: List[str], start_date: str, end_date: str) -> List[Dict]:
    """Find finished matches between a set of players within a date range."""
    if len(player_names) < 2:
        return []
    placeholders = ",".join("?" for _ in player_names)
    end_ts = end_date + "T23:59:59"
    cursor.execute(f"""
        SELECT id, player1_name, player2_name, player1_sets, player2_sets,
               sets_history, created_at
        FROM matches
        WHERE status = 'finished'
          AND player1_name IN ({placeholders})
          AND player2_name IN ({placeholders})
          AND created_at >= ?
          AND created_at <= ?
        ORDER BY created_at
    """, (*player_names, *player_names, start_date, end_ts))
    return cursor.fetchall()


def _is_stb(s: dict) -> bool:
    """Detect super tiebreak set (set 3+ with low games and TB points)."""
    if s.get("is_super_tiebreak", False):
        return True
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return (s.get("set_number", 0) >= 3 and max(g1, g2) <= 1
            and s.get("tiebreak_loser_points") is not None)


def _is_empty_set(s: dict) -> bool:
    """Skip junk 0:0 sets (app initialised set 3 but match ended in 2)."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None


def _build_set_detail(s: dict, flipped: bool = False) -> dict:
    """Build per-set scoreboard data. For STB, use actual TB points."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    tb = s.get("tiebreak_loser_points")
    stb = _is_stb(s)
    if stb and tb is not None:
        # STB: convert games 0/1 → actual tiebreak points
        # Winner gets max(10, tb+2), loser gets tb
        winner_pts = max(10, tb + 2)
        if g1 > g2:  # player1 won STB
            g1, g2 = winner_pts, tb
        else:
            g1, g2 = tb, winner_pts
        tb = None  # no separate TB display needed
    if flipped:
        g1, g2 = g2, g1
    return {"g1": g1, "g2": g2, "tb": tb, "stb": stb}


def _format_set_score(s: dict, flipped: bool = False) -> str:
    """Format a single set score string."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    if flipped:
        g1, g2 = g2, g1
    tb = s.get("tiebreak_loser_points")
    if _is_stb(s):
        return f"STB {g1}:{g2}" if tb is None else f"STB [{g1}:{g2}({tb})]"
    if tb is not None:
        return f"{g1}:{g2}({tb})"
    return f"{g1}:{g2}"


def _compute_standings(player_names: List[str], matches) -> tuple:
    """Compute standings from a list of matches. Returns (standings, match_results)."""
    stats = {name: {"wins": 0, "losses": 0, "sets_won": 0, "sets_lost": 0,
                     "games_won": 0, "games_lost": 0, "played": 0}
             for name in player_names}

    match_results = []
    for m in matches:
        p1, p2 = m["player1_name"], m["player2_name"]
        s1, s2 = m["player1_sets"], m["player2_sets"]
        sh = json.loads(m["sets_history"]) if m["sets_history"] else []
        sh = [s for s in sh if not _is_empty_set(s)]

        if p1 not in stats or p2 not in stats:
            continue

        stats[p1]["played"] += 1
        stats[p2]["played"] += 1

        winner = None
        if s1 > s2:
            stats[p1]["wins"] += 1
            stats[p2]["losses"] += 1
            winner = p1
        elif s2 > s1:
            stats[p2]["wins"] += 1
            stats[p1]["losses"] += 1
            winner = p2

        stats[p1]["sets_won"] += s1
        stats[p1]["sets_lost"] += s2
        stats[p2]["sets_won"] += s2
        stats[p2]["sets_lost"] += s1

        for s in sh:
            if not _is_stb(s):
                stats[p1]["games_won"] += s.get("player1_games", 0)
                stats[p1]["games_lost"] += s.get("player2_games", 0)
                stats[p2]["games_won"] += s.get("player2_games", 0)
                stats[p2]["games_lost"] += s.get("player1_games", 0)

        # Build per-set score arrays for scoreboard display
        sets_detail = [_build_set_detail(s) for s in sh]

        # Build score string
        score_parts = []
        for s in sh:
            score_parts.append(_format_set_score(s))

        match_results.append({
            "match_id": m["id"],
            "player_a": p1,
            "player_b": p2,
            "score": "  ".join(score_parts),
            "sets": sets_detail,
            "winner": winner,
            "sets_a": s1,
            "sets_b": s2,
        })

    # Sort: wins desc, set_diff desc, game_diff desc
    standings = []
    for name, s in stats.items():
        standings.append({
            "name": name,
            **s,
            "set_diff": s["sets_won"] - s["sets_lost"],
            "game_diff": s["games_won"] - s["games_lost"],
        })
    standings.sort(key=lambda x: (x["wins"], x["set_diff"], x["game_diff"]), reverse=True)
    return standings, match_results


def save_bracket_knockout(tournament_id: int, slots: List[Dict]) -> bool:
    """Save knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM bracket_knockout WHERE tournament_id = ?", (tournament_id,))
            for slot in slots:
                cursor.execute(
                    "INSERT INTO bracket_knockout (tournament_id, phase, position, "
                    "player1_name, player2_name, winner_name, score_summary) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (tournament_id, slot["phase"], slot.get("position", 1),
                     slot.get("player1_name"), slot.get("player2_name"),
                     slot.get("winner_name"), slot.get("score_summary"))
                )
            conn.commit()
            logger.info("bracket_knockout_saved", tournament_id=tournament_id, count=len(slots))
            return True
    except Exception as e:
        logger.error("save_bracket_knockout_error", error=str(e))
        return False


def fetch_bracket_knockout(tournament_id: int) -> List[Dict]:
    """Get knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT phase, position, player1_name, player2_name, winner_name, score_summary "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_bracket_knockout_error", error=str(e))
        return []


def _detect_knockout_result(cursor, p1: str, p2: str, start_date: str, end_date: str) -> Optional[Dict]:
    """Try to find a finished match between two specific players."""
    if not p1 or not p2:
        return None
    end_ts = end_date + "T23:59:59"
    cursor.execute("""
        SELECT player1_name, player2_name, player1_sets, player2_sets, sets_history
        FROM matches
        WHERE status = 'finished'
          AND ((player1_name = ? AND player2_name = ?) OR (player1_name = ? AND player2_name = ?))
          AND created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC LIMIT 1
    """, (p1, p2, p2, p1, start_date, end_ts))
    row = cursor.fetchone()
    if not row:
        return None

    # Flip score if match player order doesn't match requested order
    flipped = (row["player1_name"] != p1)

    sh = json.loads(row["sets_history"]) if row["sets_history"] else []
    sh = [s for s in sh if not _is_empty_set(s)]
    score_parts = [_format_set_score(s, flipped) for s in sh]

    # Per-set detail for scoreboard
    sets_detail = [_build_set_detail(s, flipped) for s in sh]

    winner = row["player1_name"] if row["player1_sets"] > row["player2_sets"] else row["player2_name"]
    return {"winner": winner, "score": "  ".join(score_parts), "sets": sets_detail}


def get_full_bracket(tournament_id: int) -> Dict:
    """Get complete bracket data for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()

            # Tournament info
            cursor.execute("SELECT name, start_date, end_date FROM tournaments WHERE id = ?", (tournament_id,))
            t = cursor.fetchone()
            if not t:
                return {"error": "Tournament not found"}

            start_date = t["start_date"]
            end_date = t["end_date"]

            # Groups + standings
            cursor.execute(
                "SELECT id, name FROM bracket_groups WHERE tournament_id = ? ORDER BY order_num",
                (tournament_id,)
            )
            group_rows = cursor.fetchall()

            groups_data = []
            for g in group_rows:
                cursor.execute(
                    "SELECT player_name FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],)
                )
                player_names = [r["player_name"] for r in cursor.fetchall()]
                matches = _find_group_matches(cursor, player_names, start_date, end_date)
                standings, match_results = _compute_standings(player_names, matches)
                groups_data.append({
                    "name": g["name"],
                    "standings": standings,
                    "matches": match_results,
                })

            # Knockout
            cursor.execute(
                "SELECT phase, position, player1_name, player2_name, winner_name, score_summary "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            knockout_rows = cursor.fetchall()

            knockout = {}
            for r in knockout_rows:
                phase = r["phase"]
                slot = {
                    "position": r["position"],
                    "player1": r["player1_name"],
                    "player2": r["player2_name"],
                    "winner": r["winner_name"],
                    "score": r["score_summary"],
                    "sets": None,
                }
                # Auto-detect result from match data if not manually set
                if slot["player1"] and slot["player2"] and not slot["winner"]:
                    result = _detect_knockout_result(
                        cursor, slot["player1"], slot["player2"], start_date, end_date
                    )
                    if result:
                        slot["winner"] = result["winner"]
                        slot["score"] = result["score"]
                        slot["sets"] = result.get("sets")

                knockout.setdefault(phase, []).append(slot)

            return {
                "tournament": {"id": tournament_id, "name": t["name"]},
                "groups": groups_data,
                "knockout": knockout,
            }
    except Exception as e:
        logger.error("get_full_bracket_error", error=str(e))
        return {"error": str(e)}


def generate_knockout_from_standings(tournament_id: int) -> Dict:
    """Auto-generate knockout bracket from group standings (1A vs 2B, 1B vs 2A)."""
    try:
        bracket = get_full_bracket(tournament_id)
        groups = bracket.get("groups", [])
        if len(groups) < 2:
            return {"error": "Need at least 2 groups"}

        g_a = groups[0]["standings"]
        g_b = groups[1]["standings"]
        if len(g_a) < 2 or len(g_b) < 2:
            return {"error": "Groups need at least 2 players with standings"}

        slots = [
            {"phase": "semifinal", "position": 1,
             "player1_name": g_a[0]["name"], "player2_name": g_b[1]["name"]},
            {"phase": "semifinal", "position": 2,
             "player1_name": g_b[0]["name"], "player2_name": g_a[1]["name"]},
            {"phase": "final", "position": 1,
             "player1_name": None, "player2_name": None},
            {"phase": "third_place", "position": 1,
             "player1_name": None, "player2_name": None},
        ]
        save_bracket_knockout(tournament_id, slots)
        return {"status": "ok", "knockout": slots}
    except Exception as e:
        logger.error("generate_knockout_error", error=str(e))
        return {"error": str(e)}


