# Quality gate (post-PR)

## Mandatory after larger PRs (office / admin / umpire / scoring / auth)

```powershell
$env:E2E_BASE_URL = 'http://192.168.31.5:18087'   # or local http://localhost:18087
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
Set-Location "C:\Users\sucho\Wyniki\wyniki-live\wyniki-v2"
python scripts/e2e_tournament/run.py full --skip-android
```

DoD: all office modules PASS; public assert PASS; wall time ideally &lt; 2 minutes.

## Android wave (when AVD/device available)

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:E2E_BASE_URL = 'http://192.168.31.5:18087'
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
Set-Location "C:\Users\sucho\Vest Tennis\android-tennis-referee"
.\scripts\run_parallel_courts.ps1 -MaxCourts 4 `
  -BaseUrl 'http://192.168.31.5:18087' `
  -HostBaseUrl 'http://192.168.31.5:18087'
```

Notes:

- Prefer Adoptium JDK 17 for Gradle (not only Android Studio JBR).
- Emulator/device must use LAN/`RetrofitClient.overrideBaseUrl` (script passes `e2e.baseUrl`).
- 1 AVD → sequential courts; 2–4 AVD → parallel jobs.

PIN path coverage: `CourtPinPathE2ETest` (court → PIN → PlayerSelection).

## Optional remote smoke (non-blocking CI)

```powershell
.\scripts\e2e_tournament\smoke_remote.ps1
```

GitHub workflow `e2e-smoke.yml` runs this against minipc e2e when secret `E2E_BASE_URL` is set; failures are soft (`continue-on-error`) so merge is not blocked when the LAN host is down.

## Public a11y

Keep `.github/workflows/a11y.yml` green on every PR (blocking).
