# 📚 Настройка и развертывание проекта

Этот документ содержит всю необходимую информацию для настройки, развертывания и поддержки проекта.

---

## 🚀 Деплой

Проект поддерживает два типа деплоя:

### 🌐 Деплой в интернет

Деплой на внешний сервер (вместе.fun) для публичного доступа.

**Команда:**
```bash
./scripts/deploy.sh 109.107.187.189 root
```

**Пароль:** `t6LP6kJBE_9w663RR=Mc`

📖 **Подробная инструкция:** [docs/deployment/INTERNET.md](../deployment/INTERNET.md)

### 🏠 Локальный деплой (SSH)

Деплой на станции через SSH по локальной сети (192.168.1.21-29).

**Команда:**
```bash
./scripts/deploy-local.sh [USERNAME] [PASSWORD]
```

**Пример:**
```bash
./scripts/deploy-local.sh pi
```

📖 **Подробная инструкция:** [docs/deployment/LOCAL.md](../deployment/LOCAL.md)

---

## ⚡ Быстрые команды

### 🌐 Деплой в интернет
```bash
cd /Users/romanfilipenko/Documents/together && ./scripts/deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

### 🏠 Локальный деплой
```bash
cd /Users/romanfilipenko/Documents/together && ./scripts/deploy-local.sh pi
```

### 🔄 Коммит + Деплой в интернет
```bash
cd /Users/romanfilipenko/Documents/together && git add . && git commit -m "Update: $(date)" && git push && ./scripts/deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

### 🔍 Проверка сайта
- **HTTPS:** https://вместе.fun
- **HTTP:** http://вместе.fun  
- **IP:** http://109.107.187.189

### 🖥️ Подключение к серверу
```bash
ssh root@109.107.187.189
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

### 📊 Проверка статуса на сервере
```bash
pm2 status
pm2 logs quiz-app
pm2 restart quiz-app
```

### 🔧 Nginx команды на сервере
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t
```

### 📝 Полезные команды на сервере
```bash
# Проверить процессы
ps aux | grep node

# Проверить порты
netstat -tlnp | grep :3000

# Проверить логи
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# Проверить SSL сертификат
certbot certificates
```

### 🆘 Экстренное восстановление
```bash
# Если что-то сломалось, подключитесь к серверу:
ssh root@109.107.187.189

# Перезапустите все:
pm2 restart all
sudo systemctl restart nginx

# Проверьте статус:
pm2 status
sudo systemctl status nginx
```

---

## 🌐 Деплой в интернет

📖 **Подробная инструкция:** [docs/deployment/INTERNET.md](../deployment/INTERNET.md)

### 📋 Общая информация
- **Сервер:** 109.107.187.189
- **Пользователь:** root
- **Пароль:** t6LP6kJBE_9w663RR=Mc
- **Домен:** вместе.fun (xn--b1aga0a0ag.fun)
- **Порт:** 3000 (внутренний), 80/443 (внешний через Nginx)

### 🔧 Команда для деплоя

```bash
./scripts/deploy.sh 109.107.187.189 root
```

При запросе пароля введите: `t6LP6kJBE_9w663RR=Mc`

### 📚 Пошаговый процесс деплоя

#### 1️⃣ **Подготовка локально:**
```bash
# Переходим в директорию проекта
cd /Users/romanfilipenko/Documents/together

# Проверяем, что все файлы на месте
ls -la

# Убеждаемся, что deploy.sh исполняемый
chmod +x deploy.sh

# Проверяем, что нет ошибок
npm install
```

#### 2️⃣ **Запуск деплоя:**
```bash
# Запускаем скрипт деплоя
./scripts/deploy.sh 109.107.187.189 root
```

#### 3️⃣ **Что происходит автоматически:**
1. **Создание архива** - упаковываются все файлы проекта (исключая node_modules, .git, временные файлы)
2. **Подключение к серверу** - через SSH с паролем
3. **Создание бэкапа** - старая версия сохраняется в `/var/backups/quiz-{timestamp}/`
4. **Загрузка файлов** - новые файлы копируются на сервер в `/var/www/quiz-site/`
5. **Установка зависимостей** - `npm install --production`
6. **Перезапуск сервера** - через PM2 (процесс `quiz-site`)

#### 4️⃣ **Ввод пароля:**
Когда появится запрос:
```
root@109.107.187.189's password:
```
Введите: `t6LP6kJBE_9w663RR=Mc`

### ✅ Проверка успешного деплоя

#### Проверьте сайт:
- **HTTP:** http://вместе.fun
- **HTTPS:** https://вместе.fun
- **Прямой IP:** http://109.107.187.189

