#!/usr/bin/env python3
"""Align knockout + doubles + B2 Women consolation with tennis.lt.

Reads `_tmp_tlt_all_matches_compare.json` (full Tournated OOP dump).
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB = os.environ.get("DATABASE_PATH", "/data/wyniki.sqlite3")
TID = 31
DUMP = Path(os.environ.get("TLT_KO_DUMP", Path(__file__).with_name("_tmp_tlt_all_matches_compare.json")))
SET_RE = re.compile(r"(?:\[)?(\d+)\s*:\s*(\d+)(?:\((\d+)(?:\s*:\s*(\d+))?\))?(?:\])?")

CAT_MAP = {
    "B1 MEN": "B1 Men",
    "B1 WOMEN": "B1 Women",
    "B2 MEN": "B2 Men",
    "B2 WOMEN": "B2 Women",
    "B3 MEN": "B3 Men",
    "B3 WOMEN": "B3 Women",
    "B4 MEN": "B4 Men",
    "B4 WOMEN": "B4 Women",
    "B1 MEN DOUBLES": "B1 Men Doubles",
    "B1 WOMEN DOUBLES": "B1 Women Doubles",
    "B2 MEN DOUBLES": "B2 Men Doubles",
    "B2 WOMEN DOUBLES": "B2 Women Doubles",
    "B4 - B3 MEN DOUBLES": "B3/B4 Men Doubles",
    "B4 - B3 WOMEN DOUBLES": "B3/B4 Women Doubles",
    "B4 - B3 WOMEN'S DOUBLES": "B3/B4 Women Doubles",
}
ROUND_MAP = {
    "Final": "Finał",
    "Semi-Final": "Półfinał",
    "Quarter-Final": "Ćwierćfinał",
    "3rd place": "o 3. miejsce",
    "3-4 place": "o 3. miejsce",
    "7th place": "7. miejsce",
    "11th place": "11. miejsce",
    "R1": "Runda 1",
    "R2": "Runda 2",
    "R3": "Runda 3",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fold(text: str) -> str:
    value = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn")


def words(name: str) -> frozenset[str]:
    return frozenset(re.findall(r"[a-z0-9]+", fold(name)))


def last_token(name: str) -> str:
    parts = [p for p in re.split(r"\s+", str(name or "").replace("/", " ")) if p]
    return fold(parts[-1]) if parts else ""


def given_tokens(person: str) -> list[str]:
    last = last_token(person)
    return [token for token in fold(person).split() if token and token != last]


def similar_token(left: str, right: str) -> bool:
    if left == right:
        return True
    return difflib.SequenceMatcher(None, left, right).ratio() >= 0.8


def people(name: str) -> list[str]:
    return [part.strip() for part in re.split(r"\s*/\s*", str(name or "")) if part.strip()]


def person_match(left: str, right: str) -> bool:
    a, b = words(left), words(right)
    if not a or not b:
        return False
    if a == b:
        return True
    if last_token(left) != last_token(right) or not last_token(left):
        return False
    if len(a) == 1 or len(b) == 1:
        return True
    ga, gb = given_tokens(left), given_tokens(right)
    if not ga or not gb:
        return True
    return any(similar_token(x, y) for x in ga for y in gb)


def sides_match(left: str, right: str) -> bool:
    lp, rp = people(left), people(right)
    if not lp or not rp or len(lp) != len(rp):
        return False
    used = [False] * len(rp)
    for person in lp:
        found = False
        for idx, other in enumerate(rp):
            if used[idx]:
                continue
            if person_match(person, other):
                used[idx] = True
                found = True
                break
        if not found:
            return False
    return True


def team_key(name: str) -> frozenset:
    return frozenset(words(person) for person in people(name))


def pair_key(a: str, b: str) -> frozenset:
    return frozenset((team_key(a), team_key(b)))


def same_pair(a1: str, b1: str, a2: str, b2: str) -> bool:
    return (
        (sides_match(a1, a2) and sides_match(b1, b2))
        or (sides_match(a1, b2) and sides_match(b1, a2))
    )


def is_group_phase(phase: str | None) -> bool:
    value = str(phase or "").strip().casefold()
    return value in {"", "grupowa", "grupowa — rewanż", "grupowa - rewanż"}


def parse_tlt_score(raw: str | None) -> list[dict]:
    text = str(raw or "").strip()
    if not text:
        return []
    sets: list[dict] = []
    for match in SET_RE.finditer(text):
        w_games, l_games = int(match.group(1)), int(match.group(2))
        tb_w, tb_l = match.group(3), match.group(4)
        wrapped = text[max(0, match.start() - 1) : match.end() + 1]
        is_stb = "[" in wrapped or (max(w_games, l_games) >= 10 and abs(w_games - l_games) >= 2)
        if w_games == l_games:
            continue
        row: dict[str, Any] = {"player1_games": w_games, "player2_games": l_games}
        if tb_w is not None:
            tb_vals = [int(tb_w)] + ([int(tb_l)] if tb_l is not None else [])
            row["tiebreak_loser_points"] = min(tb_vals)
        if is_stb:
            row["is_super_tiebreak"] = True
        sets.append(row)
    if len(sets) >= 3 and max(sets[-1]["player1_games"], sets[-1]["player2_games"]) >= 10:
        sets[-1]["is_super_tiebreak"] = True
    for idx, item in enumerate(sets, start=1):
        item["set_number"] = idx
    return sets


def orient_sets(sets: list[dict], winner_is_p1: bool) -> list[dict]:
    if winner_is_p1:
        return [dict(item) for item in sets]
    out = []
    for item in sets:
        row = dict(item)
        row["player1_games"], row["player2_games"] = item["player2_games"], item["player1_games"]
        out.append(row)
    return out


def set_wins(sets: list[dict]) -> tuple[int, int]:
    s1 = sum(1 for item in sets if item["player1_games"] > item["player2_games"])
    s2 = sum(1 for item in sets if item["player2_games"] > item["player1_games"])
    return s1, s2


def pick_name(p1: str, p2: str, winner: str) -> str:
    if sides_match(p1, winner):
        return p1
    if sides_match(p2, winner):
        return p2
    raise SystemExit(f"winner {winner!r} not in {p1!r} vs {p2!r}")


def pretty_cat(cat: str) -> str:
    key = str(cat or "").strip().upper().replace("’", "'")
    return CAT_MAP.get(key) or CAT_MAP.get(key.replace(" WOMEN'S ", " WOMEN ")) or cat.title()


def generated_phase(row: dict) -> str:
    label = pretty_cat(row["cat"])
    suffix = ROUND_MAP.get(row.get("round") or "", row.get("round") or "Pucharowa")
    draw = str(row.get("draw") or "")
    if "CONSOLATION" in draw.upper() and suffix in {"Finał", "Półfinał", "Ćwierćfinał", "o 3. miejsce", "7. miejsce"}:
        if suffix == "Finał":
            return f"{label} — Consolation Finał"
        if suffix == "o 3. miejsce":
            return f"{label} — Consolation o 3. miejsce"
        return f"{label} — Consolation {suffix}"
    if "CONSOLATION" in draw.upper():
        return f"{label} — Consolation {suffix}"
    return f"{label} — {suffix}"


def is_group_rr(row: dict) -> bool:
    if (row.get("group") or "") == "GROUP 2 WOMEN CONSOLATION":
        return False
    return bool(row.get("group")) and not row.get("draw")


def walkover_sets() -> list[dict]:
    return [
        {"set_number": 1, "player1_games": 4, "player2_games": 0},
        {"set_number": 2, "player1_games": 4, "player2_games": 0},
    ]


def history_scores(sets: list[dict]) -> tuple[str, str]:
    return (
        json.dumps([item["player1_games"] for item in sets], ensure_ascii=False),
        json.dumps([item["player2_games"] for item in sets], ensure_ascii=False),
    )


class Store:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.matches = list(conn.execute(
            """
            SELECT id, player1_name, player2_name, phase, winner_name, status, finish_reason
            FROM matches WHERE tournament_id = ?
            """,
            (TID,),
        ))
        self.ko = list(conn.execute(
            "SELECT id, phase, position, player1_name, player2_name, winner_name, score_summary FROM bracket_knockout WHERE tournament_id = ?",
            (TID,),
        ))
        self.roster: list[str] = []
        seen: set[str] = set()
        for row in conn.execute("SELECT player_name FROM bracket_group_players WHERE group_id IN (SELECT id FROM bracket_groups WHERE tournament_id = ?)", (TID,)):
            if row["player_name"] and row["player_name"] not in seen:
                seen.add(row["player_name"])
                self.roster.append(row["player_name"])
        for row in self.ko:
            for name in (row["player1_name"], row["player2_name"]):
                if name and name not in seen:
                    seen.add(name)
                    self.roster.append(name)
        for row in self.matches:
            for name in (row["player1_name"], row["player2_name"]):
                if name and name not in seen:
                    seen.add(name)
                    self.roster.append(name)

    def resolve(self, name: str) -> str:
        if not name:
            return name
        for ours in self.roster:
            if sides_match(ours, name):
                return ours
        return name

    def _col(self, row, key):
        if isinstance(row, dict):
            return row.get(key)
        return row[key]

    def find_match(self, p1: str, p2: str, *, allow_group: bool = False) -> sqlite3.Row | dict | None:
        finished = []
        for row in self.matches:
            if self._col(row, "status") != "finished" or (self._col(row, "finish_reason") or "normal") == "test":
                continue
            if not same_pair(p1, p2, self._col(row, "player1_name"), self._col(row, "player2_name")):
                continue
            if not allow_group and is_group_phase(self._col(row, "phase")):
                continue
            finished.append(row)
        if not finished:
            return None
        koish = [row for row in finished if not is_group_phase(self._col(row, "phase"))]
        return koish[0] if koish else finished[0]

    def find_group_match(self, p1: str, p2: str) -> sqlite3.Row | dict | None:
        for row in self.matches:
            if self._col(row, "status") != "finished" or (self._col(row, "finish_reason") or "normal") == "test":
                continue
            if not is_group_phase(self._col(row, "phase")):
                continue
            if same_pair(p1, p2, self._col(row, "player1_name"), self._col(row, "player2_name")):
                return row
        return None

    def find_slot(self, p1: str, p2: str):
        for row in self.ko:
            p1n, p2n = self._col(row, "player1_name"), self._col(row, "player2_name")
            if not p1n or not p2n:
                continue
            if same_pair(p1, p2, p1n, p2n):
                return row
        return None

    def match_by_id(self, match_id: int):
        for row in self.matches:
            if self._col(row, "id") == match_id:
                return row
        return None

    def next_position(self, phase: str) -> int:
        pos = [int(self._col(row, "position") or 1) for row in self.ko if self._col(row, "phase") == phase]
        return (max(pos) + 1) if pos else 1


def apply_match(conn: sqlite3.Connection, store: Store, match_id: int, winner: str, tlt_sets: list[dict], phase: str, reason: str, dry: bool) -> None:
    existing = store.match_by_id(match_id)
    p1 = store._col(existing, "player1_name") if existing else winner
    sets = orient_sets(tlt_sets, sides_match(winner, p1))
    s1, s2 = set_wins(sets)
    history = json.dumps(sets, ensure_ascii=False)
    score_a, score_b = history_scores(sets)
    print(f"  MATCH #{match_id} p1={p1} -> {phase} W={winner} {s1}-{s2} {reason}")
    if dry:
        return
    conn.execute(
        """
        UPDATE matches
        SET winner_name=?, player1_sets=?, player2_sets=?, sets_history=?,
            phase=?, status='finished', finish_reason=?, updated_at=?
        WHERE id=?
        """,
        (winner, s1, s2, history, phase, reason, now_iso(), match_id),
    )
    conn.execute(
        """
        UPDATE match_history
        SET winner_name=?, sets_history=?, score_a=?, score_b=?, phase=?, finish_reason=?
        WHERE match_id=?
        """,
        (winner, history, score_a, score_b, phase, reason, match_id),
    )


def insert_match(conn: sqlite3.Connection, store: Store, p1: str, p2: str, winner: str, tlt_sets: list[dict], phase: str, reason: str, dry: bool) -> int | None:
    sets = orient_sets(tlt_sets, sides_match(winner, p1))
    s1, s2 = set_wins(sets)
    history = json.dumps(sets, ensure_ascii=False)
    score_a, score_b = history_scores(sets)
    ts = now_iso()
    print(f"  INSERT MATCH {phase} {p1} vs {p2} W={winner} {s1}-{s2}")
    if dry:
        return None
    cur = conn.execute(
        """
        INSERT INTO matches (
            court_id, player1_name, player2_name, status, tournament_id, phase, finish_reason,
            winner_name, player1_sets, player2_sets, player1_games, player2_games,
            player1_points, player2_points, sets_history, created_at, updated_at
        ) VALUES ('tlt-align', ?, ?, 'finished', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
        """,
        (p1, p2, TID, phase, reason, winner, s1, s2, history, ts, ts),
    )
    match_id = cur.lastrowid
    conn.execute(
        """
        INSERT INTO match_history (
            kort_id, ended_ts, duration_seconds, player_a, player_b, score_a, score_b,
            category, phase, match_id, stats_mode, sets_history, tournament_id, finish_reason, winner_name
        ) VALUES ('tlt-align', ?, 0, ?, ?, ?, ?, ?, ?, ?, 'standard', ?, ?, ?, ?)
        """,
        (ts, p1, p2, score_a, score_b, phase.split(" — ")[0], phase, match_id, history, TID, reason, winner),
    )
    store.matches.append({
        "id": match_id, "player1_name": p1, "player2_name": p2, "phase": phase,
        "winner_name": winner, "status": "finished", "finish_reason": reason,
    })
    return match_id


def upsert_slot(conn: sqlite3.Connection, store: Store, p1: str, p2: str, winner: str, score: str, phase: str, dry: bool) -> None:
    existing = store.find_slot(p1, p2)
    summary = score or ""
    if existing:
        print(f"  SLOT #{existing['id']} {existing['phase']} keep-phase W={winner} {summary}")
        if dry:
            return
        conn.execute(
            """
            UPDATE bracket_knockout
            SET winner_name=?, score_summary=?, player1_name=?, player2_name=?
            WHERE id=?
            """,
            (winner, summary, existing["player1_name"] or p1, existing["player2_name"] or p2, existing["id"]),
        )
        return
    position = store.next_position(phase)
    print(f"  INSERT SLOT {phase} #{position} {p1} vs {p2} W={winner} {summary}")
    if dry:
        store.ko.append({"id": -1, "phase": phase, "position": position, "player1_name": p1, "player2_name": p2, "winner_name": winner, "score_summary": summary})
        return
    cur = conn.execute(
        """
        INSERT INTO bracket_knockout
            (tournament_id, phase, position, player1_name, player2_name, winner_name, score_summary, finish_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'normal')
        """,
        (TID, phase, position, p1, p2, winner, summary),
    )
    store.ko.append({"id": cur.lastrowid, "phase": phase, "position": position, "player1_name": p1, "player2_name": p2, "winner_name": winner, "score_summary": summary})


def ensure_consolation_group(conn: sqlite3.Connection, dry: bool) -> int | None:
    row = conn.execute(
        "SELECT id FROM bracket_groups WHERE tournament_id=? AND name=?",
        (TID, "B2 Women — Consolation"),
    ).fetchone()
    if row:
        return row["id"]
    print("  INSERT GROUP B2 Women — Consolation")
    if dry:
        return None
    order = conn.execute("SELECT COALESCE(MAX(order_num),0)+1 AS n FROM bracket_groups WHERE tournament_id=?", (TID,)).fetchone()["n"]
    cur = conn.execute(
        """
        INSERT INTO bracket_groups (tournament_id, name, order_num, play_format)
        VALUES (?, 'B2 Women — Consolation', ?, 'round_robin')
        """,
        (TID, order),
    )
    return cur.lastrowid


def sync_row(conn: sqlite3.Connection, store: Store, row: dict, dry: bool) -> None:
    if row.get("is_bye") or not row.get("p1") or not row.get("p2"):
        return
    p1 = store.resolve(row["p1"])
    p2 = store.resolve(row["p2"])
    winner_tlt = row.get("winner")
    if not winner_tlt:
        return
    winner = pick_name(p1, p2, store.resolve(winner_tlt))
    tlt_sets = parse_tlt_score(row.get("score"))
    reason = "walkover" if (row.get("walkover") or not tlt_sets) else "normal"
    if not tlt_sets:
        tlt_sets = walkover_sets()

    consolation_group = (row.get("group") or "") == "GROUP 2 WOMEN CONSOLATION"
    if consolation_group:
        phase = "Grupowa"
        group_id = ensure_consolation_group(conn, dry)
        existing = store.find_group_match(p1, p2) or store.find_match(p1, p2, allow_group=True)
        if existing:
            apply_match(conn, store, existing["id"], winner, tlt_sets, phase, reason, dry)
            if not dry:
                conn.execute("UPDATE matches SET bracket_group_id=? WHERE id=?", (group_id, existing["id"]))
        else:
            match_id = insert_match(conn, store, p1, p2, winner, tlt_sets, phase, reason, dry)
            if not dry and group_id and match_id:
                conn.execute("UPDATE matches SET bracket_group_id=? WHERE id=?", (group_id, match_id))
        if not dry and group_id:
            for name in (p1, p2):
                conn.execute(
                    """
                    INSERT INTO bracket_group_players (group_id, player_name)
                    SELECT ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM bracket_group_players WHERE group_id=? AND player_name=?
                    )
                    """,
                    (group_id, name, group_id, name),
                )
        return

    if is_group_rr(row):
        return

    slot = store.find_slot(p1, p2)
    if slot:
        phase = slot["phase"]
        ins_p1 = slot["player1_name"] or p1
        ins_p2 = slot["player2_name"] or p2
        winner = pick_name(ins_p1, ins_p2, winner)
    else:
        phase = generated_phase(row)
        ins_p1, ins_p2 = p1, p2
    existing = store.find_match(p1, p2, allow_group=False)
    if existing:
        apply_match(conn, store, existing["id"], winner, tlt_sets, phase, reason, dry)
    else:
        insert_match(conn, store, ins_p1, ins_p2, winner, tlt_sets, phase, reason, dry)
    upsert_slot(conn, store, ins_p1, ins_p2, winner, row.get("score") or "", phase, dry)


def restore_group_matches(conn: sqlite3.Connection, store: Store, payload: dict, dry: bool) -> None:
    print("\n=== restore group matches eaten by knockout ===")
    for row in payload.get("tlt") or []:
        if not is_group_rr(row) or row.get("is_bye") or not row.get("p1") or not row.get("p2"):
            continue
        if not row.get("winner") or not row.get("score"):
            continue
        p1 = store.resolve(row["p1"])
        p2 = store.resolve(row["p2"])
        winner = pick_name(p1, p2, store.resolve(row["winner"]))
        tlt_sets = parse_tlt_score(row.get("score"))
        if not tlt_sets:
            continue
        existing = store.find_group_match(p1, p2)
        if existing:
            continue
        insert_match(conn, store, p1, p2, winner, tlt_sets, "Grupowa", "normal", dry)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dump", default=str(DUMP))
    args = parser.parse_args()
    dry = not args.apply
    payload = json.loads(Path(args.dump).read_text(encoding="utf-8"))
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    store = Store(conn)

    live = [row for row in store.matches if row["status"] != "finished"]
    print("live matches", [(row["id"], row["player1_name"], row["player2_name"]) for row in live])

    print("=== knockout / doubles / consolation ===")
    for row in payload.get("tlt") or []:
        sync_row(conn, store, row, dry)

    restore_group_matches(conn, store, payload, dry)

    print("\n=== extra our KO slots not on tennis.lt ===")
    tlt_ko = [
        (store.resolve(row["p1"]), store.resolve(row["p2"]))
        for row in payload.get("tlt") or []
        if row.get("p1") and row.get("p2") and not is_group_rr(row) and not row.get("is_bye")
    ]
    for slot in store.ko:
        if not slot["player1_name"] or not slot["player2_name"]:
            continue
        if any(same_pair(slot["player1_name"], slot["player2_name"], a, b) for a, b in tlt_ko):
            continue
        print(f"  DELETE SLOT #{slot['id']} {slot['phase']} {slot['player1_name']} vs {slot['player2_name']}")
        if not dry and slot["id"] and slot["id"] > 0:
            conn.execute("DELETE FROM bracket_knockout WHERE id=?", (slot["id"],))

    if not dry:
        conn.commit()
    print("APPLIED" if not dry else "DRY")


if __name__ == "__main__":
    main()
