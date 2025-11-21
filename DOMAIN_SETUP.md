# Настройка домена вместе.fun

## 1. Настройка DNS (у регистратора домена)

Установите Name Servers:
```
ns1.hosting.reg.ru
ns2.hosting.reg.ru
```

## 2. Настройка DNS записей (в панели REG.RU)

Создайте A-записи:
```
@           → 109.107.187.189
www         → 109.107.187.189
```

## 3. Настройка Nginx на сервере

Подключитесь к серверу:
```bash
ssh root@109.107.187.189
```
Пароль: `t6LP6kJBE_9w663RR=Mc`

### Установка Nginx (если не установлен):
```bash
apt update
apt install nginx -y
systemctl start nginx
systemctl enable nginx
```

### Создание конфигурации для домена:
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

### Активация конфигурации:
```bash
ln -s /etc/nginx/sites-available/vmeste.fun /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## 4. Проверка работы

После настройки DNS (может занять до 24 часов) сайт будет доступен по адресам:
- http://вместе.fun
- http://www.вместе.fun
- http://vmeste.fun
- http://www.vmeste.fun

## 5. Установка SSL сертификата (рекомендуется)

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d вместе.fun -d www.вместе.fun
```

После этого сайт будет доступен по HTTPS.
