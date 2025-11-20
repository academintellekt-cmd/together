# Настройка записи в Google Sheets

## Получение Spreadsheet ID

Из вашей публичной ссылки нужно извлечь реальный Spreadsheet ID:

1. Откройте таблицу в режиме редактирования: https://docs.google.com/spreadsheets/d/ВАШ_ID/edit
2. ID таблицы находится в URL между `/d/` и `/edit`
3. Например, если URL: `https://docs.google.com/spreadsheets/d/1ABC123xyz/edit`
4. То ID: `1ABC123xyz`

**ВАЖНО**: Публичная ссылка (с `/pubhtml`) не содержит реальный ID. Нужно открыть таблицу в режиме редактирования.

## Способ 1: Через Service Account (Рекомендуется)

### Шаг 1: Создание Service Account

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **Google Sheets API**:
   - Перейдите в "APIs & Services" > "Library"
   - Найдите "Google Sheets API" и включите его

### Шаг 2: Создание Service Account

1. Перейдите в "APIs & Services" > "Credentials"
2. Нажмите "Create Credentials" > "Service Account"
3. Введите имя (например, "quiz-sheets-writer")
4. Нажмите "Create and Continue"
5. Пропустите шаг с ролями (нажмите "Continue")
6. Нажмите "Done"

### Шаг 3: Создание ключа

1. Найдите созданный Service Account в списке
2. Нажмите на него
3. Перейдите на вкладку "Keys"
4. Нажмите "Add Key" > "Create new key"
5. Выберите формат JSON
6. Нажмите "Create"
7. Файл JSON будет скачан автоматически

### Шаг 4: Настройка доступа к таблице

1. Откройте скачанный JSON файл
2. Скопируйте значение поля `client_email` (например, `quiz-sheets-writer@your-project.iam.gserviceaccount.com`)
3. Откройте вашу Google таблицу: https://docs.google.com/spreadsheets/d/2PACX-1vSUGnxZvo-Voj9-2qofLo2j65WbHfF4x3RLg9ElMNajQU4f1DxXn3Lg_xhPGtXrFIUr75AG0guc-GT5/edit
4. Нажмите "Поделиться" (Share)
5. Вставьте email из `client_email` и дайте права "Редактор" (Editor)
6. Нажмите "Отправить"

### Шаг 5: Размещение файла credentials

1. Переименуйте скачанный JSON файл в `google-credentials.json`
2. Поместите его в корневую папку проекта (рядом с `server.js`)
3. **ВАЖНО**: Добавьте `google-credentials.json` в `.gitignore`, чтобы не загружать его в Git!

### Шаг 6: Настройка переменной окружения

1. Создайте файл `.env` в корне проекта (или установите переменную окружения)
2. Добавьте строку:
   ```
   GOOGLE_SHEET_ID=ваш_spreadsheet_id
   ```
3. Или установите переменную окружения в системе:
   ```bash
   # Windows PowerShell
   $env:GOOGLE_SHEET_ID="ваш_spreadsheet_id"
   
   # Linux/Mac
   export GOOGLE_SHEET_ID="ваш_spreadsheet_id"
   ```

### Шаг 7: Настройка заголовков таблицы

Убедитесь, что в первой строке таблицы (Лист1) есть заголовки в колонках A-H:
- A: Дата и время
- B: Имя игрока
- C: Очки
- D: Правильных ответов
- E: Всего вопросов
- F: Процент правильных
- G: Время прохождения
- H: Название квиза

## Способ 2: Через Google Apps Script Web App (Проще, рекомендуется)

Этот способ проще в настройке и не требует Service Account.

### Шаг 1: Создание Apps Script

1. Откройте вашу таблицу в режиме редактирования
2. Перейдите в "Расширения" > "Apps Script"
3. Удалите весь код по умолчанию
4. Вставьте следующий код:

