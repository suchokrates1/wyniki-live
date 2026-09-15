"""Record the sport classes a tournament's classification gave its players.

Every player who played outside their class in that tournament gets the class of the
category they played in (the same as "Zmiana klasy" in the admin review). Players in a
category open to more than one class ("B3/4 Mixed") are listed and left for the admin.

Dry run by default; --apply writes. Run inside the app container:
    python scripts/apply_tournament_classifications.py --tournament-id <id> [--apply]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wyniki import database  # noqa: E402
from wyniki.database import classifications  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tournament-id", type=int, required=True)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: only list them)")
    args = parser.parse_args()

    database.init_db()
    review = classifications.classification_review(args.tournament_id)
    decisions = []
    for item in review["items"]:
        if item["decision"]:
            print(f"already decided  #{item['global_player_id']}: {item['decision']} {item['classification']}")
            continue
        name = f"{item['first_name']} {item['last_name']}"
        if not item["suggested_class"]:
            print(f"left for admin   #{item['global_player_id']} {name}: class {item['entry_class'] or item['current_class']} in {item['category_label']}")
            continue
        print(f"reclassify       #{item['global_player_id']} {name}: {item['entry_class'] or item['current_class']} -> {item['suggested_class']} ({item['category_label']})")
        decisions.append({"global_player_id": item["global_player_id"], "decision": "reclassify", "classification": item["suggested_class"]})

    if not args.apply:
        print(f"dry run: {len(decisions)} change(s); add --apply to write them")
        return 0
    if not decisions:
        print("nothing to apply")
        return 0
    result = classifications.apply_classification_decisions(args.tournament_id, decisions)
    print(f"applied: {len(result['applied'])}, errors: {result['errors']}, still pending: {result['review']['pending']}")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
