#!/bin/bash

# Скрипт запуска унифицированного сервера

echo "═══════════════════════════════════════════════════"
echo "🚀 Запуск унифицированного сервера"
echo "═══════════════════════════════════════════════════"
echo ""

# Проверка наличия Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен"
    exit 1
fi

echo "✅ Node.js версия: $(node --version)"
echo ""

# Проверка наличия зависимостей
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
    echo ""
fi

# Проверка порта
PORT=3000
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Порт $PORT уже занят"
    echo "Остановить процесс? (y/n)"
    read -r answer
    if [ "$answer" = "y" ]; then
        PID=$(lsof -ti:$PORT)
        kill -9 $PID
        echo "✅ Процесс остановлен"
        sleep 1
    else
        echo "❌ Выход"
        exit 1
    fi
fi

echo "═══════════════════════════════════════════════════"
echo "🎮 Запуск server-unified.js"
echo "═══════════════════════════════════════════════════"
echo ""

# Запуск сервера
node server-unified.js

