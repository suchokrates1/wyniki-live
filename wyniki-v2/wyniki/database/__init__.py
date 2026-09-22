"""Database access layer for v2 (package facade)."""
from __future__ import annotations


from .connection import (
    db_conn,
    init_db,
    fetch_app_settings,
    upsert_app_settings,
    _utc_now,
)

from .courts import (
    fetch_courts,
    fetch_courts_for_tournament,
    get_tournament_id_for_court,
    insert_court,
    upsert_court,
    delete_court,
    rename_court,
    create_tournament_courts,
    sync_tournament_courts,
)

from .tournaments import (
    get_active_tournament_id,
    get_active_tournament_name,
    fetch_active_tournaments,
    fetch_umpire_active_tournaments,
    fetch_tournaments,
    fetch_tournament,
    insert_tournament,
    update_tournament,
    mark_tournament_summary_sent,
    delete_tournament,
    set_active_tournament,
    set_tournament_active_state,
    get_tournament_quick_info,
    save_tournament_quick_info,
    get_public_tournament_quick_info,
)

from .players import (
    _player_surname,
    fetch_players,
    fetch_players_for_active_tournaments,
    insert_player,
    update_player,
    delete_player,
    bulk_insert_players,
)

from .schedule import (
    set_schedule_entry_court,
    DEFAULT_GROUP_SCHEDULE_NOTE_PL,
    apply_schedule_notes,
    ensure_group_rematch_schedule_entries,
    _schedule_entry_is_unplaced,
    _schedule_match_result,
    fetch_tournament_schedule,
    find_suggested_schedule_match,
    build_public_schedule_payload,
    upsert_tournament_schedule_entries,
    update_tournament_schedule_entry,
    delete_tournament_schedule_entry,
    publish_tournament_schedule,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    link_schedule_to_match,
    unlink_schedule_from_match,
    get_autoscheduler_config,
    save_autoscheduler_config,
    reflow_placed_schedule,
    generate_autoschedule_proposal,
    apply_autoschedule_placements,
    group_schedule_replace_hint,
    replace_unplayed_group_schedule,
    move_schedule_entry_with_cascade,
    unassign_schedule_entry,
    delete_unassigned_schedule_entries,
    clear_schedule_day,
    clear_removed_fixtures,
)

from .brackets import (
    detect_bracket_context,
    _split_bracket_label,
    GROUP_PHASE,
    GROUP_REMATCH_PHASE,
    normalize_group_stage_phase,
    is_group_stage_phase,
    is_knockout_stage_phase,
    expected_group_matches_count,
    count_finished_group_matches,
    count_group_knockout_progress,
    _is_knockout_placeholder_name,
    _compute_provisional_knockout_slots_from_bracket,
    seed_knockout_rematch_for_groups,
    _compute_knockout_slots_from_bracket,
    seed_provisional_knockout_from_groups,
    maybe_generate_knockout_from_completed_groups,
    advance_knockout,
    correct_knockout_result,
    knockout_correction_blocker,
    swap_knockout_players,
    save_bracket_groups,
    fetch_bracket_groups,
    _find_group_matches,
    save_bracket_knockout,
    fetch_bracket_knockout,
    _detect_knockout_result,
    get_full_bracket,
    generate_knockout_from_standings,
)

from .categories import (
    fetch_tournament_categories,
    fetch_tournament_category,
    confirm_tournament_categories,
    insert_tournament_category,
    update_tournament_category,
    delete_tournament_category,
    migrate_tournament_categories_from_legacy,
    get_mixed_categories,
    get_planning_mixed_bands,
    clear_legacy_mixed_categories,
    set_mixed_categories,
)

from .teams import (
    TeamConflictError,
    TeamValidationError,
    fetch_tournament_teams,
    fetch_tournament_team,
    insert_tournament_team,
    delete_tournament_team,
)

from .court_streams import (
    StreamUrlError,
    attach_watch_url,
    fetch_watch_urls_for_date,
    get_tournament_court_streams,
    save_tournament_court_streams,
    today_warsaw,
)

from .start_numbers import (
    assign_start_numbers,
    fetch_start_numbers,
)

from .knockout_formats import (
    confirm_all_knockout_formats,
    knockout_format_overview,
    save_knockout_format,
)

from .history import (
    insert_match_history,
    delete_latest_history_entry,
    fetch_match_history,
)
