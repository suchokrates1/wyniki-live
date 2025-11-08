# PowerShell script to run test with environment configuration

Write-Host "🎾 Wyniki-Live Load Test Setup" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Set environment variables for test
$env:KORT1_ID = "test-overlay-001"
$env:KORT2_ID = "test-overlay-002"
$env:KORT3_ID = "test-overlay-003"
$env:KORT4_ID = "test-overlay-004"
$env:UNO_API_BASE = "http://localhost:5001/apiv2/controlapps/{overlay_id}/api"
$env:UNO_REQUESTS_ENABLED = "true"
$env:UNO_AUTH_BEARER = ""

Write-Host "✅ Environment configured:" -ForegroundColor Green
Write-Host "   KORT1_ID = $env:KORT1_ID"
Write-Host "   KORT2_ID = $env:KORT2_ID"
Write-Host "   KORT3_ID = $env:KORT3_ID"
Write-Host "   KORT4_ID = $env:KORT4_ID"
Write-Host "   UNO_API_BASE = $env:UNO_API_BASE"
Write-Host ""

Write-Host "📝 Starting processes..." -ForegroundColor Yellow
Write-Host ""

# Start Mock UNO server
Write-Host "1. Starting Mock UNO API on port 5001..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python mock_uno_server.py"
Start-Sleep -Seconds 2

# Start wyniki-live app
Write-Host "2. Starting wyniki-live on port 8080..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:KORT1_ID='test-overlay-001'; `$env:KORT2_ID='test-overlay-002'; `$env:KORT3_ID='test-overlay-003'; `$env:KORT4_ID='test-overlay-004'; `$env:UNO_API_BASE='http://localhost:5001/apiv2/controlapps/{overlay_id}/api'; `$env:UNO_REQUESTS_ENABLED='true'; python app.py"
Start-Sleep -Seconds 5

# Check if servers are running
Write-Host "`n3. Checking if servers are ready..." -ForegroundColor Cyan
try {
    $mockResponse = Invoke-WebRequest -Uri "http://localhost:5001/stats" -TimeoutSec 2 -UseBasicParsing
    Write-Host "   ✅ Mock UNO API is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Mock UNO API is NOT running!" -ForegroundColor Red
    exit 1
}

try {
    $wynikResponse = Invoke-WebRequest -Uri "http://localhost:8080/api/snapshot" -TimeoutSec 2 -UseBasicParsing
    Write-Host "   ✅ wyniki-live API is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ wyniki-live API is NOT running!" -ForegroundColor Red
    exit 1
}

Write-Host "`n4. Running test..." -ForegroundColor Cyan
Write-Host ""

# Run the quick test
python quick_test.py

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Test completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check results above ☝️" -ForegroundColor Yellow
Write-Host "Mock UNO stats: http://localhost:5001/stats" -ForegroundColor Yellow
Write-Host "Snapshot: http://localhost:8080/api/snapshot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to stop servers and exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
