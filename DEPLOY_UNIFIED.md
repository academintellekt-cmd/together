# 🚀 Деплой унифицированной системы

## Быстрый деплой на сервер

### 1. Подготовка локально

```bash
# Убедитесь, что все работает локально
npm run start:unified

# Проверьте, что тесты проходят
# (откройте http://localhost:3000 и протестируйте)
```

### 2. Коммит изменений

```bash
# Добавьте все новые файлы
git add server/core/
git add server/games/
git add server/routes/rooms-api.js
git add server/dmx/dmx-integration-unified.js
git add server-unified.js
git add start-unified.sh
git add package.json
git add *.md
git add docs/

# Коммит
git commit -m "feat: унификация архитектуры согласно ТЗ

- Единый протокол Socket.IO (room:join, game:action, room:state)
- Реестр игровых движков (Quiz, CHGK, Solo)
- Event Bus для DMX
- Unified Rooms API
- Обратная совместимость через adapter
- Полная документация

Closes #unification-tz"

# Пуш на GitHub
git push origin main
```

### 3. Деплой на сервер

```bash
# Подключитесь к серверу
ssh root@109.107.187.189
# Пароль: t6LP6kJBE_9w663RR=Mc

# Перейдите в директорию проекта
cd /path/to/together

# Остановите старый сервер (если запущен)
pm2 stop together
# или
pkill -f "node server.js"

# Получите изменения
git pull origin main

# Установите зависимости (если нужно)
npm install

# Запустите новый сервер
pm2 start server-unified.js --name together-unified

# Или используйте старый сервер для совместимости
pm2 start server.js --name together

# Проверьте статус
pm2 status

# Смотрите логи
pm2 logs together-unified
```

### 4. Проверка на сервере

```bash
# Проверьте, что сервер работает
curl http://109.107.187.189:3000/api/games/list

# Создайте тестовую комнату
curl -X POST http://109.107.187.189:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"gameId":"quiz","quizId":"gnu"}'

# Откройте в браузере
# http://109.107.187.189:3000
```

## Команды для быстрого доступа

### Полная команда для деплоя (одной строкой):

```bash
git add -A && \
git commit -m "feat: унификация архитектуры" && \
git push origin main && \
./deploy.sh 109.107.187.189 root
```

### После деплоя на сервере:

```bash
cd /path/to/together && \
git pull && \
npm install && \
pm2 restart together-unified
```

## Настройка PM2 (если еще не настроен)

```bash
# На сервере
npm install -g pm2

# Создайте ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'together-unified',
    script: './server-unified.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }, {
    name: 'together-legacy',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
EOF

# Запустите через ecosystem
pm2 start ecosystem.config.js

# Сохраните конфигурацию
pm2 save

# Настройте автозапуск
pm2 startup
```

## Откат на старую версию

Если что-то пошло не так:

```bash
# На сервере
pm2 stop together-unified
pm2 start together-legacy

# Или используйте старый server.js
pm2 restart together --update-env
```

## Мониторинг

```bash
# Статус всех процессов
pm2 status

# Логи в реальном времени
pm2 logs together-unified

# Логи только ошибок
pm2 logs together-unified --err

# Мониторинг ресурсов
pm2 monit

# Информация о процессе
pm2 info together-unified
```

## Nginx (если используется)

Обновите конфигурацию Nginx для проксирования:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket поддержка для Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Перезапустите Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Проверка после деплоя

### Чеклист:

- [ ] Сервер запущен и отвечает
- [ ] API endpoints работают
- [ ] Socket.IO подключается
- [ ] Создание комнаты работает
- [ ] Подключение игроков работает
- [ ] Игровой процесс работает
- [ ] Старые страницы работают
- [ ] Локальные станции подключаются (если используются)
- [ ] DMX работает (если используется)
- [ ] Логи не показывают ошибок

### Команды для проверки:

```bash
# API
curl http://your-server:3000/api/games/list
curl http://your-server:3000/api/quizzes

# Создание комнаты
curl -X POST http://your-server:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"gameId":"quiz","quizId":"gnu"}'

# Проверка комнаты (замените ABCD на реальный код)
curl http://your-server:3000/api/rooms/ABCD

# Проверка логов
pm2 logs together-unified --lines 50
```

## Troubleshooting

### Проблема: Порт занят

```bash
# Найдите процесс
lsof -i :3000

# Остановите процесс
kill -9 $(lsof -ti:3000)
```

### Проблема: Модули не найдены

```bash
# Переустановите зависимости
rm -rf node_modules package-lock.json
npm install
```

### Проблема: PM2 не запускается

```bash
# Очистите PM2
pm2 delete all
pm2 kill

# Запустите заново
pm2 start server-unified.js --name together-unified
pm2 save
```

### Проблема: Socket.IO не подключается

Проверьте:
1. Firewall открыт для порта 3000
2. Nginx правильно проксирует WebSocket
3. CORS настроен правильно

```bash
# Проверка firewall
sudo ufw status
sudo ufw allow 3000

# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx
```

## Резервное копирование

Перед деплоем создайте бэкап:

```bash
# На сервере
cd /path/to/together
tar -czf ../together-backup-$(date +%Y%m%d-%H%M%S).tar.gz .

# Или используйте git
git tag -a v1.0-pre-unification -m "Backup before unification"
git push --tags
```

## Автоматический деплой (опционально)

Создайте скрипт `deploy-unified.sh`:

```bash
#!/bin/bash

echo "🚀 Деплой унифицированной системы..."

# Коммит и пуш
git add -A
git commit -m "deploy: update unified system"
git push origin main

# Деплой на сервер
ssh root@109.107.187.189 << 'ENDSSH'
cd /path/to/together
git pull
npm install
pm2 restart together-unified
pm2 logs together-unified --lines 20
ENDSSH

echo "✅ Деплой завершен!"
echo "🌐 Проверьте: http://109.107.187.189:3000"
```

Сделайте исполняемым:

```bash
chmod +x deploy-unified.sh
```

Используйте:

```bash
./deploy-unified.sh
```

---

**Важно:** Всегда тестируйте локально перед деплоем на продакшн!

**Сервер:** 109.107.187.189  
**Пользователь:** root  
**Пароль:** t6LP6kJBE_9w663RR=Mc  
**Команда деплоя:** `./deploy.sh 109.107.187.189 root`