#### Проверьте логи на сервере:
```bash
# Подключитесь к серверу
ssh root@109.107.187.189

# Проверьте статус PM2
pm2 status

# Проверьте логи приложения
pm2 logs quiz-site

# Проверьте логи Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 🛠️ Устранение проблем

#### Если деплой не работает:

1. **Проверьте подключение к серверу:**
```bash
ssh root@109.107.187.189
# Пароль: t6LP6kJBE_9w663RR=Mc
```

2. **Проверьте права на файл:**
```bash
chmod +x deploy.sh
```

3. **Проверьте содержимое deploy.sh:**
```bash
cat deploy.sh
```

4. **Ручной деплой (если автоматический не работает):**
```bash
# Создать архив
tar -czf deploy.tar.gz --exclude=node_modules --exclude=.git --exclude="*.log" --exclude=".DS_Store" .

# Загрузить на сервер
scp deploy.tar.gz root@109.107.187.189:/tmp/

# Подключиться к серверу
ssh root@109.107.187.189

# На сервере:
cd /var/www/quiz-site
tar -xzf /tmp/deploy.tar.gz
npm install --production
pm2 restart quiz-site
```

### 📊 Мониторинг после деплоя

#### Проверьте работу сайта:
1. Откройте https://вместе.fun
2. Проверьте все функции:
   - Главная страница
   - Выбор квиза
   - Одиночная игра
   - Мультиплеер (создание комнаты, подключение игроков)
   - Рейтинг
3. Проверьте на мобильном устройстве

#### Проверьте сервер:
```bash
# Статус PM2
pm2 status

# Использование ресурсов
pm2 monit

# Логи в реальном времени
pm2 logs quiz-site --lines 50

