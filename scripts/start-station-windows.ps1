# Скрипт запуска приложения на Windows станции
# Использование: powershell -ExecutionPolicy Bypass -File start-station-windows.ps1

$StationPath = "C:\together"

Write-Host "Checking Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host "Node.js version: $(node --version)" -ForegroundColor Green

Write-Host "Checking dependencies..." -ForegroundColor Yellow
Set-Location $StationPath

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install --production
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Starting application..." -ForegroundColor Yellow
$serverPath = Join-Path $StationPath "server.js"

if (-not (Test-Path $serverPath)) {
    Write-Host "ERROR: server.js not found in $StationPath" -ForegroundColor Red
    exit 1
}

# Проверяем, не запущено ли уже приложение
$existingProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$StationPath*" }
if ($existingProcess) {
    Write-Host "Stopping existing application..." -ForegroundColor Yellow
    $existingProcess | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Запускаем приложение в фоновом режиме
Write-Host "Starting node server.js..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList $serverPath -WorkingDirectory $StationPath -WindowStyle Hidden

Start-Sleep -Seconds 3

# Проверяем, запустилось ли приложение
$process = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$StationPath*" }
if ($process) {
    Write-Host "Application started successfully!" -ForegroundColor Green
    Write-Host "Process ID: $($process.Id)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Check if it's working:" -ForegroundColor Yellow
    Write-Host "  curl http://localhost:3000/" -ForegroundColor White
    Write-Host "  or open in browser: http://localhost:3000/" -ForegroundColor White
} else {
    Write-Host "WARNING: Application process not found. Check logs manually." -ForegroundColor Yellow
}

