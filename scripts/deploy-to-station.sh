#!/bin/bash
# Скрипт развертывания на одну станцию
# Использование: ./deploy-to-station.sh STATION_IP [USERNAME] [PASSWORD] [STATION_PATH]

if [ $# -lt 1 ]; then
    echo "Использование: ./deploy-to-station.sh STATION_IP [USERNAME] [PASSWORD] [STATION_PATH]"
    echo "Пример: ./deploy-to-station.sh 192.168.1.21"
    echo "Или: ./deploy-to-station.sh 192.168.1.21 вася 123123123 /home/вася/together"
    exit 1
fi

STATION_IP=$1
USERNAME=${2:-вася}
PASSWORD=${3:-"123123123"}
# Определяем путь по умолчанию (для Windows используем C:\together)
STATION_PATH=${4:-""}
if [ -z "$STATION_PATH" ]; then
    # Проверяем, Windows ли это (будет определено позже)
    STATION_PATH="/home/$USERNAME/together"
fi

echo "🚀 Развертывание на станцию $STATION_IP..."
echo "📋 Параметры:"
echo "   IP: $STATION_IP"
echo "   Пользователь: $USERNAME"
echo "   Пароль: ${PASSWORD:+***указан***}"
echo "   Путь: $STATION_PATH"
echo ""

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Проверка доступности
echo "🔍 Проверка доступности станции..."
PING_OK=false
SSH_OK=false

# Проверка ping (не критично, может быть заблокирован файрволом)
if ping -c 1 -W 2 "$STATION_IP" > /dev/null 2>&1; then
    PING_OK=true
    echo -e "${GREEN}✅ Станция доступна по сети (ping)${NC}"
else
    echo -e "${YELLOW}⚠️  Ping не проходит (может быть заблокирован файрволом)${NC}"
fi

# Проверка SSH (более важная проверка)
echo "🔐 Проверка SSH подключения..."
SSH_OPTS_TEST="-o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no"
if ssh $SSH_OPTS_TEST "${USERNAME}@${STATION_IP}" exit 2>/dev/null; then
    SSH_OK=true
    echo -e "${GREEN}✅ SSH подключение работает (SSH ключи настроены)${NC}"
else
    if [ -n "$PASSWORD" ]; then
        echo -e "${YELLOW}⚠️  SSH ключи не настроены, будет использован пароль${NC}"
        SSH_OK=true  # Предполагаем что с паролем заработает
    else
        echo -e "${YELLOW}⚠️  SSH ключи не настроены, попробуем подключиться с паролем${NC}"
        echo "   Если подключение не удастся, укажите пароль:"
        echo "   ./deploy-to-station.sh $STATION_IP $USERNAME ваш_пароль"
    fi
fi

if [ "$PING_OK" = false ] && [ "$SSH_OK" = false ] && [ -z "$PASSWORD" ]; then
    echo -e "${RED}❌ Не удалось проверить доступность станции${NC}"
    echo "   Попробуйте указать пароль:"
    echo "   ./deploy-to-station.sh $STATION_IP $USERNAME ваш_пароль"
    exit 1
fi

# Создание архива
echo ""
echo "📦 Создание архива..."
tar -czf quiz-station-deploy.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=*.backup \
    --exclude=*.log \
    --exclude=*.tar.gz \
    --exclude=README.md \
    --exclude=CHECKLIST.md \
    --exclude=DEPLOY.md \
    --exclude=DESIGN.md \
    --exclude=RENDER_UPDATE.md \
    --exclude=ИНСТРУКЦИЯ_ЗАПУСКА.md \
    --exclude=УСТАНОВКА.md \
    --exclude=public/fonts \
    --exclude=.env.local \
    --exclude=server/local \
    --exclude=public/local-*.html \
    server.js package.json package-lock.json public/ scripts/start.sh nodemon.json server/ data/ tests/ docs/ 2>/dev/null

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Ошибка создания архива${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Архив создан${NC}"

# Определяем тип системы на станции
echo "🔍 Определение типа системы на станции..."
SYSTEM_TYPE="windows"  # По умолчанию Windows для станции Вася
STATION_PATH="C:\\together"  # Путь для Windows
REMOTE_TMP="C:\\tmp"
REMOTE_ARCHIVE="$REMOTE_TMP\\quiz-station-deploy.tar.gz"
echo "✅ Используется Windows система (станция Вася)"

# Создаем скрипт развертывания для станции
if [ "$SYSTEM_TYPE" = "windows" ]; then
    # Используем готовый PowerShell скрипт
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    DEPLOY_SCRIPT="$PROJECT_ROOT/scripts/deploy-station-windows.ps1"
    DEPLOY_SCRIPT_NAME="deploy-station-windows.ps1"
    REMOTE_SCRIPT_PATH="C:\\tmp\\$DEPLOY_SCRIPT_NAME"
    
    if [ ! -f "$DEPLOY_SCRIPT" ]; then
        echo -e "${RED}❌ Файл $DEPLOY_SCRIPT не найден${NC}"
        exit 1
    fi
else
    # Bash скрипт для Linux
    DEPLOY_SCRIPT="/tmp/deploy-station-$$.sh"
    cat > "$DEPLOY_SCRIPT" << DEPLOY_SCRIPT_EOF
#!/bin/bash
STATION_PATH="$STATION_PATH"
ARCHIVE_PATH="/tmp/quiz-station-deploy.tar.gz"

echo "📍 Подготовка директории проекта..."
mkdir -p "\$STATION_PATH" || exit 1
cd "\$STATION_PATH" || exit 1

echo "⏹️  Остановка приложения (если запущено)..."
pm2 stop quiz-site 2>/dev/null || echo "Приложение не было запущено"
pm2 delete quiz-site 2>/dev/null || echo "Процесс не найден"

echo "💾 Создание резервной копии..."
if [ "\$(ls -A . 2>/dev/null)" ]; then
    BACKUP_DIR="\$STATION_PATH/backup-\$(date +%Y%m%d_%H%M%S)"
    mkdir -p "\$BACKUP_DIR"
    cp -r * "\$BACKUP_DIR/" 2>/dev/null && echo "✅ Резервная копия: \$BACKUP_DIR"
fi

echo "🗑️  Очистка старых файлов..."
rm -rf * .* 2>/dev/null || true

echo "📦 Распаковка новых файлов..."
if [ -f "\$ARCHIVE_PATH" ]; then
    tar -xzf "\$ARCHIVE_PATH" || exit 1
    echo "✅ Файлы распакованы"
else
    echo "❌ Архив не найден: \$ARCHIVE_PATH"
    exit 1
fi

echo "📋 Установка зависимостей..."
npm install --production --silent || echo "⚠️  Предупреждение: ошибка установки зависимостей"

echo "🔧 Настройка прав доступа..."
chmod +x scripts/start.sh 2>/dev/null || true

echo "🚀 Запуск приложения..."
pm2 start server.js --name "quiz-site" || echo "⚠️  Предупреждение: ошибка запуска приложения"

echo "🔄 Настройка автозапуска..."
pm2 startup systemd -u \$USER --hp \$HOME 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "⏳ Ожидание запуска сервера..."
sleep 2

echo "🧹 Очистка временных файлов..."
rm -f "\$ARCHIVE_PATH"

echo "✅ Развертывание на станции завершено!"
DEPLOY_SCRIPT_EOF
    chmod +x "$DEPLOY_SCRIPT"
fi

# Пути уже определены выше
echo ""

# Загрузка файлов
echo ""
echo "📤 Загрузка файлов на станцию..."
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3"

if [ -z "$PASSWORD" ]; then
    # Без пароля (SSH ключи)
    scp_output=$(scp $SSH_OPTS quiz-station-deploy.tar.gz "$DEPLOY_SCRIPT" "${USERNAME}@${STATION_IP}:/tmp/" 2>&1)
    scp_exit_code=$?
    echo "$scp_output" | grep -v "Warning: Permanently added" || true
else
    # С паролем - пробуем разные способы
    if command -v sshpass > /dev/null 2>&1; then
        # Используем sshpass
        if [ "$SYSTEM_TYPE" = "windows" ]; then
            scp_output=$(sshpass -p "$PASSWORD" scp $SSH_OPTS quiz-station-deploy.tar.gz "${USERNAME}@${STATION_IP}:C:/tmp/" 2>&1)
        else
            scp_output=$(sshpass -p "$PASSWORD" scp $SSH_OPTS quiz-station-deploy.tar.gz "$DEPLOY_SCRIPT" "${USERNAME}@${STATION_IP}:/tmp/" 2>&1)
        fi
        scp_exit_code=$?
        echo "$scp_output" | grep -v "Warning: Permanently added" || true
    elif command -v expect > /dev/null 2>&1; then
        # Используем expect как альтернативу
        if [ "$SYSTEM_TYPE" = "windows" ]; then
            expect << EOF
set timeout 30
spawn scp $SSH_OPTS quiz-station-deploy.tar.gz ${USERNAME}@${STATION_IP}:C:/tmp/
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    "Permission denied" {
        exit 1
    }
    eof
}
set scp_exit_code [wait]
exit [lindex \$scp_exit_code 3]
EOF
        else
            expect << EOF
set timeout 30
spawn scp $SSH_OPTS quiz-station-deploy.tar.gz "$DEPLOY_SCRIPT" ${USERNAME}@${STATION_IP}:/tmp/
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    "Permission denied" {
        exit 1
    }
    eof
}
set scp_exit_code [wait]
exit [lindex \$scp_exit_code 3]
EOF
        fi
        scp_exit_code=$?
    else
        echo -e "${YELLOW}⚠️  sshpass или expect не установлены${NC}"
        echo "   Установите один из них:"
        echo "   - sshpass: brew install hudochenkov/sshpass/sshpass"
        echo "   - expect: brew install expect"
        echo ""
        echo -e "${YELLOW}Или скопируйте ключ вручную:${NC}"
        echo "   cat ~/.ssh/id_rsa.pub | ssh ${USERNAME}@${STATION_IP} 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'"
        rm -f "$DEPLOY_SCRIPT" quiz-station-deploy.tar.gz
        exit 1
    fi
