# Production Runbook

## Scope

This runbook covers the live backend on `minipc` for `score.vestmedia.pl`.

## Service Identity

- Host: `minipc`
- Project path: `/home/suchokrates1/count/wyniki-v2`
- Compose service: `wyniki`
- Container: `wyniki-tenis-v2`
- Data volume: `count_wyniki_data`
- App port on host: `8087`

## Standard Deploy

```powershell
Set-Location "c:\Users\sucho\Vest Tennis"
c:/Users/sucho/Wyniki/wyniki-live/.venv/Scripts/python.exe .\deploy.py backend
```

## Fast Health Checks

```powershell
ssh minipc "docker ps --filter name=wyniki-tenis-v2 --format '{{.Names}} {{.Status}}'"
ssh minipc "curl -fsS http://localhost:8087/health"
ssh minipc "curl -fsS http://localhost:8087/api/snapshot | head -c 200"
ssh minipc "docker logs wyniki-tenis-v2 --tail 50"
```

## Production Backup

Create a portable archive of the live Docker volume:

```powershell
Set-Location "c:\Users\sucho\Wyniki\wyniki-live\wyniki-v2"
c:/Users/sucho/Wyniki/wyniki-live/.venv/Scripts/python.exe .\scripts\prod_backup.py
```

Defaults:

- remote host: `minipc`
- backup root: `/mnt/dysk12tb/wyniki-backups`, with automatic fallback to `$HOME/wyniki-backups` when the mounted disk is not writable from the current account
- volume: `count_wyniki_data`

## Production Smoke Test

```powershell
Set-Location "c:\Users\sucho\Wyniki\wyniki-live\wyniki-v2"
c:/Users/sucho/Wyniki/wyniki-live/.venv/Scripts/python.exe .\scripts\prod_smoke.py --base-url https://score.vestmedia.pl
```

The smoke test checks:

- `/health`
- `/api/snapshot`
- `/api/tournaments/active`
- `/api/players/active`

For the public browser frontend, run the multilingual Playwright smoke after every frontend deploy:

```powershell
Set-Location "c:\Users\sucho\Wyniki\wyniki-live\wyniki-v2\frontend"
npm run verify:production
```

This command validates translation key completeness, builds the public frontend, and checks 6 languages across the public routes on `https://score.vestmedia.pl`.

## Daily Ops Check

The minipc runs a lightweight daily check after the 03:00 backup:

```cron
30 4 * * * /home/suchokrates1/count/wyniki-v2/scripts/prod_ops_check.sh >> /tmp/wyniki-ops-check.log 2>&1
```

It checks:

- `https://score.vestmedia.pl/`
- `https://score.vestmedia.pl/api/snapshot`
- the latest dated NAS backup under `/volume1/Backup/minipc`, using `NAS_*` from `~/backup.conf`

Manual run:

```powershell
ssh minipc "/home/suchokrates1/count/wyniki-v2/scripts/prod_ops_check.sh"
```

## Rollback

Rollback has two moving parts:

1. restore the application code to a known git revision,
2. restore `/data` from a known backup archive.

Command:

```powershell
Set-Location "c:\Users\sucho\Wyniki\wyniki-live\wyniki-v2"
c:/Users/sucho/Wyniki/wyniki-live/.venv/Scripts/python.exe .\scripts\prod_restore.py --backup-file "/mnt/dysk12tb/wyniki-backups/wyniki/wyniki-data-YYYYMMDDTHHMMSSZ.tar.gz" --git-revision <commit> --yes
```

The restore script creates a pre-restore safety backup before replacing the volume contents.
If the configured safety directory is not writable, it falls back to `$HOME/wyniki-backups/pre-restore`.

## Emergency Procedure

If live scoring breaks during tournament operations:

1. Stop further deploys.
2. Capture logs from `wyniki-tenis-v2`.
3. Run smoke test to determine if breakage is global or feature-specific.
4. If failure is data-related, create immediate backup before any manual repair.
5. If failure is release-related, rollback code + data to the latest known-good pair.
6. Verify `/health`, `/api/snapshot`, Android court authorization, and a test match flow.

## Android Rehearsal

With emulator running:

```powershell
Set-Location "c:\Users\sucho\Vest Tennis\android-tennis-referee"
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=pl.vestmedia.tennisreferee.e2e.UmpireTournamentE2ETest#tournamentSimulation_coversUmpireFlowsServerSyncHistoryAndCleanup
```

## Pre-event checklist (T−7 … T−0)

Print / tick before each tournament weekend:

### Dzień −7 / −3
- [ ] `git status` clean on laptop + `ssh minipc "cd ~/count/wyniki-v2 && git log -1 --oneline"` matches intended revision
- [ ] Backend deploy: `python deploy.py backend` then `curl -fsS https://score.vestmedia.pl/health`
- [ ] Public smoke (6 języków): `cd wyniki-v2/frontend && npm run verify:production`
- [ ] Office: login slotu, SSE `live` (nie ciągły 12s poll), wpis wyniku grupowego → refresh bez F5
- [ ] Admin: login, zakładka Biuro turnieju odświeża się po mutacji (SSE), brak spamu API gdy inna zakładka
- [ ] Umpire: authorize kortu → create/update/finish match; po reconnect outbox flush (offline→online)
- [ ] APK/AAB na trackach: `internal` + `alpha` po zmianach Androida; `beta`/`production` po teście tabletu
- [ ] Play Console: API 36 / targetSdk — status „Send for review” jeśli `changesNotSentForReview`

### Dzień −1
- [ ] Backup DB: `python .\scripts\prod_backup.py` (sprawdź ścieżkę archiwum na minipc)
- [ ] Dry-run restore udokumentowany (komenda z sekcji Rollback, **bez** `--yes` na produkcji — tylko weryfikacja pliku)
- [ ] `python deploy.py status` — wersje APK vs oczekiwane `versionCode`
- [ ] Zero otwartych P0: scoring / standings / auth

### Dzień 0 (start)
- [ ] Ponowny `/health` + snapshot
- [ ] Szybki smoke office + jeden kort sędziowski
- [ ] Zamrożenie: zero refaktoru struktury / migracji schematu; tylko hotfixy

## Current Freeze Baseline

- Android: bump lokalny outbox (`1.0.0-dev.23`) — zaktualizuj po pushu
- Backend: zaktualizuj po deployu T0–T2
- Scoring / umpire JSON contract: **frozen** w tygodniu T4 (tylko świadome hotfixy)