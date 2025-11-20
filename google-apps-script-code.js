// Код для Google Apps Script
// Скопируйте этот код в ваш Apps Script проект

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
// Выберите эту функцию и нажмите "Выполнить" для теста
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

