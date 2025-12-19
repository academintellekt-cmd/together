# Настройка станций для работы

Для работы системы на станциях необходимо запустить два сервиса:

## 1. SSH сервер (для развертывания файлов)

SSH нужен для автоматического развертывания файлов с локального сервера.

### Запуск SSH сервера

```bash
# Проверьте статус SSH
sudo systemctl status ssh

# Если не запущен, запустите его
sudo systemctl enable ssh   # Включить автозапуск
sudo systemctl start ssh     # Запустить сейчас

# Откройте порт 22 в файрволе
sudo ufw allow 22
sudo ufw status
```

### Проверка работы SSH

С локального компьютера попробуйте подключиться:
```bash
ssh pi@192.168.1.21
```

Если подключение успешно - SSH работает правильно.

## 2. Node.js приложение (для работы квиза)

После развертывания файлов нужно запустить само приложение на станции.

### Первая настройка

```bash
# Перейдите в директорию проекта
cd /home/pi/together

# Установите зависимости (только первый раз)
npm install

# Установите PM2 для управления процессом (глобально)
sudo npm install -g pm2
```

### Запуск приложения

**Вариант 1: Через PM2 (рекомендуется)**

```bash
cd /home/pi/together

# Запуск
pm2 start server.js --name "quiz-site"

# Настройка автозапуска при перезагрузке
pm2 startup
pm2 save

# Проверка статуса
pm2 status
pm2 logs quiz-site
```

**Вариант 2: Через systemd (альтернатива)**

Создайте файл `/etc/systemd/system/quiz-site.service`:

```ini
[Unit]
Description=Quiz Site Application
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/together
ExecStart=/usr/bin/node /home/pi/together/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Затем:
```bash
sudo systemctl daemon-reload
sudo systemctl enable quiz-site
sudo systemctl start quiz-site
sudo systemctl status quiz-site
```

**Вариант 3: Вручную (для тестирования)**

```bash
cd /home/pi/together
node server.js
```

### Проверка работы приложения

После запуска приложение должно быть доступно по адресу:
- `http://192.168.1.21:3000/` - главная страница
- `http://192.168.1.21:3000/local-station.html` - страница станции

Проверьте с локального компьютера:
```bash
curl http://192.168.1.21:3000/
```

## Полная настройка станции (пошагово)

### Шаг 1: Подготовка системы

```bash
# Обновление системы
sudo apt update
sudo apt upgrade -y

# Установка Node.js (если еще не установлен)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версии
node --version
npm --version
```

### Шаг 2: Настройка SSH

```bash
# Запуск SSH сервера
sudo systemctl enable ssh
sudo systemctl start ssh

# Открытие порта
sudo ufw allow 22
```

### Шаг 3: Развертывание файлов

С локального компьютера:
```bash
./scripts/deploy-to-stations.sh pi
```

Или вручную скопируйте файлы проекта в `/home/pi/together`

### Шаг 4: Установка зависимостей

На станции:
```bash
cd /home/pi/together
npm install --production
```

### Шаг 5: Запуск приложения

```bash
# Установка PM2
sudo npm install -g pm2

# Запуск
pm2 start server.js --name "quiz-site"
pm2 startup
pm2 save
```

### Шаг 6: Проверка

```bash
# Проверка статуса
pm2 status

# Просмотр логов
pm2 logs quiz-site

# Проверка доступности
curl http://localhost:3000/
```

## Управление приложением на станции

### Через PM2

```bash
# Статус
pm2 status

# Логи
pm2 logs quiz-site

# Перезапуск
pm2 restart quiz-site

# Остановка
pm2 stop quiz-site

# Удаление из автозапуска
pm2 delete quiz-site
```

### Через systemd

```bash
# Статус
sudo systemctl status quiz-site

# Логи
sudo journalctl -u quiz-site -f

# Перезапуск
sudo systemctl restart quiz-site

# Остановка
sudo systemctl stop quiz-site
```

## Автоматическое развертывание и запуск

Скрипт развертывания автоматически:
1. ✅ Останавливает старое приложение
2. ✅ Создает резервную копию
3. ✅ Загружает новые файлы
4. ✅ Устанавливает зависимости
5. ✅ Запускает приложение через PM2

После развертывания приложение должно автоматически запуститься.

## Устранение проблем

### Приложение не запускается

```bash
# Проверьте логи
pm2 logs quiz-site

# Проверьте, занят ли порт 3000
sudo lsof -i :3000

# Проверьте Node.js
node --version

# Проверьте зависимости
cd /home/pi/together
npm install
```

### SSH не работает

```bash
# Проверьте статус
sudo systemctl status ssh

# Перезапустите
sudo systemctl restart ssh

# Проверьте порт
sudo netstat -tlnp | grep :22
```

### Порт 3000 недоступен

```bash
# Откройте порт в файрволе
sudo ufw allow 3000

# Проверьте, что приложение слушает правильный интерфейс
# В server.js должно быть: app.listen(3000, '0.0.0.0')
```

## Быстрая проверка готовности станции

Выполните на станции:

```bash
#!/bin/bash
echo "🔍 Проверка готовности станции..."
echo ""

echo "1. SSH сервер:"
sudo systemctl is-active ssh && echo "✅ SSH запущен" || echo "❌ SSH не запущен"

echo ""
echo "2. Node.js:"
node --version && echo "✅ Node.js установлен" || echo "❌ Node.js не установлен"

echo ""
echo "3. Приложение:"
if pm2 list | grep -q quiz-site; then
    echo "✅ Приложение запущено через PM2"
    pm2 status quiz-site
else
    echo "⚠️  Приложение не запущено через PM2"
fi

echo ""
echo "4. Порт 3000:"
if curl -s http://localhost:3000/ > /dev/null; then
    echo "✅ Приложение отвечает на порту 3000"
else
    echo "❌ Приложение не отвечает на порту 3000"
fi

echo ""
echo "5. Сетевое подключение:"
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

Сохраните как `check-station.sh`, сделайте исполняемым и запустите:
```bash
chmod +x check-station.sh
./check-station.sh
```

