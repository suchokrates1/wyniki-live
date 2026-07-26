# Mapa podziału `database.py` (T0 checklist → T2)

Cel T2: fizyczny split do `wyniki/database/` z fasadą re-export w `wyniki/database/__init__.py`
(nie można mieć jednocześnie `database.py` i pakietu `database/`).
Nowe funkcje tylko w modułach; fasada nie rośnie poza re-exportami.

## Moduły docelowe

| Moduł | Zakres (przykładowe symbole) |
|-------|------------------------------|
| `connection.py` | `db_conn`, `init_db`, ustawienia aplikacji (`fetch_app_settings`, `upsert_app_settings`) |
| `courts.py` | `fetch_courts*`, `fetch_court`, `insert_court`, `upsert_court`, `delete_court`, `rename_court`, `get_tournament_id_for_court`, `create_tournament_courts`, `sync_tournament_courts` |
| `tournaments.py` | `fetch_tournament*`, `insert_tournament`, `update_tournament`, `delete_tournament`, `set_active_tournament*`, `get_active_tournament_*`, `mark_tournament_summary_sent`, quick-info |
| `players.py` | `fetch_players*`, `insert_player`, `update_player`, `delete_player`, bulk insert, global player sync helpers |
| `schedule.py` | `fetch_tournament_schedule`, `upsert_tournament_schedule_entries`, `update/delete` schedule, `link_schedule_to_match`, `ensure_group_schedule_entries`, `ensure_knockout_schedule_entries`, `ensure_group_rematch_schedule_entries` |
| `brackets.py` | bracket detect/seed/advance, knockout slot builders, `maybe_generate_knockout_from_completed_groups`, `advance_knockout`, phase helpers (`is_group_stage_phase`, `normalize_group_stage_phase`, …) |
| `categories.py` | `fetch_tournament_categories`, confirm/insert/update/delete category, migrate legacy, planning mixed bands |
| `history.py` | `insert_match_history`, `delete_latest_history_entry`, `fetch_match_history` |

## Reguły przenosin

1. Commit „move only” — bez zmiany sygnatur i zachowania.
2. `from wyniki.database import X` działa dalej przez fasadę.
3. Wewnętrzne `_helper` mogą zostać w module właścicielskim; fasada eksportuje tylko to, co importują API/serwisy.
4. Po splitcie: nowe mutacje preferują SQLAlchemy / serwisy; raw SQL tylko w DAL.

## Status checklisty

- [x] Mapa odpowiedzialności spisana (T0)
- [x] Fizyczny split + fasada (T2)
- [x] Smoke importów / testy lifecycle (T2)
