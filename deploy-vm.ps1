# AquaTrak VM Auto-Deployer Script
# Run this locally from your project root in PowerShell: ./deploy-vm.ps1

$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) { 
    $currentBranch = "fix/capacitor-6-google-sign-in" 
}

Write-Host "=== AquaTrak VM Deployer ===" -ForegroundColor Cyan
Write-Host "Current Branch: $currentBranch" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "Do you want to commit & push your local changes first? (y/n) [Default: y]"
if ($choice -eq "" -or $choice -eq "y" -or $choice -eq "yes") {
    $msg = Read-Host "Enter commit message [Default: update before deploy]"
    if ($msg -eq "") { 
        $msg = "update before deploy" 
    }
    
    Write-Host "`n1. Committing and pushing local changes..." -ForegroundColor Yellow
    git add .
    git commit -m $msg
    git push origin $currentBranch
}

Write-Host "`n2. Triggering deployment pull on Azure VM..." -ForegroundColor Yellow
az vm run-command invoke `
  --name aquatrak-bot `
  --resource-group AQUATRAK-RG `
  --command-id RunShellScript `
  --scripts "cd /home/nikunjkumar05/FutureFounders && sudo -u nikunjkumar05 git pull origin $currentBranch && pm2 restart all"

Write-Host "`nVM Redeployed successfully!" -ForegroundColor Green
