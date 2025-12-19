# Скрипт автоматического развертывания файлов на все станции через локальный сервер (Windows PowerShell)
# Использование: .\deploy-to-stations.ps1 [USERNAME] [PASSWORD] [STATION_PATH]

param(
    [string]$Username = "pi",
    [string]$Password = "",
    [string]$StationPath = "C:\together"
)

Write-Host "🚀 Автоматическое развертывание файлов на станции..." -ForegroundColor Green
Write-Host ""

# IP адреса станций (192.168.1.21 - 192.168.1.29)
$StationIPs = @(
    "192.168.1.21", "192.168.1.22", "192.168.1.23", "192.168.1.24",
    "192.168.1.25", "192.168.1.26", "192.168.1.27", "192.168.1.28", "192.168.1.29"
)

Write-Host "📋 Параметры развертывания:"
Write-Host "   Пользователь: $Username"
Write-Host "   Пароль: $(if ($Password) { '***указан***' } else { 'не указан' })"
Write-Host "   Путь на станции: $StationPath"
Write-Host ""

# Функция для проверки доступности станции через ping
function Test-StationPing {
    param([string]$IP)
    $ping = Test-Connection -ComputerName $IP -Count 1 -Quiet -ErrorAction SilentlyContinue
    return $ping
}

# Функция для проверки SSH порта
function Test-StationSSH {
    param([string]$IP, [int]$Port = 22)
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect($IP, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(3000, $false)
        if ($wait) {
            $tcpClient.EndConnect($connect)
            $tcpClient.Close()
            return $true
        } else {
            $tcpClient.Close()
            return $false
        }
    } catch {
        return $false
    }
}

# Функция для проверки доступности станции (комплексная)
function Test-Station {
    param([string]$IP, [string]$Username)
    
    # Проверка ping
    if (-not (Test-StationPing -IP $IP)) {
        return 1  # Ping не проходит
    }
    
    # Проверка SSH порта
    if (-not (Test-StationSSH -IP $IP)) {
        return 2  # Ping работает, но SSH недоступен
    }
    
    return 0  # Все проверки пройдены
}

