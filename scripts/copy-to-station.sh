#!/bin/bash

# Скрипт для копирования файла joystick-setup.html на станцию

if [ $# -lt 1 ]; then
    echo "Использование: ./copy-to-station.sh STATION_IP [USERNAME]"
    echo "Пример: ./copy-to-station.sh 192.168.1.21 pi"
    echo "Или: ./copy-to-station.sh 192.168.1.21"
    exit 1
fi

STATION_IP=$1
USERNAME=${2:-pi}  # По умолчанию пользователь 'pi', можно изменить на 'root' или другое

echo "📋 Копирование joystick-setup.html на станцию ${STATION_IP}..."

# Проверяем существование файла
if [ ! -f "public/joystick-setup.html" ]; then
    echo "❌ Файл public/joystick-setup.html не найден!"
    exit 1
fi

# Копируем файл на станцию
echo "📤 Копирование файла..."
scp public/joystick-setup.html ${USERNAME}@${STATION_IP}:/tmp/joystick-setup.html

if [ $? -eq 0 ]; then
    echo "✅ Файл скопирован в /tmp/"
    echo ""
    echo "Теперь нужно переместить файл в папку public на станции:"
    echo "ssh ${USERNAME}@${STATION_IP}"
    echo "sudo mv /tmp/joystick-setup.html /path/to/together/public/joystick-setup.html"
    echo ""
    echo "Или выполните команду напрямую:"
    echo "ssh ${USERNAME}@${STATION_IP} 'sudo mv /tmp/joystick-setup.html /path/to/together/public/joystick-setup.html'"
else
    echo "❌ Ошибка при копировании файла"
    exit 1
fi