# Перезапуск при необходимости
pm2 restart quiz-site
```

### 📝 Структура файлов на сервере

После деплоя файлы находятся в:
```
/var/www/quiz-site/
├── server.js
├── package.json
├── public/
├── server/
├── data/
└── ...
```

Бэкапы сохраняются в:
```
/var/backups/quiz-{timestamp}/
```

---

## 🌐 Настройка домена

### 1. Настройка DNS (у регистратора домена)

Установите Name Servers:
```
ns1.hosting.reg.ru
ns2.hosting.reg.ru
```

### 2. Настройка DNS записей (в панели REG.RU)

Создайте A-записи:
```
@           → 109.107.187.189
www         → 109.107.187.189
```

### 3. Настройка Nginx на сервере

Подключитесь к серверу:
```bash
ssh root@109.107.187.189
```
Пароль: `t6LP6kJBE_9w663RR=Mc`

#### Установка Nginx (если не установлен):
```bash
apt update
apt install nginx -y
systemctl start nginx
systemctl enable nginx
```

#### Создание конфигурации для домена:
```bash
nano /etc/nginx/sites-available/vmeste.fun
```

Вставьте конфигурацию:
```nginx
server {
    listen 80;
    server_name вместе.fun www.вместе.fun vmeste.fun www.vmeste.fun;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Активация конфигурации:
```bash
ln -s /etc/nginx/sites-available/vmeste.fun /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 4. Проверка работы

После настройки DNS (может занять до 24 часов) сайт будет доступен по адресам:
- http://вместе.fun
- http://www.вместе.fun
- http://vmeste.fun
- http://www.vmeste.fun

---

## 🔒 Настройка SSL (HTTPS)

### Автоматический способ (рекомендуется)

```bash
# 1. Установка Certbot
apt update
apt install certbot python3-certbot-nginx -y

# 2. Получение сертификата
certbot --nginx -d вместе.fun -d www.вместе.fun

# 3. Проверка
nginx -t
systemctl reload nginx
```

### Ручной способ (если автоматический не работает)

#### 1. Получение сертификата без автоконфигурации
```bash
certbot certonly --webroot -w /var/www/html -d вместе.fun -d www.вместе.fun
```

#### 2. Ручная настройка Nginx
```bash
nano /etc/nginx/sites-available/vmeste.fun
```

#### 3. Конфигурация с SSL:
```nginx
server {
    listen 80;
    server_name вместе.fun www.вместе.fun xn--b1aga0a0ag.fun www.xn--b1aga0a0ag.fun;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name вместе.fun www.вместе.fun xn--b1aga0a0ag.fun www.xn--b1aga0a0ag.fun;

    ssl_certificate /etc/letsencrypt/live/вместе.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/вместе.fun/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 4. Активация конфигурации
```bash
nginx -t
systemctl reload nginx
```

### Автообновление сертификата

```bash
# Добавить в cron
crontab -e

# Добавить строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

### Проверка работы HTTPS

После настройки сайт будет доступен по адресам:
- https://вместе.fun
- https://www.вместе.fun

HTTP запросы будут автоматически перенаправляться на HTTPS.

---

## 📊 Интеграция с Google Sheets

### 📋 Обновление Google Apps Script

Вам нужно обновить ваш Google Apps Script, чтобы он мог возвращать данные рейтинга.

### 🔧 Код для Google Apps Script:

```javascript
function doPost(e) {
  // Существующий код для записи данных
  try {
    const data = JSON.parse(e.postData.contents);
    
    const sheet = SpreadsheetApp.openById('1yGUV-99vQEcEYGCS9BIX1IC4LYDopaFA7Qis9hjobPk').getActiveSheet();
    
    // Добавляем новую строку с данными
    sheet.appendRow([
      data.date,
      data.playerName,
      data.score,
      data.correctAnswers,
      data.totalQuestions,
      data.timeSpent,
      data.percentage,
      data.quizId
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Новый код для загрузки рейтинга
  try {
    const action = e.parameter.action;
    
    if (action === 'getLeaderboard') {
      const sheet = SpreadsheetApp.openById('YOUR_SHEET_ID').getActiveSheet();
      const data = sheet.getDataRange().getValues();
      
      // Пропускаем заголовок (первая строка)
      const leaderboard = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        
        // Проверяем, что строка не пустая
        if (row[1] && row[2] !== '') { // playerName и score не пустые
          leaderboard.push({
            date: row[0],
            playerName: row[1],
            score: parseInt(row[2]) || 0,
            correctAnswers: parseInt(row[3]) || 0,
            totalQuestions: parseInt(row[4]) || 0,
            timeSpent: parseInt(row[5]) || 0,
            percentage: parseInt(row[6]) || 0,
            quizId: row[7] || 'friends-quiz',
            timestamp: new Date(row[0]).getTime() || Date.now()
          });
        }
      }
      
      // Сортируем по очкам (от большего к меньшему)
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp;
      });
      
      // Ограничиваем до 100 лучших результатов
      const topLeaderboard = leaderboard.slice(0, 100);
      
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          leaderboard: topLeaderboard
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: 'Unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### 📝 Инструкция по обновлению:

1. **Откройте Google Apps Script:** https://script.google.com/
2. **Найдите ваш проект** для квиз-сайта
3. **Замените код** на код выше
4. **Замените `YOUR_SHEET_ID`** на ID вашей Google таблицы
5. **Сохраните проект** (Ctrl+S)
6. **Разверните заново:**
   - Нажмите "Развернуть" → "Новое развертывание"
   - Выберите тип "Веб-приложение"
   - Доступ: "Все пользователи"
   - Нажмите "Развернуть"

### 🧪 Тестирование:

После обновления скрипта проверьте:

1. **Загрузка рейтинга:** 
   ```
   https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?action=getLeaderboard
   ```

2. **Должен вернуть JSON:**
   ```json
   {
     "success": true,
     "leaderboard": [
       {
         "playerName": "Игрок",
         "score": 100,
         "date": "2025-11-21",
         ...
       }
     ]
   }
   ```

### 🔄 Как это работает:

- При запуске сервера автоматически загружается рейтинг из Google Sheets
- Рейтинг сохраняется в памяти сервера
- При перезапуске сервера рейтинг восстанавливается
- Новые результаты добавляются и в память, и в Google Sheets

---

## 🔐 Безопасность

### Важные моменты:
- Пароль хранится в этом файле для удобства
- Регулярно меняйте пароль на сервере
- Используйте SSH-ключи для большей безопасности
- Делайте бэкапы перед каждым деплоем

---

## 📞 Быстрая справка

### Основные команды:

#### 🌐 Деплой в интернет:
```bash
cd /Users/romanfilipenko/Documents/together && ./scripts/deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

#### 🏠 Локальный деплой (SSH):
```bash
cd /Users/romanfilipenko/Documents/together && ./scripts/deploy-local.sh pi
```

#### Коммит + Деплой в интернет:
```bash
cd /Users/romanfilipenko/Documents/together && git add . && git commit -m "Update" && git push && ./scripts/deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

#### Подключение к серверу:
```bash
ssh root@109.107.187.189
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

# Проверка статуса
pm2 status

# Перезапуск
pm2 restart quiz-site

# Просмотр логов
pm2 logs quiz-site
```

### Пароль сервера:
```
t6LP6kJBE_9w663RR=Mc
```

---

*Последнее обновление: 2024*






