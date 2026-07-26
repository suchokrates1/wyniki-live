<#
.SYNOPSIS
  Non-blocking remote smoke: health + office bootstrap module against E2E host.

.DESCRIPTION
  Intended for optional CI / nightly. Exit 0 on success, 1 on failure.
  Does not tear down remote e2e container.
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = $(if ($env:E2E_BASE_URL) { $env:E2E_BASE_URL } else { "http://192.168.31.5:18087" }),
    [string]$AdminPassword = $(if ($env:E2E_ADMIN_PASSWORD) { $env:E2E_ADMIN_PASSWORD } else { "e2e-admin" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $root "scripts\e2e_tournament\run.py"))) {
    $root = Split-Path -Parent $PSScriptRoot
}

$env:E2E_BASE_URL = $BaseUrl.TrimEnd('/')
$env:E2E_ADMIN_PASSWORD = $AdminPassword

Write-Host "Remote E2E smoke against $($env:E2E_BASE_URL)"
Set-Location $root

python scripts/e2e_tournament/run.py health
if ($LASTEXITCODE -ne 0) { exit 1 }

python scripts/e2e_tournament/run.py office --module 01_bootstrap
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Remote smoke OK"
exit 0
