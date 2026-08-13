# Production Runbook

## Scope

This runbook covers the live backend on `minipc` for `score.vestmedia.pl`.

Feature work deploys to an isolated stack on `dell`: https://test.blindtennis.app — see [TEST_ENV_DELL.md](TEST_ENV_DELL.md). Do not point `docker-compose.test.yml` at minipc or reuse prod volume / overlay IDs.

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

With emulator running (prefer Eclipse Adoptium JDK 17):

```powershell
Set-Location "c:\Users\sucho\Vest Tennis\android-tennis-referee"
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
# Fallback: Android Studio JBR if Adoptium missing
# $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=pl.vestmedia.tennisreferee.e2e.UmpireTournamentE2ETest#tournamentSimulation_coversUmpireFlowsServerSyncHistoryAndCleanup
```

PIN path (court → PIN → PlayerSelection):

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest `
  "-Pandroid.testInstrumentationRunnerArguments.class=pl.vestmedia.tennisreferee.e2e.CourtPinPathE2ETest" `
  "-Pandroid.testInstrumentationRunnerArguments.e2e.baseUrl=http://192.168.31.5:18087"
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

- Android golden: `1.0.0-dev.25` (`100025`) on **all** tracks (internal/alpha/beta/production)
- Backend: `4b784b4` on minipc
- Latest backup: `wyniki-data-20260726T152937Z.tar.gz`
- Scoring / umpire JSON contract: **frozen** w tygodniu T4 (tylko świadome hotfixy)
- Checklist: `docs/ARCHITECTURE_FREEZE_PRE_EVENT.md`
- Quality gate: `docs/QUALITY_GATE.md` — po większym PR zawsze `run.py full --skip-android`
- Pre-event week: `docs/PRE_EVENT_FREEZE.md`
- Court auth grace: `docs/COURT_AUTH_GRACE_PLAN.md` (e2e dry-run done 2026-07-26)

## Local E2E Tournament Test

Runs a full tournament lifecycle (create → groups → schedule → results → knockout) against a local Docker container with Playwright.

### Quick start

```powershell
Set-Location "c:\Users\sucho\Wyniki\wyniki-live\wyniki-v2"
c:/Users/sucho/Wyniki/wyniki-live/.venv/Scripts/python.exe scripts/e2e_tournament/run.py full
```

### Individual commands

```powershell
# Start E2E container (port 18087)
python scripts/e2e_tournament/run.py up

# Run all office modules
python scripts/e2e_tournament/run.py office

# Run a single module
python scripts/e2e_tournament/run.py office --module 01_bootstrap

# Or via npm
cd frontend
npm run e2e:tournament
npm run e2e:tournament:module -- 01_bootstrap

# Tear down
python scripts/e2e_tournament/run.py down
```

### Configuration

- `.env.e2e.example` — copy to `.env.e2e` to override defaults
- `E2E_BASE_URL` env var overrides `http://localhost:18087` (on Windows host without Docker use `http://192.168.31.5:18087` against minipc)
- `E2E_ADMIN_PASSWORD` defaults to `e2e-admin` (never reuse prod `ADMIN_PASSWORD`)
- Container: `wyniki-tenis-e2e`, volume: `wyniki_e2e_data`

### Android 4-court wave

```powershell
# e2e on minipc :18087 — emulator uses LAN IP (not 10.0.2.2 unless you ssh -L)
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:E2E_BASE_URL = 'http://192.168.31.5:18087'
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
Set-Location "c:\Users\sucho\Vest Tennis\android-tennis-referee"
.\scripts\run_parallel_courts.ps1 -MaxCourts 4 `
  -BaseUrl 'http://192.168.31.5:18087' `
  -HostBaseUrl 'http://192.168.31.5:18087'
```

Or via Python orchestrator (office + android + public assert):

```powershell
$env:E2E_BASE_URL = 'http://192.168.31.5:18087'
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
python scripts/e2e_tournament/run.py full
# office-only / no devices:
python scripts/e2e_tournament/run.py full --skip-android
```

Requires ≥1 AVD. With one device, courts run sequentially; with 2–4 devices, parallel.
After Android wave, orchestrator asserts snapshot/artifacts contain finished `E2E-*` matches.
Tests: `app/src/androidTest/.../e2e/` (`MultiCourtUmpireE2ETest`, `CourtPinPathE2ETest`).

### Observability alerts (minipc)

Daily `prod_ops_check.sh` now also fails on:

- unhealthy `/health`
- Docker volume / backup disk low free space (&lt; 2 GiB)
- recent umpire sync errors in container logs (best-effort)

Manual:

```powershell
ssh minipc "/home/suchokrates1/count/wyniki-v2/scripts/prod_ops_check.sh"
```