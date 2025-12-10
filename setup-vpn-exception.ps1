# Скрипт для настройки исключения VPN для локальной сети
# Запустите от имени администратора

Write-Host "Настройка исключения VPN для локальной сети" -ForegroundColor Cyan
Write-Host ""

# Получаем IP адрес шлюза по умолчанию
$gateway = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Where-Object {$_.NextHop -ne $null}).NextHop | Select-Object -First 1

if (-not $gateway) {
    Write-Host "❌ Не удалось определить шлюз по умолчанию" -ForegroundColor Red
    exit 1
}

Write-Host "Найден шлюз: $gateway" -ForegroundColor Green

# Определяем локальную подсеть
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*"}).IPAddress | Select-Object -First 1

if ($localIP) {
    $subnet = $localIP -replace '\.\d+$', '.0'
    Write-Host "Найдена локальная подсеть: $subnet/24" -ForegroundColor Green
} else {
    $subnet = "192.168.0.0"
    Write-Host "Используется подсеть по умолчанию: $subnet/24" -ForegroundColor Yellow
}

# Добавляем статический маршрут для локальной сети
Write-Host ""
Write-Host "Добавление статического маршрута..." -ForegroundColor Cyan

try {
    # Удаляем существующий маршрут, если есть
    Remove-NetRoute -DestinationPrefix "$subnet/24" -ErrorAction SilentlyContinue
    
    # Добавляем новый маршрут через локальный шлюз
    New-NetRoute -DestinationPrefix "$subnet/24" -NextHop $gateway -InterfaceAlias (Get-NetRoute -DestinationPrefix "0.0.0.0/0").InterfaceAlias -ErrorAction Stop
    
    Write-Host "✅ Маршрут успешно добавлен!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Теперь трафик к локальной сети ($subnet/24) будет идти напрямую, минуя VPN" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при добавлении маршрута: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Попробуйте выполнить команду вручную:" -ForegroundColor Yellow
    Write-Host "route add $subnet mask 255.255.255.0 $gateway metric 1 -p" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Проверка доступности ESP32..." -ForegroundColor Cyan
$esp32IP = "192.168.0.172"
$ping = Test-Connection -ComputerName $esp32IP -Count 2 -Quiet -ErrorAction SilentlyContinue

if ($ping) {
    Write-Host "✅ ESP32 доступен по адресу $esp32IP" -ForegroundColor Green
} else {
    Write-Host "⚠️ ESP32 недоступен по адресу $esp32IP" -ForegroundColor Yellow
    Write-Host "   Проверьте, что ESP32 включен и подключен к WiFi" -ForegroundColor Yellow
}

