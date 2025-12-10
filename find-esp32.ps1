# Скрипт для поиска ESP32 в локальной сети
# Проверяет доступность устройств в диапазоне 192.168.0.1-254

Write-Host "Поиск ESP32 в локальной сети..." -ForegroundColor Cyan
Write-Host "Это может занять несколько минут..." -ForegroundColor Yellow
Write-Host ""

$foundDevices = @()
$baseIP = "192.168.0"

# Проверяем диапазон 1-254
for ($i = 1; $i -le 254; $i++) {
    $ip = "$baseIP.$i"
    Write-Progress -Activity "Сканирование сети" -Status "Проверка $ip" -PercentComplete (($i / 254) * 100)
    
    $ping = Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue
    if ($ping) {
        Write-Host "✓ Найдено устройство: $ip" -ForegroundColor Green
        
        # Пробуем проверить, это ли ESP32 (проверяем HTTP порт 80)
        try {
            $response = Invoke-WebRequest -Uri "http://$ip/api/dmx/status" -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                $foundDevices += @{
                    IP = $ip
                    Status = "ESP32 найден!"
                }
                Write-Host "  → Это ESP32 DMX контроллер!" -ForegroundColor Green
            }
        } catch {
            # Не ESP32 или не отвечает на API
        }
    }
}

Write-Progress -Activity "Сканирование сети" -Completed

Write-Host ""
if ($foundDevices.Count -gt 0) {
    Write-Host "Найденные ESP32 устройства:" -ForegroundColor Green
    foreach ($device in $foundDevices) {
        Write-Host "  IP: $($device.IP)" -ForegroundColor Yellow
    }
} else {
    Write-Host "ESP32 не найден в сети." -ForegroundColor Red
    Write-Host ""
    Write-Host "Возможные причины:" -ForegroundColor Yellow
    Write-Host "  1. ESP32 не подключен к WiFi"
    Write-Host "  2. ESP32 в другой подсети"
    Write-Host "  3. ESP32 выключен"
    Write-Host ""
    Write-Host "Попробуйте:" -ForegroundColor Cyan
    Write-Host "  1. Проверить веб-интерфейс роутера для списка подключенных устройств"
    Write-Host "  2. Перезагрузить ESP32"
    Write-Host "  3. Проверить Serial Monitor в Arduino IDE для IP адреса"
}

