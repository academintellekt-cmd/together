#!/bin/bash
# Скрипт автоматического развертывания квиз-сайта

echo "🚀 Начинаем развертывание квиз-сайта..."

# Проверка аргументов
if [ $# -eq 0 ]; then
    echo "❌ Укажите IP адрес сервера:"
    echo "Использование: ./deploy.sh SERVER_IP [USERNAME]"
    echo "Пример: ./deploy.sh 192.168.1.100 root"
    exit 1
fi

SERVER_IP=$1
USERNAME=${2:-root}

echo "📡 Сервер: $USERNAME@$SERVER_IP"

# Создание архива если его нет
if [ ! -f "quiz-site.tar.gz" ]; then
    echo "📦 Создание архива..."
    tar -czf quiz-site.tar.gz --exclude=node_modules --exclude=.git server.js package.json package-lock.json public/ start.sh nodemon.json api/
fi

echo "📤 Загрузка файлов на сервер..."
scp quiz-site.tar.gz $USERNAME@$SERVER_IP:/tmp/

echo "🔧 Настройка сервера..."
ssh $USERNAME@$SERVER_IP << 'EOF'
# Обновление системы
echo "📦 Обновление системы..."
apt update && apt upgrade -y

# Установка Node.js если не установлен
if ! command -v node &> /dev/null; then
    echo "📦 Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
fi

# Установка PM2 если не установлен
if ! command -v pm2 &> /dev/null; then
    echo "📦 Установка PM2..."
    npm install -g pm2
fi

# Создание директории проекта
echo "📁 Создание директории проекта..."
mkdir -p /var/www/quiz-site
cd /var/www/quiz-site

# Остановка старого процесса если запущен
pm2 stop quiz-site 2>/dev/null || true
pm2 delete quiz-site 2>/dev/null || true

# Очистка старых файлов
rm -rf *

# Распаковка новых файлов
echo "📦 Распаковка файлов..."
tar -xzf /tmp/quiz-site.tar.gz

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install --production

# Настройка прав доступа
chmod +x start.sh

# Настройка файрвола
echo "🔥 Настройка файрвола..."
ufw allow 3000 2>/dev/null || true

# Запуск приложения
echo "🚀 Запуск приложения..."
pm2 start server.js --name "quiz-site"

# Настройка автозапуска
pm2 startup systemd -u $USER --hp /root 2>/dev/null || true
pm2 save

echo "✅ Развертывание завершено!"
echo "🌐 Сайт доступен по адресу: http://$(curl -s ifconfig.me):3000"
echo "📊 Проверить статус: pm2 status"
echo "📋 Просмотр логов: pm2 logs quiz-site"

EOF

echo "✅ Развертывание завершено успешно!"
echo ""
echo "🌐 Ваш сайт теперь доступен по адресу:"
echo "   http://$SERVER_IP:3000/"
echo "   http://$SERVER_IP:3000/host.html"
echo "   http://$SERVER_IP:3000/player.html"
echo ""
echo "📊 Для проверки статуса выполните на сервере:"
echo "   ssh $USERNAME@$SERVER_IP"
echo "   pm2 status"
