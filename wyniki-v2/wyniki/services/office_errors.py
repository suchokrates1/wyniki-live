"""A stable code for each refusal the office can cause by what was typed or clicked.

The office runs in seven languages and used to show the server's English sentence as it
came. The sentence stays in the body under "error" (logs, scripts, older pages); the code
goes next to it under "code", and the office page shows its own text for that code.

Only refusals a person at the office desk can act on are listed. A message that points
at a bug in the page ("schedule_id is required") has no code and the page falls back to
its own "could not save" text.
"""
from __future__ import annotations

OFFICE_ERROR_CODES: dict[str, str] = {
    # entering a result
    "Set score is not readable": "set_not_readable",
    "Set scores must not skip a set": "set_skipped",
    "Set scores cannot be negative": "set_negative",
    "Set cannot end in a draw": "set_draw",
    "At least one finished set is required": "no_finished_set",
    "Match winner is required": "winner_required",
    "Winner is required for walkover": "walkover_winner_required",
    "Retired player must be one of the match players": "retired_player_invalid",
    # the result is already there
    "This group match already has a result. Edit the existing result instead.": "result_exists",
    "This knockout match already has a result. Edit the existing result instead.": "result_exists",
    "This knockout slot already has a result. Edit the existing result instead.": "result_exists",
    "This schedule slot already has a linked match. Edit the existing result instead.": "slot_has_match",
    # who plays
    "Both players must belong to the selected group": "players_not_in_group",
    "Group and two different players are required": "group_players_required",
    "Knockout slot does not have two confirmed players yet": "knockout_slot_not_ready",
    "Players must match the generated knockout slot": "knockout_players_mismatch",
    # the thing was removed in the meantime
    "Match not found": "match_not_found",
    "Schedule entry not found": "schedule_entry_not_found",
    "Group not found": "group_not_found",
    "Knockout slot not found": "knockout_slot_not_found",
    "Team not found": "team_not_found",
}


def office_error_code(message: object) -> str | None:
    """The code for a refusal text, or None when the text has none."""
    return OFFICE_ERROR_CODES.get(str(message or "").strip())