```javascript
function doPost(e) {
  try {
    // Проверка наличия данных
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Нет данных в запросе'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Лист1');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    }
    
    const data = JSON.parse(e.postData.contents);
    
    // Форматируем дату
    const date = new Date(data.date);
    const formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    
    // Форматируем время прохождения (приходит в секундах)
    const timeSpentSeconds = data.timeSpent || 0;
    const minutes = Math.floor(timeSpentSeconds / 60);
    const seconds = timeSpentSeconds % 60;
    const formattedTime = minutes + 'м ' + seconds + 'с';
    
    // Процент правильных ответов
    const percentage = data.percentage || (data.totalQuestions > 0 
      ? Math.round((data.correctAnswers / data.totalQuestions) * 100) 
      : 0);
    
    // Название квиза
    const quizName = data.quizId || 'Неизвестно';
    
    const row = [
      formattedDate,                    // Дата и время
      data.playerName,                  // Имя игрока
      data.score,                       // Очки
      data.correctAnswers,              // Правильных ответов
      data.totalQuestions,              // Всего вопросов
      percentage + '%',                 // Процент правильных
      formattedTime,                    // Время прохождения
      quizName                          // Название квиза
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Ошибка: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false, 
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Тестовая функция для проверки работы скрипта
// Выберите эту функцию в выпадающем списке и нажмите "Выполнить" для теста
function testWrite() {
  // Тестовые данные
  const testData = {
    date: new Date().toISOString(),
    playerName: 'Тестовый игрок',
    score: 1500,
    correctAnswers: 12,
    totalQuestions: 15,
    timeSpent: 180,
    percentage: 80,
    quizId: 'Чемпионат ГНУ'
  };
  
  // Создаем тестовый объект запроса
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  // Вызываем doPost
  const result = doPost(mockEvent);
  Logger.log('Результат: ' + result.getContent());
  
  return 'Тест выполнен. Проверьте таблицу и журнал выполнения.';
}
```

**Важно**: 
- Функцию `doPost` нельзя запускать вручную через "Выполнить" - она вызывается автоматически при POST запросе
- Для тестирования используйте функцию `testWrite` - выберите её в выпадающем списке функций и нажмите "Выполнить"

### Шаг 2: Сохранение и развертывание

1. Нажмите "Сохранить" (Ctrl+S или Cmd+S)
2. Дайте проекту имя (например, "Quiz Results Writer")
3. Нажмите "Развернуть" > "Новое развертывание"
4. Нажмите на иконку настроек (шестеренка) рядом с "Тип"
5. Выберите "Веб-приложение"
6. Настройте:
   - **Описание**: "Quiz Results API"
   - **Выполнять от имени**: "Меня"
   - **У кого есть доступ**: "Все" (важно!)
7. Нажмите "Развернуть"
8. При первом развертывании нужно авторизовать доступ:
   - Нажмите "Разрешить"
   - Выберите ваш Google аккаунт
   - Нажмите "Дополнительно" > "Перейти к Quiz Results Writer (небезопасно)"
   - Нажмите "Разрешить"
9. Скопируйте **URL веб-приложения** (он будет показан после развертывания)

### Шаг 3: Настройка в проекте

URL уже настроен в `server.js`. Если нужно изменить URL, установите переменную окружения:

```bash
# Windows PowerShell
$env:GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/ВАШ_URL/exec"

# Linux/Mac
export GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/ВАШ_URL/exec"
```

**Примечание**: Ошибка "Script function not found: doGet" при открытии URL в браузере - это нормально. Функция `doGet` не нужна, используется только `doPost` для записи данных.

**Готово!** Теперь при каждом прохождении квиза данные будут автоматически записываться в Google Sheets.

### Тестовая функция для проверки

Если хотите протестировать скрипт вручную, добавьте эту функцию:

```javascript
function testWrite() {
  // Тестовые данные
  const testData = {
    date: new Date().toISOString(),
    playerName: 'Тестовый игрок',
    score: 1500,
    correctAnswers: 12,
    totalQuestions: 15,
    timeSpent: 180,
    percentage: 80,
    quizId: 'Чемпионат ГНУ'
  };
  
  // Создаем тестовый объект запроса
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  // Вызываем doPost
  const result = doPost(mockEvent);
  Logger.log('Результат: ' + result.getContent());
}
```

Запустите функцию `testWrite` через кнопку "Выполнить" для проверки.

## Проверка работы

После настройки перезапустите сервер:
```bash
npm run restart
```

При прохождении квиза данные автоматически будут записываться в Google Sheets.