# Функция для развертывания на одной станции
function Deploy-ToStation {
    param(
        [string]$IP,
        [int]$StationNum,
        [string]$Username,
        [string]$Password,
        [string]$StationPath
    )
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "📡 Станция #$StationNum ($IP)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    # Проверка доступности станции
    Write-Host "🔍 Проверка доступности станции..." -ForegroundColor Yellow
    
    $checkResult = Test-Station -IP $IP -Username $Username
    
    if ($checkResult -eq 1) {
        Write-Host "⚠️  Станция $IP недоступна (ping не проходит)" -ForegroundColor Yellow
        return $false
    } elseif ($checkResult -eq 2) {
        Write-Host "⚠️  Станция $IP доступна по сети, но SSH порт закрыт или недоступен" -ForegroundColor Yellow
        Write-Host "   Проверьте:" -ForegroundColor Yellow
        Write-Host "   - Запущен ли SSH сервер на станции: sudo systemctl status ssh" -ForegroundColor Yellow
        Write-Host "   - Открыт ли порт 22 в файрволе" -ForegroundColor Yellow
        Write-Host "   - Правильный ли IP адрес" -ForegroundColor Yellow
        return $false
    }
    
    Write-Host "✅ Станция доступна (ping и SSH порт открыты)" -ForegroundColor Green
    
    # Проверка наличия архива
    if (-not (Test-Path "quiz-station-deploy.tar.gz")) {
        Write-Host "❌ Архив quiz-station-deploy.tar.gz не найден!" -ForegroundColor Red
        return $false
    }
    
    # Загрузка архива на станцию
    Write-Host "📤 Загрузка архива на станцию..." -ForegroundColor Yellow
    
    $scpCommand = "scp"
    $scpArgs = @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=3",
        "quiz-station-deploy.tar.gz",
        "${Username}@${IP}:/tmp/"
    )
    
    if ($Password) {
        # Проверка наличия sshpass или plink
        if (Get-Command sshpass -ErrorAction SilentlyContinue) {
            $scpCommand = "sshpass"
            $scpArgs = @("-p", $Password) + $scpArgs
        } elseif (Get-Command plink -ErrorAction SilentlyContinue) {
            Write-Host "⚠️  Используется plink (PuTTY)" -ForegroundColor Yellow
            $scpCommand = "pscp"
            $scpArgs = @("-pw", $Password) + $scpArgs
        } else {
            Write-Host "❌ Для использования пароля установите sshpass или PuTTY" -ForegroundColor Red
            Write-Host "   Скачайте PuTTY: https://www.putty.org/" -ForegroundColor Yellow
            return $false
        }
    }
    
    try {
        $process = Start-Process -FilePath $scpCommand -ArgumentList $scpArgs -Wait -NoNewWindow -PassThru
        if ($process.ExitCode -ne 0) {
            Write-Host "❌ Ошибка загрузки файлов на станцию $IP" -ForegroundColor Red
            Write-Host "   Возможные причины:" -ForegroundColor Yellow
            Write-Host "   - SSH ключи не настроены" -ForegroundColor Yellow
            Write-Host "   - Неправильное имя пользователя или пароль" -ForegroundColor Yellow
            Write-Host "   - Проблемы с сетью" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ Ошибка выполнения SCP: $_" -ForegroundColor Red
        return $false
    }
    
    Write-Host "✅ Файлы загружены" -ForegroundColor Green
    
    # Выполнение скрипта развертывания на станции
    Write-Host "🔧 Выполнение развертывания на станции..." -ForegroundColor Yellow
    
    $deployScript = @"
#!/bin/bash
STATION_PATH="$StationPath"
ARCHIVE_PATH="/tmp/quiz-station-deploy.tar.gz"

echo "📍 Подготовка директории проекта..."
mkdir -p "`$STATION_PATH" || exit 1
cd "`$STATION_PATH" || exit 1

echo "⏹️  Остановка приложения (если запущено)..."
pm2 stop quiz-site 2>/dev/null || echo "Приложение не было запущено"
pm2 delete quiz-site 2>/dev/null || echo "Процесс не найден"

echo "💾 Создание резервной копии..."
if [ "`$(ls -A . 2>/dev/null)" ]; then
    BACKUP_DIR="`$STATION_PATH/backup-`$(date +%Y%m%d_%H%M%S)"
    mkdir -p "`$BACKUP_DIR"
    cp -r * "`$BACKUP_DIR/" 2>/dev/null && echo "✅ Резервная копия: `$BACKUP_DIR"
fi

echo "🗑️  Очистка старых файлов..."
rm -rf * .* 2>/dev/null || true

echo "📦 Распаковка новых файлов..."
if [ -f "`$ARCHIVE_PATH" ]; then
    tar -xzf "`$ARCHIVE_PATH" || exit 1
    echo "✅ Файлы распакованы"
else
    echo "❌ Архив не найден: `$ARCHIVE_PATH"
    exit 1
fi

echo "📋 Установка зависимостей..."
npm install --production --silent || echo "⚠️  Предупреждение: ошибка установки зависимостей"

echo "🔧 Настройка прав доступа..."
chmod +x scripts/start.sh 2>/dev/null || true
chmod +x scripts/deploy-to-stations.sh 2>/dev/null || true

echo "🚀 Запуск приложения..."
pm2 start server.js --name "quiz-site" || echo "⚠️  Предупреждение: ошибка запуска приложения"

echo "🔄 Настройка автозапуска..."
pm2 startup systemd -u `$USER --hp `$HOME 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "⏳ Ожидание запуска сервера..."
sleep 2

echo "🧹 Очистка временных файлов..."
rm -f "`$ARCHIVE_PATH"

echo "✅ Развертывание на станции завершено!"
"@
    
    $deployScriptPath = "$env:TEMP\deploy-station-$PID.sh"
    $deployScript | Out-File -FilePath $deployScriptPath -Encoding UTF8
    
    $sshCommand = "ssh"
    $sshArgs = @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=3",
        "${Username}@${IP}",
        "bash -s"
    )
    
    if ($Password) {
        if (Get-Command sshpass -ErrorAction SilentlyContinue) {
            $sshCommand = "sshpass"
            $sshArgs = @("-p", $Password, "ssh") + $sshArgs
        } elseif (Get-Command plink -ErrorAction SilentlyContinue) {
            $sshCommand = "plink"
            $sshArgs = @("-pw", $Password, "${Username}@${IP}") + @("bash -s")
        }
    }
    
    try {
        Get-Content $deployScriptPath | & $sshCommand $sshArgs
        $exitCode = $LASTEXITCODE
        
        Remove-Item $deployScriptPath -ErrorAction SilentlyContinue
        
        if ($exitCode -eq 0) {
            Write-Host "✅ Станция #$StationNum ($IP) успешно обновлена" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Ошибка развертывания на станции #$StationNum ($IP)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Ошибка выполнения скрипта развертывания: $_" -ForegroundColor Red
        Remove-Item $deployScriptPath -ErrorAction SilentlyContinue
        return $false
    }
}

