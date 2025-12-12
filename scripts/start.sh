#!/bin/bash
# Скрипт запуска сервера квиза

cd "$(dirname "$0")/.."

# Поиск Node.js
NODE_CMD=""

# 1. Проверка в PATH
if command -v node &> /dev/null; then
    NODE_CMD="node"
# 2. Проверка через nvm
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    NODE_CMD="node"
# 3. Проверка стандартных мест
elif [ -f "/usr/local/bin/node" ]; then
    NODE_CMD="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_CMD="/opt/homebrew/bin/node"
fi

# Если Node.js не найден
if [ -z "$NODE_CMD" ] || ! "$NODE_CMD" --version &> /dev/null; then
    echo "❌ Node.js не найден!"
    echo ""
    echo "Установите Node.js одним из способов:"
    echo "1. Скачайте с https://nodejs.org/ (рекомендуется)"
    echo "2. Через Homebrew: brew install node"
    echo "3. Через nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    exit 1
fi

echo "✅ Найден Node.js: $($NODE_CMD --version)"

# Установка зависимостей если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    "$NODE_CMD" "$(dirname "$NODE_CMD")/npm" install 2>/dev/null || npm install
fi

# Проверка наличия nodemon
if ! command -v nodemon &> /dev/null && [ ! -f "node_modules/.bin/nodemon" ]; then
    echo "📦 Установка nodemon для автоматической перезагрузки..."
    npm install --save-dev nodemon
fi

# Остановка старого сервера если запущен
if lsof -ti:3000 &> /dev/null; then
    echo "⚠️  Останавливаю старый сервер..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 1
fi

# Запуск сервера с nodemon для автоматической перезагрузки
echo "🚀 Запуск сервера с автоматической перезагрузкой на http://localhost:3000"
echo "📱 Хост: http://localhost:3000/host.html"
echo "📱 Игроки: http://localhost:3000/player.html"
echo ""
echo "💡 Сервер автоматически перезагрузится при изменении файлов"
echo ""

if [ -f "node_modules/.bin/nodemon" ]; then
    ./node_modules/.bin/nodemon server.js
else
    nodemon server.js
fi
