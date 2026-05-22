from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(SCRIPT_DIR))

from create_mp_simulation import (  # noqa: E402
    DIVISIONS,
    SIMULATION_NAME,
    _find_existing_tournament,
    _group_name,
    _insert_simulation_players,
    _save_groups,
    _save_knockout_placeholders,
    create_simulation,
)
from wyniki import database  # noqa: E402


DEFAULT_ACCESS_KEY = "3mistrzostwapolskileszno"
BASE_START = datetime(2026, 4, 29, 9, 0, 0)


def _full_name(player: tuple[str, str]) -> str:
    return f"{player[0]} {player[1]}".strip()


def _player_strength(name: str) -> float:
    digest = hashlib.sha256(name.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _round_robin_schedule(players: list[str]) -> list[tuple[int, str, str]]:
    if len(players) == 3:
        pairs = [(players[0], players[1]), (players[0], players[2]), (players[1], players[2])]
        return [(idx + 1, p1, p2) for idx, (p1, p2) in enumerate(pairs)]
    if len(players) == 4:
        return [
            (1, players[0], players[1]),
            (1, players[2], players[3]),
            (2, players[0], players[2]),
            (2, players[1], players[3]),
            (3, players[0], players[3]),
            (3, players[1], players[2]),
        ]
    pairs: list[tuple[int, str, str]] = []
    for i, p1 in enumerate(players):
        for p2 in players[i + 1:]:
            pairs.append((len(pairs) + 1, p1, p2))
    return pairs


def _pick_winner(player1: str, player2: str, rng: random.Random) -> str:
    diff = _player_strength(player1) - _player_strength(player2)
    probability = max(0.22, min(0.78, 0.5 + diff * 0.42))
    return player1 if rng.random() < probability else player2


def _regular_set(winner_is_player1: bool, rng: random.Random, set_number: int) -> dict[str, Any]:
    winner_games, loser_games, tiebreak_loser = rng.choice([
        (4, 0, None),
        (4, 1, None),
        (4, 2, None),
        (5, 3, None),
        (5, 4, rng.randint(3, 6)),
    ])
    if winner_is_player1:
        player1_games, player2_games = winner_games, loser_games
    else:
        player1_games, player2_games = loser_games, winner_games
    return {
        "set_number": set_number,
        "player1_games": player1_games,
        "player2_games": player2_games,
        "tiebreak_loser_points": tiebreak_loser,
        "is_super_tiebreak": False,
    }


def _super_tiebreak(winner_is_player1: bool, rng: random.Random) -> dict[str, Any]:
    loser_points = rng.randint(5, 9)
    return {
        "set_number": 3,
        "player1_games": 1 if winner_is_player1 else 0,
        "player2_games": 0 if winner_is_player1 else 1,
        "tiebreak_loser_points": loser_points,
        "is_super_tiebreak": True,
    }


def _make_result(
    player1: str,
    player2: str,
    phase: str,
    category: str,
    rng: random.Random,
    order: int,
) -> dict[str, Any]:
    winner = _pick_winner(player1, player2, rng)
    winner_is_player1 = winner == player1
    straight_sets = rng.random() < 0.64

    sets_history: list[dict[str, Any]] = []
    if straight_sets:
        sets_history.append(_regular_set(winner_is_player1, rng, 1))
        sets_history.append(_regular_set(winner_is_player1, rng, 2))
    else:
        loser_won_first = rng.random() < 0.46
        sets_history.append(_regular_set(not winner_is_player1 if loser_won_first else winner_is_player1, rng, 1))
        sets_history.append(_regular_set(winner_is_player1 if loser_won_first else not winner_is_player1, rng, 2))
        sets_history.append(_super_tiebreak(winner_is_player1, rng))

    player1_sets = sum(1 for item in sets_history if item["player1_games"] > item["player2_games"])
    player2_sets = sum(1 for item in sets_history if item["player2_games"] > item["player1_games"])
    ended_at = BASE_START + timedelta(minutes=order * 47 + rng.randint(8, 32))
    return {
        "player1": player1,
        "player2": player2,
        "winner": winner,
        "phase": phase,
        "category": category,
        "sets_history": sets_history,
        "player1_sets": player1_sets,
        "player2_sets": player2_sets,
        "score_a": [item["player1_games"] for item in sets_history],
        "score_b": [item["player2_games"] for item in sets_history],
        "duration_seconds": rng.randint(42, 88) * 60,
        "ended_ts": ended_at.isoformat() + "Z",
    }


def _score_summary(result: dict[str, Any]) -> str:
    parts = []
    for item in result["sets_history"]:
        a = item["player1_games"]
        b = item["player2_games"]
        tb = item.get("tiebreak_loser_points")
        if item.get("is_super_tiebreak"):
            winner_points = max(10, (tb or 0) + 2)
            a, b = (winner_points, tb) if a > b else (tb, winner_points)
            parts.append(f"[{a}:{b}]")
        elif tb is not None:
            parts.append(f"{a}:{b}({tb})")
        else:
            parts.append(f"{a}:{b}")
    return "  ".join(parts)


def _group_match_plan(rng: random.Random) -> list[dict[str, Any]]:
    matches = []
    order = 0
    for division in DIVISIONS:
        label = division["label"]
        for group_key, players in division["groups"].items():
            names = [_full_name(player) for player in players]
            for round_number, player1, player2 in _round_robin_schedule(names):
                order += 1
                result = _make_result(player1, player2, "Grupowa", label, rng, order)
                result.update({"division": label, "group_key": group_key, "round": round_number, "kind": "group"})
                matches.append(result)
    return matches


def _group_standings(players: list[str], results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stats = {
        name: {"wins": 0, "losses": 0, "sets_won": 0, "sets_lost": 0, "games_won": 0, "games_lost": 0}
        for name in players
    }
    for result in results:
        p1 = result["player1"]
        p2 = result["player2"]
        if p1 not in stats or p2 not in stats:
            continue
        if result["winner"] == p1:
            stats[p1]["wins"] += 1
            stats[p2]["losses"] += 1
        else:
            stats[p2]["wins"] += 1
            stats[p1]["losses"] += 1
        stats[p1]["sets_won"] += result["player1_sets"]
        stats[p1]["sets_lost"] += result["player2_sets"]
        stats[p2]["sets_won"] += result["player2_sets"]
        stats[p2]["sets_lost"] += result["player1_sets"]
        for item in result["sets_history"]:
            if item.get("is_super_tiebreak"):
                continue
            stats[p1]["games_won"] += item["player1_games"]
            stats[p1]["games_lost"] += item["player2_games"]
            stats[p2]["games_won"] += item["player2_games"]
            stats[p2]["games_lost"] += item["player1_games"]

    rows = []
    for name, item in stats.items():
        rows.append({
            "name": name,
            **item,
            "set_diff": item["sets_won"] - item["sets_lost"],
            "game_diff": item["games_won"] - item["games_lost"],
        })
    rows.sort(key=lambda row: (row["wins"], row["set_diff"], row["game_diff"], _player_strength(row["name"])), reverse=True)
    return rows


def _standings_by_group(group_results: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    standings: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for division in DIVISIONS:
        label = division["label"]
        for group_key, players in division["groups"].items():
            names = [_full_name(player) for player in players]
            results = [item for item in group_results if item["division"] == label and item["group_key"] == group_key]
            standings[(label, group_key)] = _group_standings(names, results)
    return standings


def _slot(phase: str, position: int, player1: str, player2: str, result: dict[str, Any] | None = None) -> dict[str, Any]:
    data = {"phase": phase, "position": position, "player1_name": player1, "player2_name": player2}
    if result:
        data["winner_name"] = result["winner"]
        data["score_summary"] = _score_summary(result)
    return data


def _knockout_plan(group_results: list[dict[str, Any]], rng: random.Random, include_results: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    standings = _standings_by_group(group_results)
    slots: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    winners: dict[str, str] = {}
    order = len(group_results) + 1

    for division in DIVISIONS:
        label = division["label"]
        groups = division["groups"]
        if len(groups) != 2:
            winners[label] = standings[(label, "")][0]["name"]
            continue

        group_a = standings[(label, "A")]
        group_b = standings[(label, "B")]
        semifinal_phase = f"{label} — Półfinał"
        final_phase = f"{label} — Finał"
        third_phase = f"{label} — o 3. miejsce"
        fifth_phase = f"{label} — o 5. miejsce"
        seventh_phase = f"{label} — o 7. miejsce"
        sf1_pair = (group_a[0]["name"], group_b[1]["name"])
        sf2_pair = (group_b[0]["name"], group_a[1]["name"])

        if not include_results:
            slots.extend([
                _slot(semifinal_phase, 1, *sf1_pair),
                _slot(semifinal_phase, 2, *sf2_pair),
                _slot(final_phase, 1, "Zwycięzca PF1", "Zwycięzca PF2"),
                _slot(third_phase, 1, "Przegrany PF1", "Przegrany PF2"),
            ])
            if len(group_a) > 2 and len(group_b) > 2:
                slots.append(_slot(fifth_phase, 1, group_a[2]["name"], group_b[2]["name"]))
            if len(group_a) > 3 and len(group_b) > 3:
                slots.append(_slot(seventh_phase, 1, group_a[3]["name"], group_b[3]["name"]))
            continue

        sf1 = _make_result(*sf1_pair, semifinal_phase, label, rng, order)
        sf1.update({"kind": "knockout"})
        order += 1
        sf2 = _make_result(*sf2_pair, semifinal_phase, label, rng, order)
        sf2.update({"kind": "knockout"})
        order += 1
        sf1_loser = sf1["player2"] if sf1["winner"] == sf1["player1"] else sf1["player1"]
        sf2_loser = sf2["player2"] if sf2["winner"] == sf2["player1"] else sf2["player1"]
        final = _make_result(sf1["winner"], sf2["winner"], final_phase, label, rng, order)
        final.update({"kind": "knockout"})
        order += 1
        third = _make_result(sf1_loser, sf2_loser, third_phase, label, rng, order)
        third.update({"kind": "knockout"})
        order += 1

        results.extend([sf1, sf2, final, third])
        slots.extend([
            _slot(semifinal_phase, 1, sf1["player1"], sf1["player2"], sf1),
            _slot(semifinal_phase, 2, sf2["player1"], sf2["player2"], sf2),
            _slot(final_phase, 1, final["player1"], final["player2"], final),
            _slot(third_phase, 1, third["player1"], third["player2"], third),
        ])

        if len(group_a) > 2 and len(group_b) > 2:
            fifth = _make_result(group_a[2]["name"], group_b[2]["name"], fifth_phase, label, rng, order)
            fifth.update({"kind": "knockout"})
            order += 1
            results.append(fifth)
            slots.append(_slot(fifth_phase, 1, fifth["player1"], fifth["player2"], fifth))
        if len(group_a) > 3 and len(group_b) > 3:
            seventh = _make_result(group_a[3]["name"], group_b[3]["name"], seventh_phase, label, rng, order)
            seventh.update({"kind": "knockout"})
            order += 1
            results.append(seventh)
            slots.append(_slot(seventh_phase, 1, seventh["player1"], seventh["player2"], seventh))
        winners[label] = final["winner"]

    return slots, results, winners


def _insert_results(tournament_id: int, results: list[dict[str, Any]]) -> None:
    with database.db_conn() as conn:
        cursor = conn.cursor()
        for index, result in enumerate(results, start=1):
            court_id = f"SIM-{(index % 6) + 1}"
            cursor.execute(
                """
                INSERT INTO matches (
                    court_id, player1_name, player2_name, status, tournament_id, phase,
                    player1_sets, player2_sets, player1_games, player2_games,
                    sets_history, created_at, updated_at
                ) VALUES (?, ?, ?, 'finished', ?, ?, ?, ?, 0, 0, ?, ?, ?)
                """,
                (
                    court_id,
                    result["player1"],
                    result["player2"],
                    tournament_id,
                    result["phase"],
                    result["player1_sets"],
                    result["player2_sets"],
                    json.dumps(result["sets_history"], ensure_ascii=False),
                    result["ended_ts"],
                    result["ended_ts"],
                ),
            )
            match_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO match_history (
                    kort_id, ended_ts, duration_seconds, player_a, player_b, score_a, score_b,
                    category, phase, match_id, stats_mode, sets_history, tournament_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    court_id,
                    result["ended_ts"],
                    result["duration_seconds"],
                    result["player1"],
                    result["player2"],
                    json.dumps(result["score_a"]),
                    json.dumps(result["score_b"]),
                    result["category"],
                    result["phase"],
                    match_id,
                    "basic",
                    json.dumps(result["sets_history"], ensure_ascii=False),
                    tournament_id,
                ),
            )
        conn.commit()


def _find_tournament(name: str) -> dict[str, Any] | None:
    for tournament in database.fetch_tournaments():
        if tournament.get("name") == name:
            return tournament
    return None


def _ensure_base_tournament(access_key: str) -> dict[str, Any]:
    base = _find_existing_tournament()
    if base:
        return base
    args = argparse.Namespace(
        replace=False,
        start_date="2026-04-29",
        end_date="2026-12-31",
        city="",
        report_email="",
        access_key=access_key,
        courts=0,
    )
    create_simulation(args)
    base = _find_existing_tournament()
    if not base:
        raise RuntimeError("Base simulation tournament was not created")
    return base


def _create_stage_tournament(stage: int, access_key: str, replace: bool) -> int:
    name = f"{SIMULATION_NAME} — etap {stage}"
    existing = _find_tournament(name)
    if existing:
        if int(existing.get("is_simulation") or 0) != 1:
            raise RuntimeError(f"Refusing to replace non-simulation tournament id={existing['id']}")
        if replace:
            database.delete_tournament(existing["id"])
        else:
            return existing["id"]

    tournament_id = database.insert_tournament(
        name,
        "2026-04-29",
        "2026-12-31",
        active=False,
        country="PL",
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key=access_key,
    )
    if not tournament_id:
        raise RuntimeError(f"Failed to create stage tournament {stage}")
    player_ids = _insert_simulation_players(tournament_id)
    _save_groups(tournament_id, player_ids)
    return tournament_id


def seed_stages(args: argparse.Namespace) -> int:
    database.init_db()
    access_key = args.access_key or DEFAULT_ACCESS_KEY
    base = _ensure_base_tournament(access_key)

    rng = random.Random(args.seed)
    group_results = _group_match_plan(rng)
    stage2_results = [item for item in group_results if item["round"] <= 2]
    stage3_slots, _, _ = _knockout_plan(group_results, random.Random(f"{args.seed}:stage3"), include_results=False)
    stage4_slots, knockout_results, winners = _knockout_plan(group_results, random.Random(f"{args.seed}:stage4"), include_results=True)

    stage2_id = _create_stage_tournament(2, access_key, replace=not args.keep_existing)
    _save_knockout_placeholders(stage2_id)
    _insert_results(stage2_id, stage2_results)

    stage3_id = _create_stage_tournament(3, access_key, replace=not args.keep_existing)
    if not database.save_bracket_knockout(stage3_id, stage3_slots):
        raise RuntimeError("Failed to save stage 3 knockout slots")
    _insert_results(stage3_id, group_results)

    stage4_id = _create_stage_tournament(4, access_key, replace=not args.keep_existing)
    if not database.save_bracket_knockout(stage4_id, stage4_slots):
        raise RuntimeError("Failed to save stage 4 knockout slots")
    _insert_results(stage4_id, [*group_results, *knockout_results])

    print(f"base_id={base['id']} name={base['name']}")
    print(f"stage2_id={stage2_id} group_matches={len(stage2_results)}")
    print(f"stage3_id={stage3_id} group_matches={len(group_results)}")
    print(f"stage4_id={stage4_id} group_matches={len(group_results)} knockout_matches={len(knockout_results)}")
    print("winners:")
    for label in sorted(winners):
        print(f"- {label}: {winners[label]}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed deterministic staged results for the private MP simulation.")
    parser.add_argument("--access-key", default=DEFAULT_ACCESS_KEY)
    parser.add_argument("--seed", default="symulacja-3-mp-2026")
    parser.add_argument("--keep-existing", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(seed_stages(parse_args()))