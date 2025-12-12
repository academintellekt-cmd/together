#!/bin/bash
# Команды для настройки Nginx на сервере

echo "🔧 Установка Nginx..."
apt update
apt install nginx -y

echo "🚀 Запуск Nginx..."
systemctl start nginx
systemctl enable nginx

echo "📝 Создание конфигурации для домена..."
cat > /etc/nginx/sites-available/vmeste.fun << 'EOF'
server {
    listen 80;
    server_name вместе.fun www.вместе.fun xn--b1aga0a0ag.fun www.xn--b1aga0a0ag.fun;

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

    # WebSocket support для Socket.IO
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
EOF

echo "🔗 Активация конфигурации..."
ln -sf /etc/nginx/sites-available/vmeste.fun /etc/nginx/sites-enabled/

echo "🧪 Проверка конфигурации..."
nginx -t

echo "🔄 Перезагрузка Nginx..."
systemctl reload nginx

echo "✅ Nginx настроен! Сайт должен быть доступен по домену."
