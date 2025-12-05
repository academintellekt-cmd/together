#!/bin/bash
# Скрипт для проверки подключения ESP32

echo "🔍 Поиск ESP32 в сети..."
echo ""

# Попробуем найти ESP32 по известным IP диапазонам
# Обычно ESP32 получает IP в диапазоне 192.168.1.x или 192.168.0.x

FOUND=false

# Определяем подсеть из IP компьютера
MY_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.0.1")
SUBNET=$(echo $MY_IP | cut -d'.' -f1-3)

echo "🔍 Поиск ESP32 в подсети $SUBNET.x..."
echo ""

# Проверяем локальную сеть
for i in {1..254}; do
    IP="$SUBNET.$i"
    if curl -s --connect-timeout 1 "http://$IP/api/status" > /dev/null 2>&1; then
        echo "✅ Найден ESP32 на IP: $IP"
        echo ""
        echo "📡 Проверка статуса..."
        curl -s "http://$IP/api/status" | python3 -m json.tool 2>/dev/null || curl -s "http://$IP/api/status"
        echo ""
        echo "💡 Обновите конфигурацию:"
        echo "   server/dmx/dmx-config.json"
        echo "   Измените на:"
        echo "   {"
        echo "     \"type\": \"esp32\","
        echo "     \"host\": \"$IP\","
        echo "     \"port\": 80"
        echo "   }"
        FOUND=true
        break
    fi
    # Показываем прогресс каждые 50 IP
    if [ $((i % 50)) -eq 0 ]; then
        echo "   Проверено $i из 254..."
    fi
done

if [ "$FOUND" = false ]; then
    echo "❌ ESP32 не найден в сети $SUBNET.x"
    echo ""
    echo "Попробуйте:"
    echo "1. Откройте Serial Monitor в Arduino IDE (115200 baud)"
    echo "2. ESP32 покажет IP адрес после подключения к WiFi"
    echo "3. Или откройте http://[IP_ESP32] в браузере"
    echo ""
    echo "Или введите IP адрес ESP32 вручную:"
    read -p "IP адрес ESP32: " ESP32_IP
    if [ ! -z "$ESP32_IP" ]; then
        if curl -s --connect-timeout 2 "http://$ESP32_IP/api/status" > /dev/null 2>&1; then
            echo "✅ ESP32 найден на $ESP32_IP"
            curl -s "http://$ESP32_IP/api/status" | python3 -m json.tool 2>/dev/null || curl -s "http://$ESP32_IP/api/status"
        else
            echo "❌ ESP32 недоступен на $ESP32_IP"
        fi
    fi
fi



