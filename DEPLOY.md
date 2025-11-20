# 🚀 Деплой приложения в интернет

GitHub Pages **не поддерживает** Node.js серверы, поэтому для этого приложения нужен другой хостинг.

## ✅ Рекомендуемые платформы

### 1. Vercel (Рекомендуется) - Бесплатно

**Преимущества:**
- ✅ Бесплатный хостинг
- ✅ Автоматический деплой из GitHub
- ✅ Поддержка Node.js и Socket.io
- ✅ HTTPS по умолчанию
- ✅ Простая настройка

**Как задеплоить:**

1. **Зарегистрируйтесь на [Vercel](https://vercel.com/)**
   - Войдите через GitHub аккаунт

2. **Подключите репозиторий:**
   - Нажмите "New Project"
   - Выберите ваш GitHub репозиторий
   - Vercel автоматически определит настройки

3. **Настройте переменные окружения (если нужно):**
   - В настройках проекта добавьте:
     - `GOOGLE_APPS_SCRIPT_URL` - URL вашего Google Apps Script (если отличается от дефолтного)

4. **Деплой:**
   - Нажмите "Deploy"
   - Через 1-2 минуты получите ссылку вида: `https://your-project.vercel.app`

5. **Ваш сайт будет доступен по адресу:**
   - `https://your-project.vercel.app/index.html`
   - `https://your-project.vercel.app/solo.html`
   - `https://your-project.vercel.app/leaderboard.html`

**Важно:** После каждого `git push` в main ветку, Vercel автоматически обновит сайт!

---

### 2. Railway - Бесплатно (с ограничениями) ⭐ Рекомендуется для Socket.io

**Преимущества:**
- ✅ Бесплатный тариф (с ограничениями)
- ✅ Поддержка Node.js
- ✅ **Полная поддержка Socket.io и WebSocket**
- ✅ Постоянный сервер (не serverless)
- ✅ Простая настройка

**Как задеплоить:**

1. **Зарегистрируйтесь на [Railway](https://railway.app/)**
   - Войдите через GitHub

2. **Создайте новый проект:**
   - "New Project" > "Deploy from GitHub repo"
   - Выберите ваш репозиторий

3. **Настройте:**
   - Railway автоматически определит Node.js проект
   - Добавьте переменные окружения если нужно

4. **Деплой:**
   - Railway автоматически задеплоит проект
   - Получите ссылку вида: `https://your-project.up.railway.app`

---

### 3. Render - Бесплатно ⭐ Рекомендуется для Socket.io

**Преимущества:**
- ✅ Бесплатный тариф
- ✅ Автоматический деплой из GitHub
- ✅ **Полная поддержка Socket.io и WebSocket**
- ✅ Постоянный сервер (не serverless)

**Как задеплоить:**

1. **Зарегистрируйтесь на [Render](https://render.com/)**

2. **Создайте Web Service:**
   - "New" > "Web Service"
   - Подключите GitHub репозиторий

3. **Настройки:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`

4. **Деплой:**
   - Получите ссылку вида: `https://your-project.onrender.com`

---

## 📝 Настройка переменных окружения

На всех платформах можно настроить переменные окружения:

- `GOOGLE_APPS_SCRIPT_URL` - URL Google Apps Script Web App
- `GOOGLE_SHEET_ID` - ID Google таблицы (если используете API)
- `PORT` - Порт (обычно устанавливается автоматически)

---

## 🔧 Локальная разработка

Для локальной разработки:

```bash
npm install
npm start
```

Сервер запустится на `http://localhost:3000`

---

## ⚠️ Важные замечания

1. **Socket.io на Vercel:**
   - ⚠️ **ВАЖНО**: Vercel работает в serverless режиме, что означает, что Socket.io (WebSocket) может работать нестабильно или не работать вообще
   - Для полноценной работы Socket.io нужен постоянный сервер (не serverless)
   - **Решения:**
     - Используйте **Railway** или **Render** для полной поддержки Socket.io
     - Или используйте отдельный сервис для WebSocket (например, Socket.io Cloud)
   - **API endpoints** (например, `/api/quizzes`) будут работать на Vercel
   - **Соло-режим** (без Socket.io) будет работать на Vercel

2. **Файлы вопросов:**
   - Файлы из папки `Quiz/` будут доступны на сервере
   - Убедитесь, что они закоммичены в Git

3. **Google Sheets:**
   - URL Google Apps Script должен быть публичным
   - Проверьте настройки доступа в Google Apps Script

---

## 🎯 Рекомендация

**Для приложений с Socket.io (мультиплеер):**
- ⭐ **Используйте Railway или Render** - они поддерживают постоянные серверы и WebSocket

**Для соло-режима (без Socket.io):**
- ✅ **Используйте Vercel** - быстрый и простой деплой

**Важно:**
- Если вам нужен **мультиплеер** (host.html, player.html) - используйте Railway или Render
- Если нужен только **соло-режим** (solo.html) - Vercel подойдет

После деплоя ваше приложение будет доступно по ссылке вида:
- Vercel: `https://your-project-name.vercel.app`
- Railway: `https://your-project.up.railway.app`
- Render: `https://your-project.onrender.com`