# Создание архива с файлами проекта
Write-Host "📦 Создание архива с файлами проекта..." -ForegroundColor Yellow
Write-Host "🌐 Исключаем локальные файлы (локальный режим не деплоится на станции)..." -ForegroundColor Yellow

# Проверка наличия tar (обычно доступен в Git Bash или WSL)
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Host "❌ tar не найден. Установите Git for Windows или используйте WSL" -ForegroundColor Red
    Write-Host "   Скачайте Git: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

$excludeArgs = @(
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=*.backup",
    "--exclude=*.log",
    "--exclude=*.tar.gz",
    "--exclude=README.md",
    "--exclude=CHECKLIST.md",
    "--exclude=DEPLOY.md",
    "--exclude=DESIGN.md",
    "--exclude=RENDER_UPDATE.md",
    "--exclude=ИНСТРУКЦИЯ_ЗАПУСКА.md",
    "--exclude=УСТАНОВКА.md",
    "--exclude=public/fonts",
    "--exclude=.env.local",
    "--exclude=server/local",
    "--exclude=public/local-*.html"
)

$filesToInclude = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "public",
    "scripts/start.sh",
    "nodemon.json",
    "server",
    "data",
    "tests",
    "docs"
)

try {
    & tar -czf quiz-station-deploy.tar.gz $excludeArgs $filesToInclude 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Ошибка создания архива"
    }
} catch {
    Write-Host "❌ Ошибка создания архива: $_" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Архив создан: quiz-station-deploy.tar.gz" -ForegroundColor Green
Write-Host ""

# Статистика
$SuccessCount = 0
$FailedCount = 0
$SkippedCount = 0

# Развертывание на всех станциях
for ($i = 0; $i -lt $StationIPs.Length; $i++) {
    $stationIP = $StationIPs[$i]
    $stationNum = $i + 1
    
    if (Deploy-ToStation -IP $stationIP -StationNum $stationNum -Username $Username -Password $Password -StationPath $StationPath) {
        $SuccessCount++
    } else {
        if (Test-StationPing -IP $stationIP) {
            $FailedCount++
        } else {
            $SkippedCount++
        }
    }
}

# Очистка локального архива
Remove-Item quiz-station-deploy.tar.gz -ErrorAction SilentlyContinue

# Итоговая статистика
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 Итоговая статистика развертывания:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Успешно: $SuccessCount" -ForegroundColor Green
Write-Host "❌ Ошибки: $FailedCount" -ForegroundColor Red
Write-Host "⚠️  Пропущено (недоступно): $SkippedCount" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

if ($SuccessCount -gt 0) {
    Write-Host "🎉 Развертывание завершено!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Развертывание не удалось ни на одной станции" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Советы по устранению проблем:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Проверьте доступность станций:" -ForegroundColor Yellow
    Write-Host "   Test-Connection 192.168.1.21" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Проверьте SSH подключение:" -ForegroundColor Yellow
    Write-Host "   ssh ${Username}@192.168.1.21" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Если используете SSH ключи, убедитесь что они настроены:" -ForegroundColor Yellow
    Write-Host "   ssh-copy-id ${Username}@192.168.1.21" -ForegroundColor White
    Write-Host ""
    Write-Host "4. Если станции в другой подсети, измените IP адреса в скрипте" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

