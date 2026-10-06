"""Copy one tournament, with everything hanging off it, from one Wyniki SQLite file into another.

For filling a test stack with a real tournament (Wilno 2026 on test.blindtennis.app):

    python scripts/copy_tournament.py SOURCE.sqlite3 TARGET.sqlite3 31 [--name "Wilno 2026 (kopia)"]

Every id is renumbered in the target; court ids become t<new id>-<n>; global players are matched
by name or added. Overlay ids, live snapshots and device state never travel. The target should be
a copy taken while its app is stopped, or a backup restored afterwards.
"""
from __future__ import annotations

import argparse
import re
import sqlite3
from typing import Any
from collections.abc import Callable


def columns(db: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]


def has_table(db: sqlite3.Connection, table: str) -> bool:
    return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone())


class Copier:
    def __init__(self, src: sqlite3.Connection, dst: sqlite3.Connection, tid: int):
        self.src, self.dst, self.tid = src, dst, tid
        self.ids: dict[str, dict[Any, Any]] = {}
        self.new_tid: int | None = None

    def map(self, table: str, old: Any) -> Any:
        if old is None:
            return None
        return self.ids.get(table, {}).get(old, old if table == 'keep' else None)

    def court(self, kort_id: Any) -> Any:
        if not kort_id:
            return kort_id
        return re.sub(rf'^t{self.tid}-', f't{self.new_tid}-', str(kort_id))

    def copy_rows(self, table: str, where: str, args: tuple, fix: dict[str, Callable[[dict], Any]] | None = None,
                  key: str = 'id') -> int:
        if not has_table(self.src, table) or not has_table(self.dst, table):
            return 0
        src_cols = columns(self.src, table)
        dst_cols = set(columns(self.dst, table))
        rows = self.src.execute(f'SELECT * FROM "{table}" WHERE {where}', args).fetchall()
        mapping = self.ids.setdefault(table, {})
        for row in rows:
            data = dict(zip(src_cols, row))
            for column, fn in (fix or {}).items():
                if column in data:
                    data[column] = fn(data)
            old = data.pop(key, None) if key == 'id' else data.get(key)
            names = [c for c in data if c in dst_cols]
            cursor = self.dst.execute(
                f'INSERT INTO "{table}" ({", ".join(chr(34) + c + chr(34) for c in names)}) VALUES ({", ".join("?" for _ in names)})',
                [data[c] for c in names],
            )
            if key == 'id':
                mapping[old] = cursor.lastrowid
        return len(rows)

    def global_player(self, old_id: Any) -> Any:
        if old_id is None:
            return None
        known = self.ids.setdefault('global_players', {})
        if old_id in known:
            return known[old_id]
        cols = columns(self.src, 'global_players')
        row = self.src.execute('SELECT * FROM global_players WHERE id = ?', (old_id,)).fetchone()
        if not row:
            return None
        data = dict(zip(cols, row))
        found = self.dst.execute(
            'SELECT id FROM global_players WHERE first_name = ? AND last_name = ?',
            (data.get('first_name'), data.get('last_name')),
        ).fetchone()
        if found:
            known[old_id] = found[0]
        else:
            data.pop('id')
            names = [c for c in data if c in set(columns(self.dst, 'global_players'))]
            cursor = self.dst.execute(
                f'INSERT INTO global_players ({", ".join(names)}) VALUES ({", ".join("?" for _ in names)})',
                [data[c] for c in names],
            )
            known[old_id] = cursor.lastrowid
        return known[old_id]

    def run(self, name: str | None) -> dict[str, int]:
        counts: dict[str, int] = {}
        t = self.tid
        counts['tournaments'] = self.copy_rows('tournaments', 'id = ?', (t,), {
            'name': lambda d: name or d['name'],
            'active': lambda d: 0,
            'access_key': lambda d: '',
        })
        self.new_tid = self.ids['tournaments'][t]
        nt = self.new_tid
        tour = lambda d: nt  # noqa: E731
        counts['tournament_categories'] = self.copy_rows('tournament_categories', 'tournament_id = ?', (t,), {'tournament_id': tour})
        counts['players'] = self.copy_rows('players', 'tournament_id = ?', (t,), {
            'tournament_id': tour, 'global_player_id': lambda d: self.global_player(d['global_player_id'])})
        counts['tournament_teams'] = self.copy_rows('tournament_teams', 'tournament_id = ?', (t,), {
            'tournament_id': tour,
            'category_id': lambda d: self.map('tournament_categories', d['category_id']),
            'player1_id': lambda d: self.map('players', d['player1_id']),
            'player2_id': lambda d: self.map('players', d['player2_id'])})
        counts['courts'] = self.copy_rows('courts', 'tournament_id = ?', (t,), {
            'tournament_id': tour, 'kort_id': lambda d: self.court(d['kort_id']), 'overlay_id': lambda d: None}, key='kort_id')
        counts['bracket_groups'] = self.copy_rows('bracket_groups', 'tournament_id = ?', (t,), {
            'tournament_id': tour,
            'tournament_category_id': lambda d: self.map('tournament_categories', d['tournament_category_id'])})
        group_ids = tuple(self.ids.get('bracket_groups', {}).keys()) or (-1,)
        counts['bracket_group_players'] = self.copy_rows(
            'bracket_group_players', f'group_id IN ({",".join("?" for _ in group_ids)})', group_ids, {
                'group_id': lambda d: self.map('bracket_groups', d['group_id']),
                'player_id': lambda d: self.map('players', d['player_id']),
                'team_id': lambda d: self.map('tournament_teams', d['team_id'])})
        counts['bracket_knockout'] = self.copy_rows('bracket_knockout', 'tournament_id = ?', (t,), {'tournament_id': tour})
        counts['category_start_numbers'] = self.copy_rows('category_start_numbers', 'tournament_id = ?', (t,), {
            'tournament_id': tour,
            'category_id': lambda d: self.map('tournament_categories', d['category_id']),
            'competitor_id': lambda d: self.map('tournament_teams' if d.get('kind') == 'team' else 'players', d['competitor_id'])})
        cat_ids = tuple(self.ids.get('tournament_categories', {}).keys()) or (-1,)
        counts['category_start_number_counters'] = self.copy_rows(
            'category_start_number_counters', f'category_id IN ({",".join("?" for _ in cat_ids)})', cat_ids, {
                'category_id': lambda d: self.map('tournament_categories', d['category_id'])}, key='category_id')
        source_ref = {'group': 'bracket_groups', 'knockout': 'bracket_knockout'}
        counts['tournament_schedule'] = self.copy_rows('tournament_schedule', 'tournament_id = ?', (t,), {
            'tournament_id': tour,
            'court_id': lambda d: self.court(d['court_id']),
            'bracket_group_id': lambda d: self.map('bracket_groups', d['bracket_group_id']),
            'source_ref_id': lambda d: self.map(source_ref.get(d.get('source_type'), 'keep'), d['source_ref_id']),
            'match_id': lambda d: None})
        counts['matches'] = self.copy_rows('matches', 'tournament_id = ?', (t,), {
            'tournament_id': tour,
            'court_id': lambda d: self.court(d['court_id']),
            'bracket_group_id': lambda d: self.map('bracket_groups', d['bracket_group_id']),
            'schedule_id': lambda d: self.map('tournament_schedule', d['schedule_id'])})
        for old_sched, old_match in self.src.execute(
                'SELECT id, match_id FROM tournament_schedule WHERE tournament_id = ? AND match_id IS NOT NULL', (t,)):
            self.dst.execute('UPDATE tournament_schedule SET match_id = ? WHERE id = ?',
                             (self.map('matches', old_match), self.map('tournament_schedule', old_sched)))
        counts['match_history'] = self.copy_rows('match_history', 'tournament_id = ?', (t,), {
            'tournament_id': tour, 'kort_id': lambda d: self.court(d['kort_id']),
            'match_id': lambda d: self.map('matches', d['match_id'])})
        match_ids = tuple(self.ids.get('matches', {}).keys()) or (-1,)
        counts['match_statistics'] = self.copy_rows(
            'match_statistics', f'match_id IN ({",".join("?" for _ in match_ids)})', match_ids, {
                'match_id': lambda d: self.map('matches', d['match_id'])})
        for table in ('player_classifications', 'classification_reviews'):
            counts[table] = self.copy_rows(table, 'tournament_id = ?', (t,), {
                'tournament_id': tour, 'global_player_id': lambda d: self.global_player(d['global_player_id'])})
        return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('source')
    parser.add_argument('target')
    parser.add_argument('tournament_id', type=int)
    parser.add_argument('--name')
    args = parser.parse_args()
    src = sqlite3.connect(args.source)
    dst = sqlite3.connect(args.target)
    copier = Copier(src, dst, args.tournament_id)
    with dst:
        counts = copier.run(args.name)
    print(f'tournament {args.tournament_id} -> {copier.new_tid}')
    for table, count in counts.items():
        print(f'  {table}: {count}')


if __name__ == '__main__':
    main()