fi

if [ $scp_exit_code -ne 0 ]; then
    echo -e "${RED}❌ Ошибка загрузки файлов${NC}"
    rm -f "$DEPLOY_SCRIPT" quiz-station-deploy.tar.gz
    exit 1
fi
echo -e "${GREEN}✅ Файлы загружены${NC}"

# Выполнение скрипта на станции
echo ""
echo "🔧 Выполнение развертывания на станции..."

if [ "$SYSTEM_TYPE" = "windows" ]; then
    # Для Windows используем PowerShell
    DEPLOY_SCRIPT_NAME="deploy-station-windows.ps1"
    REMOTE_SCRIPT_PATH="C:\\tmp\\$DEPLOY_SCRIPT_NAME"
    
    # Загружаем PowerShell скрипт
    if [ -z "$PASSWORD" ]; then
        scp $SSH_OPTS "$DEPLOY_SCRIPT" "${USERNAME}@${STATION_IP}:C:/tmp/" 2>&1 | grep -v "Warning: Permanently added" || true
    elif command -v sshpass > /dev/null 2>&1; then
        sshpass -p "$PASSWORD" scp $SSH_OPTS "$DEPLOY_SCRIPT" "${USERNAME}@${STATION_IP}:C:/tmp/" 2>&1 | grep -v "Warning: Permanently added" || true
    elif command -v expect > /dev/null 2>&1; then
        expect << EOF
