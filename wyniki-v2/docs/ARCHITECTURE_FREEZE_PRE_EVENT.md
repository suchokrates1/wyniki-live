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

## Pre-flight (podpisz przed startem)

| Check | Status | Notes |
|-------|--------|-------|
| `deploy.py status` | | |
| `/health` + snapshot | | |
| Public 6 języków | | |
| Office login + SSE | | |
| Admin login + office tab SSE | | |
| Umpire authorize → match flow | | |
| Offline outbox tablet | | |
| DB backup + restore path known | | |
| Play API 36 review sent | | |
| Golden APK on production track | | |

## Golden versions (fill at freeze)

- Android versionName / versionCode: `1.0.0-dev.24` / `100024` (production+beta); internal/alpha still `100023` (same feature set minus bump)
- Backend git SHA on minipc: `2d77867`
- Frontend build: Docker image from `2d77867` (2026-07-26)
- DB backup: `/home/suchokrates1/wyniki-backups/wyniki/wyniki-data-20260726T123251Z.tar.gz`
- Play review: auto-review active on commit (no `changesNotSentForReview`); confirm Publishing overview if any item still pending
- Public UI: browser OK; `npm run verify:production` may report pageerror `reading 'after'` (likely third-party analytics) — API smoke OK
