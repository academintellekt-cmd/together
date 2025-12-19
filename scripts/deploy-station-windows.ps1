# Скрипт развертывания для Windows станции
# Этот скрипт будет выполняться на станции Windows

param(
    [string]$StationPath = "C:\together",
    [string]$ArchivePath = "C:\tmp\quiz-station-deploy.tar.gz"
)

# Логирование для отладки
Write-Host "Параметры:" -ForegroundColor Cyan
Write-Host "  StationPath: $StationPath" -ForegroundColor Cyan
Write-Host "  ArchivePath: $ArchivePath" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/8] Preparing project directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $StationPath | Out-Null
Set-Location $StationPath

Write-Host "[2/8] Stopping application (if running)..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$StationPath*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "[3/8] Creating backup..." -ForegroundColor Yellow
if (Test-Path $StationPath -PathType Container) {
    $items = Get-ChildItem -Path $StationPath -Force
    if ($items.Count -gt 0) {
        $backupDir = Join-Path $StationPath "backup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        Copy-Item -Path "$StationPath\*" -Destination $backupDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Backup created: $backupDir" -ForegroundColor Green
    }
}

Write-Host "[4/8] Cleaning old files..." -ForegroundColor Yellow
Get-ChildItem -Path $StationPath -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[5/8] Extracting new files..." -ForegroundColor Yellow
if (Test-Path $ArchivePath) {
    if (Get-Command tar -ErrorAction SilentlyContinue) {
        tar -xzf $ArchivePath -C $StationPath
        Write-Host "Files extracted successfully" -ForegroundColor Green
    } else {
        Write-Host "ERROR: tar not found. Install Git for Windows" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "ERROR: Archive not found: $ArchivePath" -ForegroundColor Red
    exit 1
}

Write-Host "[6/8] Installing dependencies..." -ForegroundColor Yellow
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install --production --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Error installing dependencies" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: npm not found. Make sure Node.js is installed" -ForegroundColor Yellow
}

Write-Host "[7/8] Configuring Windows Firewall..." -ForegroundColor Yellow
# Открываем порт 3000 в файрволе Windows
$firewallRule = Get-NetFirewallRule -DisplayName "Node.js Server" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
    Write-Host "Firewall rule created for port 3000" -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists" -ForegroundColor Cyan
}

Write-Host "[8/8] Starting application..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $serverPath = Join-Path $StationPath "server.js"
    if (Test-Path $serverPath) {
        # Проверяем, не запущено ли уже приложение
        $existingProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$StationPath*" }
        if ($existingProcess) {
            Write-Host "Stopping existing application..." -ForegroundColor Yellow
            $existingProcess | Stop-Process -Force
            Start-Sleep -Seconds 2
        }
        
        Start-Process -FilePath "node" -ArgumentList $serverPath -WorkingDirectory $StationPath -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "Application started" -ForegroundColor Green
    } else {
        Write-Host "WARNING: server.js not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: node not found. Make sure Node.js is installed" -ForegroundColor Yellow
}

Write-Host "[9/9] Cleaning temporary files..." -ForegroundColor Yellow
Remove-Item $ArchivePath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Application should be available at:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/" -ForegroundColor White
Write-Host "  http://$(hostname):3000/" -ForegroundColor White
Write-Host ""
