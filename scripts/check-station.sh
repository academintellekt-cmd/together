#!/bin/bash
# Скрипт проверки статуса станции
# Использование: ./check-station.sh STATION_IP [USERNAME] [PASSWORD]

if [ $# -lt 1 ]; then
    echo "Использование: ./check-station.sh STATION_IP [USERNAME] [PASSWORD]"
    echo "Пример: ./check-station.sh 192.168.1.21"
    exit 1
fi

STATION_IP=$1
USERNAME=${2:-вася}
PASSWORD=${3:-"123123123"}

echo "🔍 Проверка станции $STATION_IP..."
echo ""

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

# Функция для выполнения команды через SSH
run_ssh_cmd() {
    local cmd="$1"
    if [ -z "$PASSWORD" ]; then
        ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "$cmd" 2>&1
    elif command -v sshpass > /dev/null 2>&1; then
        sshpass -p "$PASSWORD" ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "$cmd" 2>&1
    elif command -v expect > /dev/null 2>&1; then
        expect << EOF 2>/dev/null | grep -v "spawn\|password:"
set timeout 10
spawn ssh $SSH_OPTS ${USERNAME}@${STATION_IP} "$cmd"
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    eof
}
EOF
    fi
}

echo "1. Проверка Node.js..."
NODE_VERSION=$(run_ssh_cmd "node --version 2>&1")
if echo "$NODE_VERSION" | grep -q "v[0-9]"; then
    echo "   ✅ Node.js: $NODE_VERSION"
else
    echo "   ❌ Node.js не установлен"
fi

echo ""
echo "2. Проверка файлов проекта..."
HAS_SERVER=$(run_ssh_cmd "cd C:\\together && if exist server.js (echo EXISTS) else (echo NOT_FOUND)")
if echo "$HAS_SERVER" | grep -q "EXISTS"; then
    echo "   ✅ server.js найден"
else
    echo "   ❌ server.js не найден"
fi

echo ""
echo "3. Проверка зависимостей..."
HAS_NODE_MODULES=$(run_ssh_cmd "cd C:\\together && if exist node_modules (echo EXISTS) else (echo NOT_FOUND)")
if echo "$HAS_NODE_MODULES" | grep -q "EXISTS"; then
    echo "   ✅ node_modules найден"
else
    echo "   ❌ node_modules не найден (нужно запустить npm install)"
fi

echo ""
echo "4. Проверка запущенного процесса..."
PROCESS=$(run_ssh_cmd "tasklist | findstr node.exe 2>&1")
if echo "$PROCESS" | grep -q "node.exe"; then
    echo "   ✅ Node.js процесс запущен"
    echo "$PROCESS" | grep "node.exe"
else
    echo "   ❌ Node.js процесс не запущен"
fi

echo ""
echo "5. Проверка порта 3000..."
PORT_CHECK=$(run_ssh_cmd "netstat -an | findstr :3000 2>&1")
if echo "$PORT_CHECK" | grep -q "LISTENING\|0.0.0.0:3000\|:::3000"; then
    echo "   ✅ Порт 3000 слушается"
    echo "$PORT_CHECK" | grep ":3000"
else
    echo "   ❌ Порт 3000 не слушается"
fi

echo ""
echo "6. Проверка доступности извне..."
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://${STATION_IP}:3000/ 2>/dev/null | grep -q "200\|301\|302"; then
    echo "   ✅ Приложение доступно по http://${STATION_IP}:3000/"
else
    echo "   ❌ Приложение недоступно по http://${STATION_IP}:3000/"
    echo "   Возможные причины:"
    echo "   - Приложение не запущено"
    echo "   - Файрвол блокирует порт 3000"
    echo "   - Приложение слушает только на localhost"
fi

echo ""
echo "✅ Проверка завершена"

