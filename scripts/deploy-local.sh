#!/bin/bash
# 🏠 ЛОКАЛЬНЫЙ ДЕПЛОЙ (SSH)
# Скрипт автоматического развертывания файлов на станцию через SSH
# В данный момент используется только станция Вася (192.168.1.21)
# Использование: ./deploy-local.sh [USERNAME] [PASSWORD] [STATION_PATH]

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ℹ️  ДЕПЛОЙ ЛОКАЛЬНЫХ ФАЙЛОВ ОТКЛЮЧЕН"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Станции работают БЕЗ локальных файлов!"
echo "   Все страницы загружаются с центрального сервера."
echo ""
echo "🌐 Для работы станций откройте в браузере:"
echo "   http://<IP_СЕРВЕРА>:3000/station.html"
echo ""
echo "📖 См. инструкцию по настройке автозапуска браузера"
echo "   в документации: docs/deployment/LOCAL.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Параметры по умолчанию
USERNAME=${1:-Вася}  # По умолчанию пользователь 'Вася'
PASSWORD=${2:-"123123123"}   # Пароль по умолчанию
STATION_PATH=${3:-"C:/together"}  # Путь к проекту на станции (Windows: C:\together)

# Режим диагностики (можно включить через переменную окружения)
DIAGNOSTIC_MODE=${DIAGNOSTIC_MODE:-false}

echo "📋 Параметры развертывания:"
echo "   Пользователь: $USERNAME"
echo "   Пароль: ${PASSWORD:+***указан***}"
echo "   Путь на станции: $STATION_PATH (Windows: C:\\together)"
echo ""

