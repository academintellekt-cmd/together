#!/bin/bash
# Скрипт проверки связи между станцией и сервером
# Использование: ./check-connection.sh STATION_IP [SERVER_IP]

STATION_IP=${1:-192.168.1.21}
SERVER_IP=${2:-192.168.1.10}

echo "🔍 Проверка связи между станцией ($STATION_IP) и сервером ($SERVER_IP)"
echo ""

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Проверка доступности станции
echo "1️⃣ Проверка доступности станции $STATION_IP..."
if ping -c 1 -W 2 "$STATION_IP" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ Станция доступна по сети${NC}"
else
    echo -e "   ${RED}❌ Станция недоступна${NC}"
fi

# 2. Проверка HTTP сервера на станции
echo ""
echo "2️⃣ Проверка HTTP сервера на станции..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${STATION_IP}:3000/" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "   ${GREEN}✅ HTTP сервер отвечает (код: $HTTP_CODE)${NC}"
else
    echo -e "   ${RED}❌ HTTP сервер не отвечает (код: $HTTP_CODE)${NC}"
fi

# 3. Проверка страницы station.html
echo ""
echo "3️⃣ Проверка страницы station.html..."
STATION_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${STATION_IP}:3000/station.html" 2>/dev/null)
if [ "$STATION_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ Страница station.html доступна${NC}"
else
    echo -e "   ${YELLOW}⚠️  Страница station.html недоступна (код: $STATION_CODE)${NC}"
fi

# 4. Проверка API локального режима (если есть центральный сервер)
if [ "$SERVER_IP" != "$STATION_IP" ]; then
    echo ""
    echo "4️⃣ Проверка API на центральном сервере $SERVER_IP..."
    API_RESPONSE=$(curl -s --connect-timeout 5 "http://${SERVER_IP}:3000/api/local/stations/status" 2>&1)
    if echo "$API_RESPONSE" | grep -q '"success"'; then
        echo -e "   ${GREEN}✅ API локального режима работает${NC}"
        echo "$API_RESPONSE" | python3 -m json.tool 2>/dev/null | head -20 || echo "$API_RESPONSE" | head -5
    else
        echo -e "   ${YELLOW}⚠️  API локального режима недоступно или сервер не запущен${NC}"
        echo "   Ответ: $(echo "$API_RESPONSE" | head -3)"
    fi
fi

# 5. Проверка регистрации станции (если локальный режим работает)
echo ""
echo "5️⃣ Проверка регистрации станции..."
REGISTER_RESPONSE=$(curl -s -X POST "http://${STATION_IP}:3000/api/local/register-station" \
    -H "Content-Type: application/json" \
    -d "{\"ip\":\"${STATION_IP}\",\"stationNumber\":1}" 2>&1)
if echo "$REGISTER_RESPONSE" | grep -q '"success"'; then
    echo -e "   ${GREEN}✅ Станция может регистрироваться${NC}"
    echo "$REGISTER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESPONSE" | head -3
else
    echo -e "   ${YELLOW}⚠️  Регистрация станции недоступна (возможно, локальный режим не загружен)${NC}"
    echo "   Ответ: $(echo "$REGISTER_RESPONSE" | head -3)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Итоговая проверка:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Для проверки связи откройте в браузере на станции:"
echo "  http://${STATION_IP}:3000/station.html"
echo ""
echo "Если страница загружается - связь есть! ✅"
echo ""



