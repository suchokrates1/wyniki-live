# Build and Deploy Script for Wyniki Live v2 (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "🎾 Building Wyniki Live v2..." -ForegroundColor Green

# Step 1: Build Frontend
Write-Host "`n📦 Step 1: Building Frontend..." -ForegroundColor Cyan
Set-Location frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing Node.js dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "Building frontend assets..." -ForegroundColor Yellow
npm run build

Set-Location ..

# Step 2: Verify Build Output
if (-not (Test-Path "static_v2")) {
    Write-Host "❌ Error: static_v2 directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Frontend built successfully" -ForegroundColor Green

# Step 3: Build Docker Image
Write-Host "`n🐳 Step 2: Building Docker Image..." -ForegroundColor Cyan
docker-compose -f docker-compose.test.yml build

Write-Host "✅ Docker image built" -ForegroundColor Green

# Step 4: Stop Old Container (if running)
Write-Host "`n🛑 Step 3: Stopping old container..." -ForegroundColor Cyan
docker-compose -f docker-compose.test.yml down 2>$null

# Step 5: Start New Container
Write-Host "`n🚀 Step 4: Starting new container..." -ForegroundColor Cyan
docker-compose -f docker-compose.test.yml up -d

# Step 6: Wait for Health Check
Write-Host "`n⏳ Step 5: Waiting for health check..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8088/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Application is healthy!" -ForegroundColor Green
            break
        }
    }
    catch {
        Write-Host "Waiting... ($i/30)" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

# Step 7: Show Container Status
Write-Host "`n📊 Container Status:" -ForegroundColor Cyan
docker-compose -f docker-compose.test.yml ps

# Step 8: Show Logs (last 20 lines)
Write-Host "`n📋 Recent Logs:" -ForegroundColor Cyan
docker-compose -f docker-compose.test.yml logs --tail=20

Write-Host "`n🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "`nAccess the application at:" -ForegroundColor White
Write-Host "  http://localhost:8088" -ForegroundColor Cyan
Write-Host "  http://test.score.vestmedia.pl:8088 (if DNS configured)" -ForegroundColor Cyan
Write-Host "`nUseful commands:" -ForegroundColor White
Write-Host "  View logs:    docker-compose -f docker-compose.test.yml logs -f" -ForegroundColor Cyan
Write-Host "  Stop:         docker-compose -f docker-compose.test.yml down" -ForegroundColor Cyan
Write-Host "  Restart:      docker-compose -f docker-compose.test.yml restart" -ForegroundColor Cyan
