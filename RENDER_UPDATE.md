# 🔄 Как обновить деплой на Render

## Автоматическое обновление

Render автоматически обновляет приложение при каждом `git push` в основную ветку (main/master).

### Шаг 1: Закоммитьте изменения

```bash
git add .
git commit -m "Fix questions loading and parsing"
git push origin main
```

### Шаг 2: Render автоматически обновит деплой

1. Render обнаружит новый коммит
2. Автоматически начнет новый деплой
3. Вы увидите процесс в Dashboard → Logs

### Шаг 3: Проверьте логи

В Render Dashboard:
1. Откройте ваш Web Service
2. Перейдите в раздел "Logs"
3. Проверьте, что видите:
   - `Загружено X вопросов из файла ...`
   - `Вопросы перемешаны. Всего: X`
   - `Сервер запущен на порту ...`

---

## Ручное обновление (если нужно)

Если автоматическое обновление не сработало:

1. **В Render Dashboard:**
   - Откройте ваш Web Service
   - Нажмите "Manual Deploy" → "Deploy latest commit"

2. **Или через Git:**
   ```bash
   git push origin main
   ```
   Затем в Render Dashboard нажмите "Manual Deploy"

---

## Проверка работы

После обновления проверьте:

1. **Откройте ваш сайт:** `https://your-project.onrender.com/index.html`
2. **Проверьте API:** `https://your-project.onrender.com/api/quizzes`
   - Должен вернуть список квизов
   - Для `friends-quiz` должно быть `totalQuestionsInBase: 131` (или другое число)
3. **Проверьте логи в Render:**
   - Должна быть строка: `Загружено X вопросов из файла ...`

---

## Устранение проблем

### Вопросы не загружаются

1. **Проверьте логи в Render:**
   - Откройте Dashboard → Logs
   - Ищите ошибки типа "Файл не найден"

2. **Проверьте, что файл в репозитории:**
   ```bash
   git ls-files | grep -E "(questions.txt|Quiz/GNU.txt)"
   ```

3. **Если файл не в Git:**
   ```bash
   git add questions.txt
   # или
   git add Quiz/GNU.txt
   git commit -m "Add questions file"
   git push origin main
   ```

### Сервер не запускается

1. Проверьте логи в Render Dashboard
2. Убедитесь, что `package.json` содержит правильный `start` скрипт
3. Проверьте переменные окружения

---

## Полезные команды для проверки

```bash
# Проверить, что файл в Git
git ls-files questions.txt

# Проверить локально
npm start
# Откройте http://localhost:3000/api/quizzes
# Должен вернуть список квизов с вопросами
```

