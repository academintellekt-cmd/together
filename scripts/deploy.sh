#!/bin/bash
# Единый скрипт развертывания квиз-сайта на сервер
# Полная замена всех файлов с гарантированным обновлением

echo "🚀 Развертывание квиз-сайта на сервер..."

# Проверка аргументов
if [ $# -eq 0 ]; then
    echo "❌ Укажите IP адрес сервера:"
    echo "Использование: ./deploy.sh SERVER_IP [USERNAME]"
    echo "Пример: ./deploy.sh 109.107.187.189 root"
    exit 1
fi

SERVER_IP=$1
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
    server.js package.json package-lock.json public/ scripts/start.sh nodemon.json server/ data/ tests/

echo "📤 Загрузка файлов на сервер..."
echo "💡 Введите пароль от сервера:"

# Загружаем архив
scp quiz-deploy.tar.gz $USERNAME@$SERVER_IP:/tmp/

if [ $? -ne 0 ]; then
    echo "❌ Ошибка загрузки файлов. Проверьте подключение и пароль."
    rm -f quiz-deploy.tar.gz
    exit 1
fi

echo "🔧 Развертывание на сервере..."
echo "💡 Введите пароль еще раз:"

# Подключаемся и выполняем развертывание
ssh -t $USERNAME@$SERVER_IP << 'EOF'
echo "📍 Подготовка директории проекта..."
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

EOF

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