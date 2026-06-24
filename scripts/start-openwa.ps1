# Start OpenWA + Cloudflared Tunnel
# Run this after restarting your laptop

$ErrorActionPreference = "Stop"

Write-Host "=== Starting OpenWA ===" -ForegroundColor Cyan

# 1. Start OpenWA Docker container
Write-Host "[1/6] Starting OpenWA Docker container..." -ForegroundColor Yellow
Push-Location "C:\Users\sange\OpenWA"
docker compose -f docker-compose.dev.yml up -d
Pop-Location
Start-Sleep -Seconds 5

# 2. Check OpenWA is healthy
Write-Host "[2/6] Checking OpenWA health..." -ForegroundColor Yellow
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

# 3. Start ngrok tunnel
Write-Host "[3/6] Starting ngrok tunnel..." -ForegroundColor Yellow
# Kill any existing ngrok
Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$ngrokExe = "C:\Users\sange\AppData\Local\Microsoft\WindowsApps\ngrok.exe"
if (-not (Test-Path $ngrokExe)) {
    Write-Host "  ERROR: ngrok.exe not found at $ngrokExe" -ForegroundColor Red
    exit 1
}
Start-Process -NoNewWindow -FilePath $ngrokExe -ArgumentList "http","2785"

# 4. Extract tunnel URL
Write-Host "[4/6] Extracting tunnel URL..." -ForegroundColor Yellow
$tunnelUrl = ""
$ngrokRetry = 0
while (-not $tunnelUrl -and $ngrokRetry -lt 10) {
    Start-Sleep -Seconds 3
    try {
        $tunnelsRaw = curl.exe -s "http://127.0.0.1:4040/api/tunnels" 2>$null
        $tunnelsJson = $tunnelsRaw | ConvertFrom-Json
        if ($tunnelsJson -and $tunnelsJson.tunnels -and $tunnelsJson.tunnels.Length -gt 0) {
            $tunnelUrl = $tunnelsJson.tunnels[0].public_url
        }
    } catch {}
    if (-not $tunnelUrl) {
        $ngrokRetry++
        Write-Host "  Waiting for tunnel... ($ngrokRetry/10)" -ForegroundColor DarkGray
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ERROR: Could not create tunnel. Make sure ngrok authtoken is configured." -ForegroundColor Red
    Write-Host "  Run 'ngrok config add-authtoken <your-token>' in terminal first." -ForegroundColor DarkGray
    exit 1
}

Write-Host "  Tunnel URL: $tunnelUrl" -ForegroundColor Green

# 5. Detect active session ID
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
    Write-Host ""
    Write-Host "  WARNING: No active WhatsApp session found!" -ForegroundColor Red
    Write-Host "  Open http://localhost:2886 in your browser and scan the QR code." -ForegroundColor Yellow
    Write-Host "  Press Enter after scanning to continue..." -ForegroundColor Yellow
    Read-Host
    # Re-check for session after QR scan
    $sessions = curl.exe -s "http://localhost:2785/api/sessions" -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" 2>$null
    foreach ($line in $sessions) {
        if ($line -match '"id"\s*:\s*"([0-9a-f-]+)"') {
            $sessionId = $matches[1]
            break
        }
    }
    if ($sessionId) {
        Write-Host "  Session connected: $sessionId" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Still no session. Try scanning again." -ForegroundColor Red
        exit 1
    }
}

# 6. Update Vercel env
Write-Host "[6/6] Updating Vercel production env..." -ForegroundColor Yellow
Push-Location "C:\Users\sange\FutureFounders"

# Read Vercel token from .env
$vercelToken = ""
$envLines = Get-Content ".env" -ErrorAction SilentlyContinue
foreach ($line in $envLines) {
    if ($line -match "^OPENWA_VERCEL_TOKEN=(.+)$") {
        $vercelToken = $matches[1].Trim()
        break
    }
}

if (-not $vercelToken) {
    Write-Host "  ERROR: OPENWA_VERCEL_TOKEN not found in .env" -ForegroundColor Red
    Pop-Location
    exit 1
}

function Run-Vercel {
    if (Get-Command vercel -ErrorAction SilentlyContinue) {
        & vercel @args
    } elseif (Test-Path "node_modules\.bin\vercel.cmd") {
        & "node_modules\.bin\vercel.cmd" @args
    } else {
        npx -y vercel @args
    }
}

$ErrorActionPreference = "SilentlyContinue"
cmd.exe /c "echo y | npx vercel env rm OPENWA_API_URL production --token $vercelToken" 2>$null
cmd.exe /c "echo y | npx vercel env rm OPENWA_SESSION_ID production --token $vercelToken" 2>$null
if ($sessionId) {
    cmd.exe /c "echo $sessionId | npx vercel env add OPENWA_SESSION_ID production --token $vercelToken" 2>$null
    Write-Host "  Updated OPENWA_SESSION_ID: $sessionId" -ForegroundColor Green
}
cmd.exe /c "echo $tunnelUrl | npx vercel env add OPENWA_API_URL production --token $vercelToken" 2>$null
Write-Host "  Updated OPENWA_API_URL: $tunnelUrl" -ForegroundColor Green
$ErrorActionPreference = "Stop"
Pop-Location

# Verify tunnel reaches OpenWA
Write-Host ""
Write-Host "Verifying tunnel..." -ForegroundColor Yellow
$tunnelHealth = curl.exe -s "$tunnelUrl/api/health" 2>$null
if ($tunnelHealth -match '"status":"ok"') {
    Write-Host "  Tunnel is working!" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Tunnel health check failed" -ForegroundColor Red
}

# Trigger Vercel redeployment so new env vars take effect
Write-Host "Triggering Vercel redeployment..." -ForegroundColor Yellow
Push-Location "C:\Users\sange\FutureFounders"
git commit --allow-empty -m "redeploy: new tunnel URL $tunnelUrl" 2>$null
git push origin main 2>$null
Pop-Location
Write-Host "  Redeployment triggered!" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " OpenWA is ready!" -ForegroundColor Green
Write-Host " Tunnel: $tunnelUrl" -ForegroundColor White
Write-Host " Session: $sessionId" -ForegroundColor White
Write-Host " Production: https://futurefounders-ruddy.vercel.app/api/webhook" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Send a WhatsApp message to 919214775938 to test!" -ForegroundColor Yellow
