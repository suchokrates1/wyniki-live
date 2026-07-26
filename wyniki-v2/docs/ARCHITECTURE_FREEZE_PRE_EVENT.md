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

- Android versionName / versionCode:
- Backend git SHA on minipc:
- Frontend build date:
