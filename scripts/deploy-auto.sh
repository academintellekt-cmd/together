#!/bin/bash
# Единый скрипт развертывания квиз-сайта на сервер с автоматическим вводом пароля
# Полная замена всех файлов с гарантированным обновлением

echo "🚀 Развертывание квиз-сайта на сервер..."

# Пароль сервера
SERVER_PASSWORD="t6LP6kJBE_9w663RR=Mc"
SERVER_IP=${1:-109.107.187.189}
USERNAME=${2:-root}

echo "📡 Сервер: $USERNAME@$SERVER_IP"

# Создание архива с актуальными файлами
echo "📦 Создание архива с файлами проекта..."
tar -czf quiz-deploy.tar.gz \
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
    server.js package.json package-lock.json public/ scripts/start.sh nodemon.json server/ data/ tests/ docs/

echo "📤 Загрузка файлов на сервер..."

# Используем expect для автоматического ввода пароля
if command -v expect &> /dev/null; then
    expect << EOF
    set timeout 300
    spawn scp quiz-deploy.tar.gz $USERNAME@$SERVER_IP:/tmp/
    expect {
        "password:" {
            send "$SERVER_PASSWORD\r"
            exp_continue
        }
        "yes/no" {
            send "yes\r"
            exp_continue
        }
        eof
    }
EOF
else
    echo "⚠️  expect не установлен. Используйте обычный deploy.sh и введите пароль вручную."
    echo "Пароль: $SERVER_PASSWORD"
    scp quiz-deploy.tar.gz $USERNAME@$SERVER_IP:/tmp/
fi

if [ $? -ne 0 ]; then
    echo "❌ Ошибка загрузки файлов. Проверьте подключение и пароль."
    rm -f quiz-deploy.tar.gz
    exit 1
fi

echo "🔧 Развертывание на сервере..."

# Подключаемся и выполняем развертывание
if command -v expect &> /dev/null; then
    expect << EOF
    set timeout 600
    spawn ssh -t $USERNAME@$SERVER_IP
    expect {
        "password:" {
            send "$SERVER_PASSWORD\r"
        }
        "yes/no" {
            send "yes\r"
            exp_continue
        }
    }
    expect "# "
    send "cd /var/www/quiz-site || { mkdir -p /var/www/quiz-site && cd /var/www/quiz-site; }\r"
    expect "# "
    send "pm2 stop quiz-site 2>/dev/null || echo 'Приложение не было запущено'\r"
    expect "# "
    send "pm2 delete quiz-site 2>/dev/null || echo 'Процесс не найден'\r"
    expect "# "
    send "if [ \"\$(ls -A . 2>/dev/null)\" ]; then BACKUP_DIR=\"/var/backups/quiz-\$(date +%Y%m%d_%H%M%S)\"; mkdir -p \$BACKUP_DIR; cp -r * \$BACKUP_DIR/ 2>/dev/null && echo \"✅ Резервная копия: \$BACKUP_DIR\"; fi\r"
    expect "# "
    send "rm -rf * .* 2>/dev/null || true\r"
    expect "# "
    send "tar -xzf /tmp/quiz-deploy.tar.gz\r"
    expect "# "
    send "npm install --production --silent\r"
    expect "# "
    send "chmod +x scripts/start.sh 2>/dev/null || true\r"
    expect "# "
    send "ufw allow 3000 2>/dev/null || echo 'Порт 3000 уже открыт'\r"
    expect "# "
    send "pm2 start server.js --name quiz-site\r"
    expect "# "
    send "pm2 startup systemd -u \$USER --hp \$HOME 2>/dev/null || true\r"
    expect "# "
    send "pm2 save\r"
    expect "# "
    send "sleep 3\r"
    expect "# "
    send "pm2 status\r"
    expect "# "
    send "curl -I http://localhost:3000/ 2>/dev/null | grep -q '200 OK' && echo '✅ Сервер успешно запущен' || echo '⚠️  Сервер запускается'\r"
    expect "# "
    send "rm -f /tmp/quiz-deploy.tar.gz\r"
    expect "# "
    send "exit\r"
    expect eof
EOF
else
    ssh -t $USERNAME@$SERVER_IP << 'DEPLOY_SCRIPT'
cd /var/www/quiz-site || { 
    echo "📁 Создание директории проекта..."
    mkdir -p /var/www/quiz-site
    cd /var/www/quiz-site
}

echo "⏹️  Остановка приложения..."
pm2 stop quiz-site 2>/dev/null || echo "Приложение не было запущено"
pm2 delete quiz-site 2>/dev/null || echo "Процесс не найден"

echo "💾 Создание резервной копии..."
if [ "$(ls -A . 2>/dev/null)" ]; then
    BACKUP_DIR="/var/backups/quiz-$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    cp -r * $BACKUP_DIR/ 2>/dev/null && echo "✅ Резервная копия: $BACKUP_DIR"
fi

echo "🗑️  Очистка старых файлов..."
rm -rf * .* 2>/dev/null || true

echo "📦 Распаковка новых файлов..."
tar -xzf /tmp/quiz-deploy.tar.gz
echo "✅ Файлы распакованы"

echo "📋 Установка зависимостей..."
npm install --production --silent

echo "🔧 Настройка прав доступа..."
chmod +x scripts/start.sh 2>/dev/null || true

echo "🔥 Настройка файрвола..."
ufw allow 3000 2>/dev/null || echo "Порт 3000 уже открыт"

echo "🚀 Запуск приложения..."
pm2 start server.js --name "quiz-site"

echo "🔄 Настройка автозапуска..."
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
pm2 save

echo "⏳ Ожидание запуска сервера..."
sleep 3

echo "📊 Статус приложения:"
pm2 status

echo "🧪 Проверка работы сервера..."
if curl -I http://localhost:3000/ 2>/dev/null | grep -q "200 OK"; then
    echo "✅ Сервер успешно запущен и отвечает"
else
    echo "⚠️  Сервер запускается, проверьте через минуту"
fi

echo "📋 Последние логи:"
pm2 logs quiz-site --lines 3 2>/dev/null || echo "Логи будут доступны через несколько секунд"

echo "🧹 Очистка временных файлов..."
rm -f /tmp/quiz-deploy.tar.gz

echo ""
echo "✅ Развертывание завершено успешно!"
EXTERNAL_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP не определен")
echo "🌐 Сайт доступен: http://$EXTERNAL_IP:3000/"
DEPLOY_SCRIPT
fi

# Очищаем локальный архив
rm -f quiz-deploy.tar.gz

echo ""
echo "🎉 Развертывание завершено!"
echo ""
echo "🌐 Ваш сайт доступен по адресам:"
echo "   • Главная: http://$SERVER_IP:3000/"
echo "   • Хост: http://$SERVER_IP:3000/host.html"
echo "   • Игроки: http://$SERVER_IP:3000/player.html"
echo "   • Соло: http://$SERVER_IP:3000/solo.html"
echo ""
echo "📊 Управление сервером:"
echo "   ssh $USERNAME@$SERVER_IP"
echo "   pm2 status"
echo "   pm2 logs quiz-site"
echo "   pm2 restart quiz-site"

