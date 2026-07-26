# Architecture freeze (T4 — pre-event)

## Frozen

- Umpire ↔ backend JSON contract (create/update/finish/events/stats)
- Scoring algorithm / reducers (Android) — tylko świadome bugfixy
- Schema migracje DB — zakaz w tygodniu eventu
- Refaktor struktury FE/BE/Android — zakaz; tylko hotfixy, copy, drobne UX/a11y

## Allowed

- Hotfixy produkcyjne (auth, standings, sync, crash)
- Copy / tłumaczenia
- Drobne UX bez przebudowy architektury
- Ops: backup, smoke, Play review, track uploads

## Process rule (po każdym większym PR)

```powershell
$env:E2E_BASE_URL = 'http://192.168.31.5:18087'
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
python scripts/e2e_tournament/run.py full --skip-android
# Gdy AVD żyje:
python scripts/e2e_tournament/run.py full
# lub: android-tennis-referee\scripts\run_parallel_courts.ps1
```

Cel: `full --skip-android` zielony w &lt; 2 min. Android wave nie blokuje merge, gdy brak urządzenia.

## Pre-flight (podpisz przed startem)

| Check | Status | Notes |
|-------|--------|-------|
| `deploy.py status` | OK 2026-07-26 | all tracks `1.0.0-dev.24` / `100024` |
| `/health` + snapshot | OK | prod + e2e healthy; snapshot via `/api/snapshot` |
| Public 6 języków | OK | browser; `verify:production` may show third-party pageerror |
| Office login + SSE | OK | rehearsal path documented; smoke via E2E modules |
| Admin login + office tab SSE | OK | same |
| Umpire authorize → match flow | OK | PIN path E2E + MultiCourt wave |
| Offline outbox tablet | OK | SyncStatus.OFFLINE + outbox flush |
| DB backup + restore path known | OK | `wyniki-data-20260726T123251Z.tar.gz` |
| Play API 36 review sent | OK | auto-review; confirm Publishing overview if pending |
| Golden APK on production track | OK | `100024` completed on production |

**Pre-flight signed:** 2026-07-26 (operator + AI rehearsal).

## Golden versions (fill at freeze)

- Android versionName / versionCode: `1.0.0-dev.24` / `100024` (all tracks aligned)
- Backend git SHA on minipc: `62bea90`
- Frontend build: Docker image from `62bea90` (2026-07-26)
- DB backup: `/home/suchokrates1/wyniki-backups/wyniki/wyniki-data-20260726T123251Z.tar.gz`
- Play review: auto-review active on commit (no `changesNotSentForReview`); confirm Publishing overview if any item still pending
- Public UI: browser OK; `npm run verify:production` may report pageerror `reading 'after'` (likely third-party analytics) — API smoke OK

## Keystore / signing ops

Checklist: `~/.config/infrastructure/keystore-rotation-checklist.md`

- Local signing props present in `android-tennis-referee/local.properties` (not committed)
- Full password rotation / Vault rewrite: **świadomie odroczone** do sesji air-gapped (Play App Signing w użyciu)
- Upload keystore file itself was not rotated; local password copies verified present for release builds

## Related

- Quality gate: [`QUALITY_GATE.md`](QUALITY_GATE.md)
- Court auth grace: [`COURT_AUTH_GRACE_PLAN.md`](COURT_AUTH_GRACE_PLAN.md)
- Pre-event week: [`PRE_EVENT_FREEZE.md`](PRE_EVENT_FREEZE.md)
- Runbook: [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md)
