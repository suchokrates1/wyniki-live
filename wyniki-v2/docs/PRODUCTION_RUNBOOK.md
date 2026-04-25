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

## Current Freeze Baseline

- Android: `35e1911`
- Backend: `ca3cb3e`