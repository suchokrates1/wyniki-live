# Tournament Readiness Checklist

## Two Weeks Before

- Confirm architecture freeze is in effect.
- Confirm backend baseline commit on production matches intended release.
- Confirm Android release build installed on all umpire devices.
- Verify all courts, PINs, tournaments, and overlays are configured.
- Confirm backup disk on `minipc` is mounted and writable.
- Run backend regression suite locally.
- Run Android emulator E2E against production.

## One Week Before

- Create a fresh production backup and verify the archive exists.
- Run production smoke test and archive its result.
- Verify SSL, domain routing, and `/health` and `/api/snapshot` responses.
- Confirm dashboard, admin panel, live overlays, and history screens load.
- Verify at least one full dry-run from court selection to finished match.

## 24 Hours Before

- Freeze non-critical deployments.
- Confirm current production commit hashes for backend and Android.
- Verify `docker ps` and container health on `minipc`.
- Create another production backup.
- Check free space on `/data` and `/mnt/dysk12tb`.
- Confirm tournament player lists and bracket data are final.
- Confirm spare device, charger, network, and hotspot availability.

## On Match Day - Before First Match

- Run production smoke test.
- Verify admin court list and active tournament visibility.
- Verify at least one umpire device can authorize a court with PIN.
- Verify player loading, match creation, live score updates, and finish flow.
- Verify history entry and statistics persist after finishing a test match.
- Remove all `E2E-*` artifacts after rehearsal.

## During Tournament

- No structural backend changes.
- No schema changes.
- Only narrow bug fixes with rollback path.
- Backup immediately after any emergency deployment.
- Keep one operator focused on logs and health checks.

## After Each Day

- Export or note any incidents and reproduction steps.
- Create end-of-day backup.
- Review logs for errors, failed sync, and repeated retries.
- Confirm next-day court and player data are still correct.

## After Tournament

- Create final backup.
- Archive rehearsal notes, incidents, and fixes.
- Decide which emergency patches should become permanent cleanup work.