# IP адреса станций
# В данный момент используется только станция Васи (192.168.1.21)
STATION_IPS=(
    "192.168.1.21"  # Станция Вася
    # "192.168.1.22" "192.168.1.23" "192.168.1.24"
    # "192.168.1.25" "192.168.1.26" "192.168.1.27" "192.168.1.28" "192.168.1.29"
)

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для проверки доступности станции через ping
check_station_ping() {
    local ip=$1
    if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Функция для проверки доступности SSH порта
check_station_ssh() {
    local ip=$1
    local port=${2:-22}
    # Используем timeout и nc (netcat) если доступен, иначе telnet
    if command -v nc > /dev/null 2>&1; then
        if timeout 3 nc -z "$ip" "$port" > /dev/null 2>&1; then
            return 0
        fi
    elif command -v telnet > /dev/null 2>&1; then
        # Для telnet используем более простую проверку
        if timeout 3 bash -c "echo > /dev/tcp/$ip/$port" 2>/dev/null; then
            return 0
        fi
    else
        # Fallback: пробуем SSH подключение напрямую
        if timeout 3 ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no -o BatchMode=yes "$ip" exit 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Функция для проверки доступности станции (комплексная)
check_station() {
    local ip=$1
    local username=$2
    
    # Сначала проверяем ping
    if ! check_station_ping "$ip"; then
        return 1
    fi
    
    # Затем проверяем SSH порт
    if ! check_station_ssh "$ip"; then
        return 2  # Ping работает, но SSH недоступен
    fi
    
    return 0  # Все проверки пройдены
}

# Функция для развертывания на одной станции
deploy_to_station() {
    local ip=$1
    local station_num=$2
    local username=$3
    local password=$4
    local station_path=$5
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📡 Станция #$station_num ($ip)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Проверка доступности станции
    echo "🔍 Проверка доступности станции..."
    
    local check_result
    check_station "$ip" "$username"
    check_result=$?
    
    if [ $check_result -eq 1 ]; then
        echo -e "${YELLOW}⚠️  Станция $ip недоступна (ping не проходит)${NC}"
        if [ "$DIAGNOSTIC_MODE" = "true" ]; then
            echo "   Диагностика:"
            echo "   - Проверьте, включена ли станция"
            echo "   - Проверьте сетевое подключение"
            echo "   - Проверьте IP адрес: ping $ip"
        fi
        return 1
    elif [ $check_result -eq 2 ]; then
        echo -e "${YELLOW}⚠️  Станция $ip доступна по сети, но SSH порт закрыт или недоступен${NC}"
        echo "   Проверьте на станции:"
        echo "   - Запущен ли SSH сервер: sudo systemctl status ssh"
        echo "   - Открыт ли порт 22: sudo ufw status | grep 22"
        echo "   - Попробуйте подключиться вручную: ssh ${username}@${ip}"
        return 1
    fi
    
    echo "✅ Станция доступна (ping и SSH порт открыты)"
    
    # Дополнительная проверка SSH подключения
    echo "🔐 Проверка SSH подключения..."
    if [ -z "$password" ]; then
        if ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no "${username}@${ip}" exit 2>/dev/null; then
            echo "✅ SSH подключение успешно (используются SSH ключи)"
        else
            echo -e "${YELLOW}⚠️  SSH ключи не настроены или требуется пароль${NC}"
            if [ -z "$PASSWORD" ]; then
                echo "   Попробуйте указать пароль или настройте SSH ключи"
            fi
        fi
    fi
    
    # Создаем временный скрипт для развертывания на станции (Windows)
    local deploy_script="/tmp/deploy-station-$$.sh"
    cat > "$deploy_script" << 'DEPLOY_SCRIPT'
#!/bin/bash
STATION_PATH="$1"
ARCHIVE_PATH="/tmp/quiz-station-deploy.tar.gz"

echo "📍 Подготовка директории для статических файлов..."
# Для Windows пути используем mkdir с -p (работает в Git Bash/WSL)
# Конвертируем путь если нужно (C:/together -> C:\together для Windows команд)
WIN_PATH=$(echo "$STATION_PATH" | sed 's|/|\\|g')
mkdir -p "$STATION_PATH" 2>/dev/null || {
    # Пробуем через Windows команду если mkdir не сработал
    cmd.exe /c "if not exist \"$WIN_PATH\" mkdir \"$WIN_PATH\"" 2>/dev/null || true
}
cd "$STATION_PATH" || {
    # Пробуем через Windows команду
    cmd.exe /c "cd /d \"$WIN_PATH\"" 2>/dev/null || exit 1
}

echo "⏹️  Остановка сервера (если запущен) - НЕ ДОЛЖЕН БЫТЬ ЗАПУЩЕН НА СТАНЦИИ!"
pm2 stop quiz-site 2>/dev/null || echo "Сервер не был запущен (это правильно!)"
pm2 delete quiz-site 2>/dev/null || echo "Процесс не найден (это правильно!)"

echo "💾 Создание резервной копии..."
if [ "$(ls -A . 2>/dev/null 2>&1 | head -1)" ]; then
    BACKUP_DIR="$STATION_PATH/backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR" 2>/dev/null || cmd.exe /c "mkdir \"$(echo "$BACKUP_DIR" | sed 's|/|\\|g')\"" 2>/dev/null
    cp -r * "$BACKUP_DIR/" 2>/dev/null && echo "✅ Резервная копия: $BACKUP_DIR" || {
        # Пробуем через Windows команду
        cmd.exe /c "xcopy \"$WIN_PATH\\*\" \"$(echo "$BACKUP_DIR" | sed 's|/|\\|g')\" /E /I /Y" 2>/dev/null && echo "✅ Резервная копия: $BACKUP_DIR"
    }
fi

echo "🗑️  Очистка старых файлов..."
rm -rf * .* 2>/dev/null || {
    # Пробуем через Windows команду
    cmd.exe /c "del /Q /F \"$WIN_PATH\\*\" 2>nul & rmdir /S /Q \"$WIN_PATH\" 2>nul & mkdir \"$WIN_PATH\"" 2>/dev/null || true
}

echo "📦 Распаковка статических файлов..."
if [ -f "$ARCHIVE_PATH" ]; then
    tar -xzf "$ARCHIVE_PATH" || exit 1
    echo "✅ Файлы распакованы"
else
    echo "❌ Архив не найден: $ARCHIVE_PATH"
    exit 1
fi

echo "🧹 Очистка временных файлов..."
rm -f "$ARCHIVE_PATH"

echo ""
echo "✅ Развертывание на станции завершено!"
echo ""
echo "⚠️  ВАЖНО: Сервер НЕ должен запускаться на станции!"
echo "📋 Инструкция:"
echo "   1. Откройте браузер на станции"
echo "   2. Перейдите на http://<IP_ЦЕНТРАЛЬНОГО_СЕРВЕРА>:3000/station.html"
echo "   3. Страница автоматически подключится к центральному серверу"
echo ""
DEPLOY_SCRIPT
    
    chmod +x "$deploy_script"
    
    # Загружаем архив на станцию
    echo "📤 Загрузка архива на станцию..."
    
    # Увеличиваем таймауты для SSH операций
    local ssh_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3"
    
    if [ -z "$password" ]; then
        # Без пароля (используем SSH ключи)
        scp_output=$(scp $ssh_opts \
            quiz-station-deploy.tar.gz "$deploy_script" \
            "${username}@${ip}:/tmp/" 2>&1)
        scp_exit_code=$?
        
        # Фильтруем предупреждения, но сохраняем код возврата
        echo "$scp_output" | grep -v "Warning: Permanently added" || true
        
        if [ $scp_exit_code -ne 0 ]; then
            echo -e "${RED}❌ Ошибка загрузки файлов на станцию $ip${NC}"
            echo "   Возможные причины:"
            echo "   - SSH ключи не настроены"
            echo "   - Неправильное имя пользователя"
            echo "   - Проблемы с сетью"
            rm -f "$deploy_script"
            return 1
        fi
    else
        # С паролем (используем sshpass)
        if command -v sshpass > /dev/null 2>&1; then
            scp_output=$(sshpass -p "$password" scp $ssh_opts \
                quiz-station-deploy.tar.gz "$deploy_script" \
                "${username}@${ip}:/tmp/" 2>&1)
            scp_exit_code=$?
            
            # Фильтруем предупреждения, но сохраняем код возврата
            echo "$scp_output" | grep -v "Warning: Permanently added" || true
            
            if [ $scp_exit_code -ne 0 ]; then
                echo -e "${RED}❌ Ошибка загрузки файлов на станцию $ip${NC}"
                echo "   Возможные причины:"
                echo "   - Неправильный пароль"
                echo "   - Неправильное имя пользователя"
                echo "   - Проблемы с сетью"
                rm -f "$deploy_script"
                return 1
            fi
        else
            echo -e "${RED}❌ Для использования пароля установите sshpass: brew install hudochenkov/sshpass/sshpass${NC}"
            rm -f "$deploy_script"
            return 1
        fi
    fi
    
    echo "✅ Файлы загружены"
    
    # Выполняем скрипт развертывания на станции
    echo "🔧 Выполнение развертывания на станции..."
    
    local deploy_script_name=$(basename "$deploy_script")
    local ssh_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3"
    local ssh_exit_code=0
    
    if [ -z "$password" ]; then
        ssh $ssh_opts \
            "${username}@${ip}" \
            "bash /tmp/$deploy_script_name '$station_path'" 2>&1
        ssh_exit_code=$?
    else
        if command -v sshpass > /dev/null 2>&1; then
            sshpass -p "$password" ssh $ssh_opts \
                "${username}@${ip}" \
                "bash /tmp/$deploy_script_name '$station_path'" 2>&1
            ssh_exit_code=$?
        else
            echo -e "${RED}❌ Для использования пароля установите sshpass${NC}"
            rm -f "$deploy_script"
            return 1
        fi
    fi
    
    # Очищаем локальный скрипт
    rm -f "$deploy_script"
    
    if [ $ssh_exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ Станция #$station_num ($ip) успешно обновлена${NC}"
        return 0
    else
        echo -e "${RED}❌ Ошибка развертывания на станции #$station_num ($ip)${NC}"
        return 1
    fi
}

# ============================================================================
# ДЕПЛОЙ ЛОКАЛЬНЫХ ФАЙЛОВ ЗАКОММЕНТИРОВАН
# ============================================================================
# ВАЖНО: Станции теперь работают БЕЗ локальных файлов!
# Станции открывают страницы напрямую с центрального сервера:
# http://192.168.1.10:3000/station.html
#
# Все файлы загружаются с сервера, конфигурации джойстиков хранятся на сервере.
# Локальные файлы на станциях НЕ нужны.
#
# Если в будущем понадобится деплой локальных файлов, раскомментируйте код ниже.
# ============================================================================

# # Создание архива с файлами проекта
# echo "📦 Создание архива с файлами проекта..."
# echo "🌐 ВАЖНО: На станциях НЕ должен запускаться сервер!"
# echo "🌐 Копируем только статические файлы (public/) для открытия в браузере..."
# # Создаем архив ТОЛЬКО со статическими файлами для станции
# # Включаем: public/ (HTML, CSS, JS файлы)
# # Исключаем: server.js, server/, data/, node_modules, package.json и все остальное
# tar -czf quiz-station-deploy.tar.gz \
#     --exclude=node_modules \
#     --exclude=.git \
#     --exclude=*.backup \
#     --exclude=*.log \
#     --exclude=*.tar.gz \
#     --exclude=README.md \
#     --exclude=CHECKLIST.md \
#     --exclude=DEPLOY.md \
#     --exclude=DESIGN.md \
#     --exclude=RENDER_UPDATE.md \
#     --exclude=ИНСТРУКЦИЯ_ЗАПУСКА.md \
#     --exclude=УСТАНОВКА.md \
#     --exclude=public/fonts \
#     --exclude=.env.local \
#     --exclude=server/local \
#     --exclude=public/local-*.html \
#     --exclude=server.js \
#     --exclude=package.json \
#     --exclude=package-lock.json \
#     --exclude=nodemon.json \
#     --exclude=server/ \
#     --exclude=scripts/ \
#     --exclude=data/ \
#     --exclude=tests/ \
#     --exclude=docs/ \
#     --exclude=config/ \
#     --exclude=hardware/ \
#     --exclude=logs/ \
#     --exclude=backups/ \
#     public/ 2>/dev/null
#
# if [ $? -ne 0 ]; then
#     echo -e "${RED}❌ Ошибка создания архива${NC}"
#     exit 1
# fi
#
# echo "✅ Архив создан: quiz-station-deploy.tar.gz"
# echo ""
#
# # Статистика
# SUCCESS_COUNT=0
# FAILED_COUNT=0
# SKIPPED_COUNT=0
#
# # Развертывание на всех станциях
# for i in "${!STATION_IPS[@]}"; do
#     station_ip="${STATION_IPS[$i]}"
#     station_num=$((i + 1))
#     
#     if deploy_to_station "$station_ip" "$station_num" "$USERNAME" "$PASSWORD" "$STATION_PATH"; then
#         ((SUCCESS_COUNT++))
#     else
#         if check_station "$station_ip"; then
#             ((FAILED_COUNT++))
#         else
#             ((SKIPPED_COUNT++))
#         fi
#     fi
# done
#
# # Очистка локального архива
# rm -f quiz-station-deploy.tar.gz
#
# # Итоговая статистика
# echo ""
# echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# echo "📊 Итоговая статистика развертывания:"
# echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# echo -e "${GREEN}✅ Успешно: $SUCCESS_COUNT${NC}"
# echo -e "${RED}❌ Ошибки: $FAILED_COUNT${NC}"
# echo -e "${YELLOW}⚠️  Пропущено (недоступно): $SKIPPED_COUNT${NC}"
# echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# echo ""
#
# if [ $SUCCESS_COUNT -gt 0 ]; then
#     echo -e "${GREEN}🎉 Развертывание завершено!${NC}"
#     exit 0
# else
#     echo -e "${RED}❌ Развертывание не удалось ни на одной станции${NC}"
#     echo ""
#     echo "💡 Советы по устранению проблем:"
#     echo ""
#     echo "1. Проверьте доступность станции:"
#     echo "   ping 192.168.1.21"
#     echo ""
#     echo "2. Проверьте SSH подключение:"
#     echo "   ssh ${USERNAME}@192.168.1.21"
#     echo ""
#     echo "3. Если используете SSH ключи, убедитесь что они настроены:"
#     echo "   ssh-copy-id ${USERNAME}@192.168.1.21"
#     echo ""
#     echo "4. Текущая конфигурация:"
#     echo "   Станция: 192.168.1.21 (Вася)"
#     echo "   Пользователь: ${USERNAME}"
#     echo "   Пароль: ${PASSWORD:+***указан***}"
#     echo "   Путь: ${STATION_PATH} (Windows: C:\\together)"
#     echo ""
#     echo "5. Для подробной диагностики запустите:"
#     echo "   DIAGNOSTIC_MODE=true ./scripts/deploy-local.sh ${USERNAME}"
#     echo ""
#     exit 1
# fi

# ============================================================================
# ИНФОРМАЦИЯ О ТЕКУЩЕЙ АРХИТЕКТУРЕ
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ℹ️  ИНФОРМАЦИЯ: Деплой локальных файлов отключен"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Текущая архитектура:"
echo "   • Станции работают БЕЗ локальных файлов"
echo "   • Все страницы загружаются с центрального сервера"
echo "   • Конфигурации джойстиков хранятся на сервере"
echo ""
echo "🌐 Для работы станций:"
echo "   1. Убедитесь, что центральный сервер запущен"
echo "   2. На станции откройте браузер"
echo "   3. Перейдите на: http://<IP_СЕРВЕРА>:3000/station.html"
echo "   4. Настройте автозапуск браузера (см. документацию)"
echo ""
echo "📖 Подробная инструкция: docs/deployment/LOCAL.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

