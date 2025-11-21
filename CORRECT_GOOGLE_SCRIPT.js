// ПРАВИЛЬНЫЙ код для Google Apps Script (без костылей)
// Замените YOUR_SHEET_ID на: 1yGUV-99vQEcEYGCS9BIX1IC4LYDopaFA7Qis9hjobPk

// Функция для парсинга времени из формата "Xм Yс" в секунды
function parseTimeToSeconds(timeString) {
  if (!timeString || timeString === '') return 0;
  
  // Если это уже число, возвращаем его
  if (typeof timeString === 'number') return timeString;
  
  const str = timeString.toString().trim();
  
  // Если пустая строка или "0", возвращаем 0
  if (str === '' || str === '0') return 0;
  
  let totalSeconds = 0;
  
  // Ищем минуты (например, "2м")
  const minutesMatch = str.match(/(\d+)м/);
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1]) * 60;
  }
  
  // Ищем секунды (например, "30с")
  const secondsMatch = str.match(/(\d+)с/);
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1]);
  }
  
  // Если не нашли ни минут, ни секунд, пробуем парсить как число
  if (totalSeconds === 0) {
    const numericValue = parseFloat(str);
    if (!isNaN(numericValue)) {
      return numericValue;
    }
  }
  
  return totalSeconds;
}

function doPost(e) {
  // Функция для записи данных (оставляем как есть)
  try {
    const data = JSON.parse(e.postData.contents);
    
    const sheet = SpreadsheetApp.openById('1yGUV-99vQEcEYGCS9BIX1IC4LYDopaFA7Qis9hjobPk').getActiveSheet();
    
    // Добавляем новую строку с данными в правильном порядке
    // A=дата, B=имя, C=очки, D=правильных, E=всего, F=процент, G=время, H=квиз
    const minutes = Math.floor(data.timeSpent / 60);
    const seconds = data.timeSpent % 60;
    const formattedTime = minutes > 0 ? `${minutes}м ${seconds}с` : `${seconds}с`;
    
    sheet.appendRow([
      data.date,           // A - Время (дата)
      data.playerName,     // B - Имя
      data.score,          // C - Очки
      data.correctAnswers, // D - Правильных
      data.totalQuestions, // E - Всего
      data.percentage,     // F - Процент правильных
      formattedTime,       // G - Время (продолжительность)
      data.quizId          // H - Квиз
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
  // ИСПРАВЛЕННАЯ функция для загрузки рейтинга
  try {
    const action = e.parameter.action;
    
    if (action === 'getLeaderboard') {
      const sheet = SpreadsheetApp.openById('1yGUV-99vQEcEYGCS9BIX1IC4LYDopaFA7Qis9hjobPk').getActiveSheet();
      const data = sheet.getDataRange().getValues();
      
      // Отладочная информация - покажем структуру первых строк
      console.log('=== ОТЛАДКА СТРУКТУРЫ GOOGLE SHEETS ===');
      for (let i = 0; i < Math.min(5, data.length); i++) {
        console.log(`Строка ${i}: [${data[i].join(' | ')}]`);
      }
      
      // Собираем все результаты, пропуская пустые строки
      const allResults = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Пропускаем полностью пустые строки и строки без имени игрока или очков
        if (!row[1] || row[1].toString().trim() === '' || 
            row[2] === '' || row[2] === null || row[2] === undefined) {
          continue; // Пропускаем эту строку
        }
        
        const playerName = row[1].toString().trim();
        const score = parseInt(row[2]) || 0;
        
        // Пропускаем строки с нулевыми очками или пустыми именами
        if (playerName === '' || score === 0) {
          continue;
        }
        
        // ПРОСТАЯ ЛОГИКА: Читаем время из столбца G (индекс 6) как раньше
        const timeSpent = parseTimeToSeconds(row[6]);
        
        // Отладочная информация для проблемных игроков
        if (playerName === 'Артём Ковальский' || playerName === 'Роман') {
          console.log(`=== ${playerName} ===`);
          console.log(`Столбец F (${row[5]}) -> ${parseTimeToSeconds(row[5])}`);
          console.log(`Столбец G (${row[6]}) -> ${parseTimeToSeconds(row[6])}`);
          console.log(`Столбец H (${row[7]}) -> ${parseTimeToSeconds(row[7])}`);
          console.log(`Выбранное время: ${timeSpent}`);
        }
        
        allResults.push({
          date: row[0] ? row[0].toString() : new Date().toISOString().split('T')[0],
          playerName: playerName,
          score: score,
          correctAnswers: parseInt(row[3]) || 0,
          totalQuestions: parseInt(row[4]) || 0,
          timeSpent: timeSpent, // Время из столбца G (как раньше)
          percentage: parseInt(row[5]) || 0, // Процент в столбце F
          quizId: row[7] ? row[7].toString() : 'friends-quiz',
          timestamp: row[0] ? new Date(row[0]).getTime() : Date.now()
        });
      }
      
      // Группируем по игрокам и берем лучший результат каждого
      const playerBestScores = {};
      
      allResults.forEach(result => {
        const key = result.playerName.toLowerCase().trim();
        
        // Если игрока еще нет или его новый результат лучше
        if (!playerBestScores[key] || playerBestScores[key].score < result.score) {
          playerBestScores[key] = result;
        }
      });
      
      // Преобразуем в массив и сортируем по очкам
      const leaderboard = Object.values(playerBestScores).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
      });
      
      // Ограничиваем до 50 лучших игроков
      const topLeaderboard = leaderboard.slice(0, 50);
      
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          leaderboard: topLeaderboard,
          total: allResults.length,
          uniquePlayers: leaderboard.length
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Если action не указан или неизвестен
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false, 
        error: 'Unknown action. Use ?action=getLeaderboard'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false, 
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
