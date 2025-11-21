# Настройка Google Sheets для загрузки рейтинга

## 📋 Обновление Google Apps Script

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
