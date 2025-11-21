# Настройка HTTPS для вместе.fun

## Автоматический способ (рекомендуется)

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

## Ручной способ (если автоматический не работает)

### 1. Получение сертификата без автоконфигурации
```bash
certbot certonly --webroot -w /var/www/html -d вместе.fun -d www.вместе.fun
```

### 2. Ручная настройка Nginx
```bash
nano /etc/nginx/sites-available/vmeste.fun
```

### 3. Конфигурация с SSL:
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

### 4. Активация конфигурации
```bash
nginx -t
systemctl reload nginx
```

## Автообновление сертификата

```bash
# Добавить в cron
crontab -e

# Добавить строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

## Проверка работы HTTPS

После настройки сайт будет доступен по адресам:
- https://вместе.fun
- https://www.вместе.fun

HTTP запросы будут автоматически перенаправляться на HTTPS.
