#!/bin/bash
# Диагностический скрипт для проверки ESP32

ESP32_IP="192.168.0.71"

echo "🔍 Диагностика ESP32 на $ESP32_IP"
echo "========================================"
echo ""

# Проверка доступности по ping
echo "1️⃣ Проверка доступности (ping)..."
if ping -c 2 -W 2 $ESP32_IP > /dev/null 2>&1; then
    echo "   ✅ ESP32 отвечает на ping"
    PING_TIME=$(ping -c 1 -W 1 $ESP32_IP 2>&1 | grep "time=" | awk -F'time=' '{print $2}' | awk '{print $1}')
    echo "   ⏱️  Время отклика: $PING_TIME"
else
    echo "   ❌ ESP32 НЕ отвечает на ping"
    echo "   💡 Проверьте, что ESP32 подключен к WiFi"
    exit 1
fi
echo ""

# Проверка порта 80
echo "2️⃣ Проверка порта 80 (HTTP)..."
if timeout 3 bash -c "echo > /dev/tcp/$ESP32_IP/80" 2>/dev/null; then
    echo "   ✅ Порт 80 открыт"
else
    echo "   ❌ Порт 80 НЕ отвечает"
    echo "   💡 Веб-сервер не запущен или завис"
fi
echo ""

# Проверка HTTP ответа
echo "3️⃣ Проверка HTTP сервера..."
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 3 http://$ESP32_IP/ 2>&1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)
HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ HTTP сервер отвечает (код: $HTTP_CODE)"
    echo "   📄 Первые 200 символов ответа:"
    echo "$HTTP_BODY" | head -c 200
    echo "..."
elif [ "$HTTP_CODE" = "000" ]; then
    echo "   ❌ HTTP сервер НЕ отвечает (таймаут)"
    echo "   💡 Веб-сервер не запущен или завис"
else
    echo "   ⚠️  HTTP сервер отвечает с кодом: $HTTP_CODE"
fi
echo ""

# Проверка API статуса
echo "4️⃣ Проверка API /api/status..."
API_RESPONSE=$(curl -s --connect-timeout 3 http://$ESP32_IP/api/status 2>&1)
if [ $? -eq 0 ] && [ ! -z "$API_RESPONSE" ]; then
    echo "   ✅ API отвечает"
    echo "   📄 Ответ:"
    echo "$API_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$API_RESPONSE"
else
    echo "   ❌ API НЕ отвечает"
fi
echo ""

# Проверка MAC адреса
echo "5️⃣ Проверка MAC адреса в ARP таблице..."
MAC=$(arp -n $ESP32_IP 2>/dev/null | grep -oE "([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}" | head -1)
if [ ! -z "$MAC" ]; then
    echo "   ✅ MAC адрес: $MAC"
    # ESP32 обычно имеет MAC начинающийся с определенных префиксов
    if echo "$MAC" | grep -qiE "(24:0a|c4:4f|ac:67|a4:cf|30:ae|e8:db|84:0d|84:cc)"; then
        echo "   ✅ Похоже на ESP32 (типичные префиксы MAC)"
    else
        echo "   ⚠️  MAC адрес не похож на типичный ESP32"
    fi
else
    echo "   ⚠️  MAC адрес не найден в ARP таблице"
fi
echo ""

echo "========================================"
echo "📋 РЕКОМЕНДАЦИИ:"
echo ""
if ping -c 1 -W 1 $ESP32_IP > /dev/null 2>&1; then
    if ! timeout 2 bash -c "echo > /dev/tcp/$ESP32_IP/80" 2>/dev/null; then
        echo "⚠️  ESP32 доступен по сети, но веб-сервер не работает"
        echo ""
        echo "Возможные причины:"
        echo "1. Веб-сервер не запустился при загрузке прошивки"
        echo "2. Веб-сервер завис в loop()"
        echo "3. Проблема с памятью ESP32"
        echo ""
        echo "Что делать:"
        echo "1. Откройте Serial Monitor в Arduino IDE (115200 baud)"
        echo "2. Нажмите кнопку Reset на ESP32"
        echo "3. Проверьте логи - должны быть строки:"
        echo "   - '[HTTP] HTTP сервер запущен'"
        echo "   - '[HTTP] Доступен по адресу: http://192.168.0.71'"
        echo "4. Если этих строк нет - веб-сервер не запустился"
        echo "5. Если строки есть, но сервер не отвечает - возможна проблема в loop()"
    else
        echo "✅ ESP32 работает нормально!"
        echo "   Откройте в браузере: http://$ESP32_IP"
    fi
else
    echo "❌ ESP32 недоступен по сети"
    echo "   Проверьте подключение к WiFi и настройки сети"
fi


