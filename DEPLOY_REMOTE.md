# Инструкция по развертыванию квиз-сайта на удаленном сервере

## Шаг 1: Подготовка локальных файлов

### Создание архива проекта
```bash
# На вашем локальном компьютере
cd /Users/romanfilipenko/Documents/together
tar -czf quiz-site.tar.gz --exclude=node_modules --exclude=.git server.js package.json package-lock.json public/ start.sh nodemon.json
```

## Шаг 2: Подключение к удаленному серверу

```bash
# Замените YOUR_SERVER_IP на IP вашего сервера
ssh root@YOUR_SERVER_IP
# или если у вас другой пользователь:
# ssh username@YOUR_SERVER_IP
```

## Шаг 3: Установка Node.js на удаленном сервере

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js (LTS версия)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка установки
node --version
npm --version
```

## Шаг 4: Установка PM2 (менеджер процессов)

```bash
sudo npm install -g pm2
```

## Шаг 5: Создание директории для проекта

```bash
# Создание директории
sudo mkdir -p /var/www/quiz-site
sudo chown $USER:$USER /var/www/quiz-site
cd /var/www/quiz-site
```

## Шаг 6: Загрузка файлов на сервер

### Вариант 1: Через SCP (с локального компьютера)
```bash
# Выполните на локальном компьютере
scp quiz-site.tar.gz root@YOUR_SERVER_IP:/var/www/quiz-site/
```

### Вариант 2: Через wget (если файлы в интернете)
```bash
# На сервере, если файлы загружены в облако
wget YOUR_FILE_URL -O quiz-site.tar.gz
```

### Вариант 3: Через Git (если проект в репозитории)
```bash
# На сервере
git clone YOUR_REPOSITORY_URL .
```

## Шаг 7: Распаковка и установка зависимостей

```bash
# На сервере
cd /var/www/quiz-site
tar -xzf quiz-site.tar.gz
npm install --production
```

## Шаг 8: Настройка файрвола

```bash
# Открытие порта 3000
sudo ufw allow 3000
sudo ufw enable
```

## Шаг 9: Запуск приложения с PM2

```bash
# Запуск приложения
pm2 start server.js --name "quiz-site"

# Настройка автозапуска при перезагрузке сервера
pm2 startup
pm2 save
```

## Шаг 10: Проверка работы

```bash
# Проверка статуса
pm2 status
pm2 logs quiz-site

# Проверка портов
netstat -tlnp | grep 3000
```

## Доступ к сайту

После успешного развертывания ваш сайт будет доступен по адресу:
- http://YOUR_SERVER_IP:3000/
- http://YOUR_SERVER_IP:3000/host.html
- http://YOUR_SERVER_IP:3000/player.html

## Полезные команды PM2

```bash
# Перезапуск приложения
pm2 restart quiz-site

# Остановка приложения
pm2 stop quiz-site

# Просмотр логов
pm2 logs quiz-site

# Мониторинг
pm2 monit
```

## Настройка домена (опционально)

Если у вас есть домен, настройте Nginx как reverse proxy:

```bash
# Установка Nginx
sudo apt install nginx

# Создание конфигурации
sudo nano /etc/nginx/sites-available/quiz-site
```

Содержимое конфигурации:
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
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/quiz-site /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Обновление приложения

Для обновления приложения:
```bash
# Остановка текущей версии
pm2 stop quiz-site

# Загрузка новых файлов
# (повторите шаги 6-7)

# Запуск обновленной версии
pm2 start quiz-site
```
