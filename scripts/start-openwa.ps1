# Start OpenWA + Cloudflared Tunnel
# Run this after restarting your laptop

$ErrorActionPreference = "Stop"

Write-Host "=== Starting OpenWA ===" -ForegroundColor Cyan

# 1. Start OpenWA Docker container
Write-Host "[1/4] Starting OpenWA Docker container..." -ForegroundColor Yellow
Push-Location "C:\Users\sange\OpenWA"
docker compose -f docker-compose.dev.yml up -d
Pop-Location
Start-Sleep -Seconds 5

# 2. Check OpenWA is healthy
Write-Host "[2/4] Checking OpenWA health..." -ForegroundColor Yellow
$retryCount = 0
$healthy = $false
while (-not $healthy -and $retryCount -lt 10) {
    try {
        $health = curl.exe -s "http://localhost:2785/api/health" 2>$null
        if ($health -match '"status":"ok"') {
            $healthy = $true
            Write-Host "  OpenWA is healthy!" -ForegroundColor Green
        }
    } catch {}
    if (-not $healthy) {
        $retryCount++
        Write-Host "  Waiting for OpenWA... ($retryCount/10)" -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
    }
}

if (-not $healthy) {
    Write-Host "  ERROR: OpenWA failed to start!" -ForegroundColor Red
    exit 1
}

# 3. Start cloudflared tunnel
Write-Host "[3/4] Starting cloudflared tunnel..." -ForegroundColor Yellow
# Kill any existing cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$cfExe = "C:\Users\sange\AppData\Local\Temp\opencode\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    Write-Host "  Downloading cloudflared..." -ForegroundColor DarkGray
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
}

Start-Process -NoNewWindow -FilePath $cfExe -ArgumentList "tunnel","--url","http://localhost:2785","--no-autoupdate","--protocol","http2" -RedirectStandardOutput "C:\Users\sange\AppData\Local\Temp\opencode\cf.log" -RedirectStandardError "C:\Users\sange\AppData\Local\Temp\opencode\cf-err.log"
Start-Sleep -Seconds 8

# 4. Extract tunnel URL
Write-Host "[4/4] Extracting tunnel URL..." -ForegroundColor Yellow
$cfErr = Get-Content "C:\Users\sange\AppData\Local\Temp\opencode\cf-err.log" -ErrorAction SilentlyContinue
$tunnelUrl = ""
foreach ($line in $cfErr) {
    if ($line -match "https://[a-z0-9-]+\.trycloudflare\.com") {
        $tunnelUrl = $matches[0]
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ERROR: Could not extract tunnel URL!" -ForegroundColor Red
    Write-Host "  Check: C:\Users\sange\AppData\Local\Temp\opencode\cf-err.log" -ForegroundColor DarkGray
    exit 1
}

Write-Host "  Tunnel URL: $tunnelUrl" -ForegroundColor Green

# 5. Detect active session ID
Write-Host ""
Write-Host "[5/6] Detecting active OpenWA session..." -ForegroundColor Yellow
$sessions = curl.exe -s "http://localhost:2785/api/sessions" -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" 2>$null
$sessionId = ""
foreach ($line in $sessions) {
    if ($line -match '"id"\s*:\s*"([0-9a-f-]+)"') {
        $sessionId = $matches[1]
        break
    }
}

if ($sessionId) {
    Write-Host "  Session ID: $sessionId" -ForegroundColor Green
} else {
    Write-Host "  WARNING: No active session found! You may need to scan QR via dashboard." -ForegroundColor Red
}

# 6. Update Vercel env
Write-Host ""
Write-Host "[6/6] Updating Vercel production env..." -ForegroundColor Yellow
Push-Location "C:\Users\sange\FutureFounders"
cmd.exe /c "echo y | npx vercel env rm OPENWA_API_URL production --yes 2>nul"
cmd.exe /c "echo y | npx vercel env rm OPENWA_SESSION_ID production --yes 2>nul"
if ($sessionId) {
    [System.IO.File]::WriteAllText("$env:TEMP\sid.txt", $sessionId, [System.Text.UTF8Encoding]::new($false))
    cmd.exe /c "vercel env add OPENWA_SESSION_ID production < $env:TEMP\sid.txt"
    Write-Host "  Updated OPENWA_SESSION_ID in Vercel: $sessionId" -ForegroundColor Green
}
[System.IO.File]::WriteAllText("$env:TEMP\turl.txt", $tunnelUrl, [System.Text.UTF8Encoding]::new($false))
cmd.exe /c "vercel env add OPENWA_API_URL production < $env:TEMP\turl.txt"
Write-Host "  Updated OPENWA_API_URL in Vercel: $tunnelUrl" -ForegroundColor Green
Pop-Location

# 6. Verify tunnel reaches OpenWA
Write-Host ""
Write-Host "Verifying tunnel..." -ForegroundColor Yellow
$tunnelHealth = curl.exe -s "$tunnelUrl/api/health" 2>$null
if ($tunnelHealth -match '"status":"ok"') {
    Write-Host "  Tunnel is working!" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Tunnel health check failed" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " OpenWA is ready!" -ForegroundColor Green
Write-Host " Tunnel: $tunnelUrl" -ForegroundColor White
Write-Host " Session: $sessionId" -ForegroundColor White
Write-Host " Production: https://futurefounders-ruddy.vercel.app/api/webhook" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Send a WhatsApp message to 919358549335 to test!" -ForegroundColor Yellow
