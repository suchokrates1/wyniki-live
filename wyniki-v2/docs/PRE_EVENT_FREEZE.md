# Faza D — Pre-event freeze (ostatni tydzień)

Jak T4: **tylko** hotfixy, smoke, backup, Play tracks. Zero refaktoru strukturalnego (C1–C3), zero migracji schematu, zero zmian kontraktu umpire JSON / reducerów scoringu poza krytycznym bugfixem.

## Dozwolone

- Hotfix crash / auth / standings / sync
- Copy / a11y drobne
- `deploy.py` backend hotfix + Play track upload
- Backup + weryfikacja restore path
- Smoke: `prod_smoke.py`, office/public, jeden kort PIN→finish

## Zakazane

- DAL / FE / Android structure splits
- Nowe feature E2E / seed scenariusze (chyba że smoke regresji hotfixu)
- React / Compose / ORM big-bang
- Grace auth experiments na produkcji w dniu −1 bez rollback planu

## Rutyna dnia

| Dzień | Akcja |
|-------|--------|
| T−7 | Podpisz pre-flight w `ARCHITECTURE_FREEZE_PRE_EVENT.md`; `full --skip-android` |
| T−3 | Backup; Android wave jeśli AVD; sprawdź grace plan |
| T−1 | Backup; `deploy.py status`; zero otwartych P0 |
| T−0 | `/health` + snapshot; jeden kort smoke; **freeze** |

## Po AI / PR w tygodniu freeze

Każda zmiana → `python scripts/e2e_tournament/run.py full --skip-android` i raport padającego modułu przed merge/deploy.

## Checklist szczegółowy

Patrz `TOURNAMENT_READINESS_CHECKLIST.md` + sekcja Pre-event w `PRODUCTION_RUNBOOK.md`.
