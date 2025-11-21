# ⚡ Быстрые команды для деплоя

## 🚀 Основной деплой
```bash
cd /Users/romanfilipenko/Documents/together && ./deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

## 🔄 Коммит + Деплой
```bash
cd /Users/romanfilipenko/Documents/together && git add . && git commit -m "Update: $(date)" && git push && ./deploy.sh 109.107.187.189 root
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

## 🔍 Проверка сайта
- **HTTPS:** https://вместе.fun
- **HTTP:** http://вместе.fun  
- **IP:** http://109.107.187.189

## 🖥️ Подключение к серверу
```bash
ssh root@109.107.187.189
```
**Пароль:** `t6LP6kJBE_9w663RR=Mc`

## 📊 Проверка статуса на сервере
```bash
pm2 status
pm2 logs quiz-app
pm2 restart quiz-app
```

## 🔧 Nginx команды на сервере
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t
```

## 📝 Полезные команды на сервере
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

## 🆘 Экстренное восстановление
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
*Всегда под рукой для быстрого деплоя! 🚀*