set timeout 30
spawn scp $SSH_OPTS "$DEPLOY_SCRIPT" ${USERNAME}@${STATION_IP}:C:/tmp/
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    eof
}
EOF
    fi
    
    # Выполняем PowerShell скрипт
    # Убираем одинарные кавычки и экранируем обратные слеши
    REMOTE_SCRIPT_PATH_ESC=$(echo "$REMOTE_SCRIPT_PATH" | sed 's/\\/\\\\/g')
    STATION_PATH_ESC=$(echo "$STATION_PATH" | sed 's/\\/\\\\/g')
    REMOTE_ARCHIVE_ESC=$(echo "$REMOTE_ARCHIVE" | sed 's/\\/\\\\/g')
    
    PS_CMD="powershell -ExecutionPolicy Bypass -File $REMOTE_SCRIPT_PATH_ESC -StationPath $STATION_PATH_ESC -ArchivePath $REMOTE_ARCHIVE_ESC"
    
    if [ -z "$PASSWORD" ]; then
        ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "$PS_CMD"
        ssh_exit_code=$?
    elif command -v sshpass > /dev/null 2>&1; then
        sshpass -p "$PASSWORD" ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "$PS_CMD"
        ssh_exit_code=$?
    elif command -v expect > /dev/null 2>&1; then
        expect << EOF
set timeout 300
spawn ssh $SSH_OPTS ${USERNAME}@${STATION_IP} "$PS_CMD"
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    eof
}
set ssh_exit_code [wait]
exit [lindex \$ssh_exit_code 3]
EOF
        ssh_exit_code=$?
    fi
else
    # Для Linux используем bash
    DEPLOY_SCRIPT_NAME=$(basename "$DEPLOY_SCRIPT")
    if [ -z "$PASSWORD" ]; then
        ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "bash /tmp/$DEPLOY_SCRIPT_NAME"
        ssh_exit_code=$?
    elif command -v sshpass > /dev/null 2>&1; then
        sshpass -p "$PASSWORD" ssh $SSH_OPTS "${USERNAME}@${STATION_IP}" "bash /tmp/$DEPLOY_SCRIPT_NAME"
        ssh_exit_code=$?
    elif command -v expect > /dev/null 2>&1; then
        expect << EOF
set timeout 300
spawn ssh $SSH_OPTS ${USERNAME}@${STATION_IP} "bash /tmp/$DEPLOY_SCRIPT_NAME"
expect {
    "password:" {
        send "$PASSWORD\r"
        exp_continue
    }
    eof
}
set ssh_exit_code [wait]
exit [lindex \$ssh_exit_code 3]
EOF
        ssh_exit_code=$?
    else
        echo -e "${RED}❌ Для использования пароля установите sshpass или expect${NC}"
        rm -f "$DEPLOY_SCRIPT" quiz-station-deploy.tar.gz
        exit 1
    fi
fi

# Очистка
rm -f "$DEPLOY_SCRIPT" quiz-station-deploy.tar.gz

if [ $ssh_exit_code -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Развертывание на станцию $STATION_IP завершено успешно!${NC}"
    echo ""
    echo "Проверьте работу приложения:"
    echo "  curl http://$STATION_IP:3000/"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Ошибка развертывания на станцию $STATION_IP${NC}"
    exit 1
fi

