# Architecture Freeze - May 2026

## Goal

Lock the production shape of the scoring stack before the first live tournament window at the end of May 2026.

This is not a feature freeze for content or operational configuration. It is a freeze on structural changes that can destabilize live scoring, sync, overlays, or recovery procedures.

## Frozen Baseline

- Android app baseline: `35e1911` `v16: add emulator tournament E2E`
- Backend baseline: `ca3cb3e` `Strengthen backend domain boundaries`

## Frozen Areas

- Match scoring rules and point progression logic.
- Match synchronization contract between Android and backend.
- Database schema shape for tournaments, players, matches, history, and global players.
- Court state payloads used by live views, overlays, and SSE.
- Deployment topology: `minipc` + Docker Compose + `/data` volume.
- Recovery path: SSH deploy, volume backup, restore, smoke check.

## Allowed Changes Until Tournament

- Bug fixes with a reproducible failure and a narrow regression test.
- UI text, copy, layout polish, and non-structural Android UX cleanup.
- Operational docs, runbooks, backup automation, smoke tests, monitoring.
- Safe observability changes: logs, health checks, diagnostics.
- Tournament content updates: players, courts, overlays, schedule data.

## Changes That Require Explicit Re-approval

- New persistence layer or ORM migration.
- Large refactor of scoring engine or match lifecycle.
- Changes to API request or response contracts used by Android.
- Renaming core fields in `MatchState`, `/api/matches`, `/api/snapshot`, or history records.
- Reworking deployment topology, container names, ports, or volume layout.
- Any change that would require data migration on the live database.

## Change Control Rule

Every backend or Android change after this freeze must satisfy all of the following:

1. The bug or risk is concrete and reproducible.
2. The changed surface is the smallest possible one.
3. At least one targeted regression check exists.
4. Deployment and rollback steps are unchanged or explicitly updated.

## Exit Criteria Before Tournament

- Backup script runs successfully against production.
- Smoke test passes against production.
- Android emulator E2E passes against `score.vestmedia.pl`.
- Backend regression suite passes locally.
- Runbook and checklist are current.