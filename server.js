const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { loadAllQuizzes } = require('./server/utils/quiz-loader');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Geometria', express.static(path.join(__dirname, 'Geometria')));

// Хранилище комнат и игроков
const rooms = new Map();
const players = new Map();

// Хранилище рейтинга для соло-режима
let leaderboard = [];

// Инициализация рейтинга при запуске сервера
async function initializeLeaderboard() {
  console.log('🔄 Загрузка рейтинга из Google Sheets...');
  const savedLeaderboard = await loadLeaderboardFromGoogleSheets();
  
  if (savedLeaderboard.length > 0) {
    leaderboard.length = 0; // Очищаем текущий массив
    leaderboard.push(...savedLeaderboard); // Добавляем загруженные данные
    
    // Сортируем по очкам (от большего к меньшему)
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
    });
    
    console.log(`✅ Рейтинг загружен: ${leaderboard.length} записей`);
  } else {
    console.log('📝 Начинаем с пустого рейтинга');
  }
}

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

// Функция загрузки рейтинга из Google Sheets
async function loadLeaderboardFromGoogleSheets() {
  try {
    const WEB_APP_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwfQPlAw9LTH4V3a3mrZXpqVdOdrTqCYs67L7aPTdibiMloDTvivj-c3hpnQdafvY43zQ/exec';
    
    console.log('🔄 Попытка загрузки рейтинга из Google Sheets...');
    console.log('📡 URL:', WEB_APP_URL + '?action=getLeaderboard');
    
    if (!WEB_APP_URL) {
      console.log('❌ GOOGLE_APPS_SCRIPT_URL не настроен. Пропускаем загрузку рейтинга.');
      return [];
    }

    const https = require('https');
    const http = require('http');
    
    const parsedUrl = new URL(WEB_APP_URL + '?action=getLeaderboard');
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const req = client.request(options, (res) => {
        let responseData = '';
        
        console.log('📊 Статус ответа Google Sheets:', res.statusCode);
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          console.log('📄 Ответ от Google Sheets:', responseData.substring(0, 200) + '...');
          
          // Обрабатываем редирект 302
          if (res.statusCode === 302 && responseData.includes('script.googleusercontent.com')) {
            console.log('🔄 Обнаружен редирект, извлекаем URL...');
            
            // Извлекаем URL из HTML редиректа
            const match = responseData.match(/HREF="([^"]+)"/);
            if (match) {
              const redirectUrl = match[1].replace(/&amp;/g, '&');
              console.log('📡 Редирект URL:', redirectUrl);
              
              // Делаем запрос по редирект URL
              const https = require('https');
              const redirectReq = https.get(redirectUrl, (redirectRes) => {
                let redirectData = '';
                
                redirectRes.on('data', (chunk) => {
                  redirectData += chunk;
                });
                
                redirectRes.on('end', () => {
                  try {
                    const data = JSON.parse(redirectData);
                    console.log('🔍 Парсинг редиректа успешен. Success:', data.success, 'Leaderboard length:', data.leaderboard?.length);
                    
                    if (data.success && Array.isArray(data.leaderboard)) {
                      console.log(`✅ Загружено ${data.leaderboard.length} записей рейтинга из Google Sheets`);
                      
                      // Просто возвращаем данные как есть из Google Apps Script
                      const processedLeaderboard = data.leaderboard;
                      
                      if (processedLeaderboard.length > 0) {
                        console.log('📋 Первая запись (обработанная):', JSON.stringify(processedLeaderboard[0], null, 2));
                        console.log('📋 Оригинальная первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
                      }
                      resolve(processedLeaderboard);
                    } else {
                      console.log('⚠️ Рейтинг не найден в Google Sheets');
                      resolve([]);
                    }
                  } catch (e) {
                    console.log('❌ Ошибка парсинга JSON редиректа:', e.message);
                    resolve([]);
                  }
                });
              });
              
              redirectReq.on('error', (error) => {
                console.log('❌ Ошибка запроса редиректа:', error.message);
                resolve([]);
              });
              
              return;
            }
          }
          
          // Обычная обработка JSON ответа
          try {
            const data = JSON.parse(responseData);
            console.log('🔍 Парсинг успешен. Success:', data.success, 'Leaderboard length:', data.leaderboard?.length);
            
            if (data.success && Array.isArray(data.leaderboard)) {
              console.log(`✅ Загружено ${data.leaderboard.length} записей рейтинга из Google Sheets`);
              
              // Просто возвращаем данные как есть из Google Apps Script
              const processedLeaderboard = data.leaderboard;
              
              if (processedLeaderboard.length > 0) {
                console.log('📋 Первая запись (обработанная):', JSON.stringify(processedLeaderboard[0], null, 2));
                console.log('📋 Оригинальная первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
              }
              resolve(processedLeaderboard);
            } else {
              console.log('⚠️ Рейтинг не найден в Google Sheets или неверный формат ответа');
              console.log('🔍 Полный ответ:', JSON.stringify(data, null, 2));
              resolve([]);
            }
          } catch (e) {
            console.log('❌ Ошибка парсинга JSON от Google Sheets:', e.message);
            console.log('📄 Сырой ответ:', responseData);
            resolve([]);
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ Ошибка HTTP запроса к Google Sheets:', error.message);
        resolve([]);
      });

      req.setTimeout(10000, () => {
        console.log('⏰ Таймаут запроса к Google Sheets');
        req.destroy();
        resolve([]);
      });

      req.end();
    });
  } catch (error) {
    console.log('❌ Критическая ошибка при загрузке рейтинга из Google Sheets:', error.message);
    return [];
  }
}

// Функция записи результата в Google Sheets через Apps Script Web App
async function writeToGoogleSheets(result) {
  try {
    const WEB_APP_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwfQPlAw9LTH4V3a3mrZXpqVdOdrTqCYs67L7aPTdibiMloDTvivj-c3hpnQdafvY43zQ/exec';
    
    if (!WEB_APP_URL) {
      console.log('GOOGLE_APPS_SCRIPT_URL не настроен. Пропускаем запись в Google Sheets.');
      return false;
    }

    // Форматируем данные
    const minutes = Math.floor(result.timeSpent / 60);
    const seconds = result.timeSpent % 60;
    const formattedTime = `${minutes}м ${seconds}с`;

    const percentage = result.totalQuestions > 0 
      ? Math.round((result.correctAnswers / result.totalQuestions) * 100) 
      : 0;

    const data = {
      date: result.date,
      playerName: result.playerName,
      score: result.score,
      correctAnswers: result.correctAnswers,
      totalQuestions: result.totalQuestions,
      timeSpent: result.timeSpent, // Передаем в секундах, Apps Script сам отформатирует
      percentage: percentage,
      quizId: (result.quizId === 'friends-quiz' || result.quizId === 'gnu') ? (quizzes['gnu']?.name || 'Чемпионат ГНУ') : (quizzes[result.quizId]?.name || result.quizId)
    };

    const https = require('https');
    const http = require('http');
    
    const parsedUrl = new URL(WEB_APP_URL);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      // Следуем редиректам (Google Apps Script возвращает 302)
      maxRedirects: 5
    };

    return new Promise((resolve) => {
      const req = client.request(options, (res) => {
        // Google Apps Script может вернуть 302 (редирект) или 200
        // 302 обычно означает успешную запись с редиректом
        if (res.statusCode === 200) {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            try {
              const result = JSON.parse(responseData);
              if (result.success) {
                console.log('✅ Данные успешно записаны в Google Sheets');
                resolve(true);
              } else {
                console.error('❌ Ошибка записи в Google Sheets:', result.error);
                resolve(false);
              }
            } catch (e) {
              console.log('✅ Данные успешно записаны в Google Sheets (200 OK)');
              resolve(true);
            }
          });
        } else if (res.statusCode === 302) {
          // 302 редирект - это нормально для Google Apps Script, означает успех
          console.log('✅ Данные успешно записаны в Google Sheets (302 redirect)');
          res.on('data', () => {}); // Поглощаем данные
          res.on('end', () => resolve(true));
        } else {
          console.error('❌ Ошибка записи в Google Sheets Web App:', res.statusCode);
          res.on('data', () => {});
          res.on('end', () => resolve(false));
        }
      });

      req.on('error', (error) => {
        console.error('❌ Ошибка при запросе к Google Sheets Web App:', error.message);
        resolve(false);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('Ошибка при записи в Google Sheets через Web App:', error.message);
    return false;
  }
}

// Функция загрузки вопросов из TXT файла
function loadQuestionsFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`Файл ${filePath} не найден. Вопросы будут пустыми.`);
      return [];
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const questions = [];
    let currentQuestion = null;
    let questionId = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Пропускаем пустые строки и комментарии
      if (!line || line.startsWith('//') || line.startsWith('#')) {
        continue;
      }

      // Если строка заканчивается на "?", это вопрос
      if (line.endsWith('?')) {
        // Сохраняем предыдущий вопрос, если есть
        if (currentQuestion && currentQuestion.options.length > 0) {
          questions.push(currentQuestion);
        }
        
        // Начинаем новый вопрос
        currentQuestion = {
          id: questionId++,
          question: line,
          options: [],
          correct: -1,
          time: 20 // По умолчанию 20 секунд
        };
      }
      // Если строка начинается с "+" или "*", это вариант ответа
      else if (line.startsWith('+') || line.startsWith('*')) {
        if (currentQuestion) {
          let answer = line.substring(1).trim(); // Убираем префикс "+" или "*"
          
          // Проверяем, есть ли звездочка в конце (правильный ответ)
          const isCorrect = answer.endsWith('★') || answer.endsWith('*');
          
          // Удаляем звездочку из конца ответа
          answer = answer.replace(/[★*]$/, '').trim();
          
          // Добавляем ответ БЕЗ звездочки
          currentQuestion.options.push(answer);
          
          // Если это правильный ответ и еще не установлен
          if (isCorrect && currentQuestion.correct === -1) {
            currentQuestion.correct = currentQuestion.options.length - 1;
          }
        }
      }
      // Если строка начинается с "-", это неправильный ответ
      else if (line.startsWith('-')) {
        if (currentQuestion) {
          const answer = line.substring(1).trim();
          currentQuestion.options.push(answer);
        }
      }
      // Если строка содержит "time:" или "время:", это время на ответ
      else if (line.toLowerCase().includes('time:') || line.toLowerCase().includes('время:')) {
        if (currentQuestion) {
          const timeMatch = line.match(/\d+/);
          if (timeMatch) {
            currentQuestion.time = parseInt(timeMatch[0]);
          }
        }
      }
      // Пропускаем строки "Вопрос N"
      else if (line.toLowerCase().startsWith('вопрос ')) {
        continue;
      }
      // Иначе это может быть вариант ответа без префикса (проверяем на звездочку)
      else if (currentQuestion && currentQuestion.options.length < 4) {
        let answer = line.trim();
        const isCorrect = answer.endsWith('★') || answer.endsWith('*');
        
        // Удаляем звездочку из ответа (важно: удаляем ПЕРЕД добавлением в массив)
        answer = answer.replace(/[★*]$/, '').trim();
        // Удаляем префикс "* " если есть
        answer = answer.replace(/^\*\s*/, '').trim();
        
        // Добавляем ответ БЕЗ звездочки
        currentQuestion.options.push(answer);
        
        // Если это правильный ответ и еще не установлен
        if (isCorrect && currentQuestion.correct === -1) {
          currentQuestion.correct = currentQuestion.options.length - 1;
        }
      }
    }

    // Добавляем последний вопрос
    if (currentQuestion && currentQuestion.options.length > 0) {
      questions.push(currentQuestion);
    }

    console.log(`Загружено ${questions.length} вопросов из файла ${filePath}`);
    
    // Перемешиваем варианты ответов для каждого вопроса
    questions.forEach(question => {
      if (question.options.length > 0 && question.correct >= 0) {
        // Сохраняем правильный ответ
        const correctAnswer = question.options[question.correct];
        
        // Перемешиваем все варианты
        const shuffledOptions = question.options.sort(() => Math.random() - 0.5);
        
        // Находим новый индекс правильного ответа
        const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);
        
        // Обновляем вопрос
        question.options = shuffledOptions;
        question.correct = newCorrectIndex;
      }
    });

    // Перемешиваем вопросы случайным образом
    const shuffled = questions.sort(() => Math.random() - 0.5);
    
    // Переназначаем ID для последовательности
    shuffled.forEach((q, index) => {
      q.id = index + 1;
    });

    console.log(`Вопросы перемешаны. Всего: ${shuffled.length}`);
    return shuffled;
  } catch (error) {
    console.error(`Ошибка при загрузке вопросов из файла ${filePath}:`, error);
    return [];
  }
}

// Генерация кода комнаты (4 символа)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Загрузка всех квизов из файлов
console.log('🔄 Загрузка квизов из файлов...');
let quizzes = {};
try {
  quizzes = loadAllQuizzes();
  console.log(`✅ Загружено ${Object.keys(quizzes).length} квизов`);
  
  // Для обратной совместимости создаем старые ID
  // Если есть квиз 'gnu', создаем также 'friends-quiz' и 'gnu-multiplayer'
  if (quizzes['gnu']) {
    const gnuQuiz = quizzes['gnu'];
    
    // Создаем friends-quiz для соло режима
    if (!quizzes['friends-quiz']) {
      quizzes['friends-quiz'] = {
        ...gnuQuiz,
        id: 'friends-quiz',
        soloMode: true
      };
    }
    
    // Создаем gnu-multiplayer для мультиплеера
    if (!quizzes['gnu-multiplayer']) {
      quizzes['gnu-multiplayer'] = {
        ...gnuQuiz,
        id: 'gnu-multiplayer',
        soloMode: false
      };
    }
  }
} catch (error) {
  console.error('❌ Ошибка загрузки квизов:', error);
  quizzes = {};
}

// Получение списка квизов
app.get('/api/quizzes', (req, res) => {
  const quizzesList = Object.values(quizzes)
    .filter(quiz => {
      // Показываем только квизы с вопросами
      if (!quiz.questions || quiz.questions.length === 0) {
        return false;
      }
      
      // Исключаем дубликаты для обратной совместимости
      // Показываем 'gnu' вместо 'friends-quiz' и 'gnu-multiplayer', если они есть
      if (quizzes['gnu'] && (quiz.id === 'friends-quiz' || quiz.id === 'gnu-multiplayer')) {
        return false; // Скрываем старые ID, если есть новый 'gnu'
      }
      
      return true;
    })
    .map(quiz => {
      const avgTime = quiz.questions.length > 0
        ? Math.round(quiz.questions.reduce((sum, q) => sum + q.time, 0) / quiz.questions.length)
        : 0;
      
      // Определяем soloMode: если есть soloMode в конфиге, используем его
      // Если soloMode не указан, но есть multiplayerMode, то soloMode = !multiplayerMode
      // По умолчанию soloMode = true (если ничего не указано)
      const soloMode = quiz.soloMode !== undefined 
        ? quiz.soloMode 
        : (quiz.multiplayerMode !== undefined ? !quiz.multiplayerMode : true);
      
      const result = {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        icon: quiz.icon,
        questionCount: quiz.questions.length,
        avgTime: avgTime,
        comingSoon: false,
        soloMode: soloMode
      };
      
      // Для квизов с soloMode добавляем totalQuestionsInBase
      if (result.soloMode) {
        result.totalQuestionsInBase = quiz.questions.length;
      }
      
      // Добавляем информацию из конфигурации, если есть
      if (quiz.colors) {
        result.colors = quiz.colors;
      }
      if (quiz.display) {
        result.display = quiz.display;
      }
      
      return result;
    });
  
  res.json(quizzesList);
});

// Получение конкретного квиза по ID (для соло режима)
app.get('/api/quizzes/:id', (req, res) => {
  const quizId = req.params.id;
  const quiz = quizzes[quizId];
  
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден' });
  }
  
  let questionsToSend = quiz.questions;
  
  // Для квизов с настройкой questionsPerGame выбираем случайные вопросы
  const questionsPerGame = quiz.gameSettings?.questionsPerGame || 15;
  if (quiz.questions.length > questionsPerGame) {
    // Создаем копию массива и перемешиваем
    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    // Берем нужное количество вопросов
    questionsToSend = shuffled.slice(0, questionsPerGame);
    
    // Перемешиваем варианты ответов для каждого выбранного вопроса
    questionsToSend = questionsToSend.map((q, index) => {
      // Создаем глубокую копию вопроса
      const questionCopy = {
        ...q,
        options: [...q.options],
        id: index + 1
      };
      
      // Перемешиваем варианты ответов
      if (questionCopy.options.length > 0 && questionCopy.correct >= 0) {
        // Сохраняем правильный ответ
        const correctAnswer = questionCopy.options[questionCopy.correct];
        
        // Перемешиваем все варианты
        const shuffledOptions = questionCopy.options.sort(() => Math.random() - 0.5);
        
        // Находим новый индекс правильного ответа
        const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);
        
        // Обновляем вопрос
        questionCopy.options = shuffledOptions;
        questionCopy.correct = newCorrectIndex;
      }
      
      // Убеждаемся, что звездочки удалены из всех вариантов ответов (клиент не должен видеть маркеры)
      questionCopy.options = questionCopy.options.map(option => {
        // Удаляем звездочки и другие маркеры в конце и начале строки
        let cleanOption = option.toString();
        cleanOption = cleanOption.replace(/[★*]$/, ''); // Удаляем звездочку в конце
        cleanOption = cleanOption.replace(/^\*\s*/, ''); // Удаляем префикс "* "
        cleanOption = cleanOption.trim();
        return cleanOption;
      });
      
      return questionCopy;
    });
    
    console.log(`Для квиза ${quizId} выбрано ${questionsPerGame} случайных вопросов из ${quiz.questions.length}`);
  } else {
    // Для других квизов также удаляем звездочки из ответов
    questionsToSend = questionsToSend.map(q => ({
      ...q,
      options: q.options.map(option => {
        return option.replace(/[★*]$/, '').replace(/^\*\s*/, '').trim();
      })
    }));
  }
  
  // Определяем soloMode для ответа
  const soloMode = quiz.soloMode !== undefined 
    ? quiz.soloMode 
    : (quiz.multiplayerMode !== undefined ? !quiz.multiplayerMode : true);
  
  res.json({
    id: quiz.id,
    name: quiz.name,
    description: quiz.description,
    questions: questionsToSend,
    soloMode: soloMode,
    totalQuestionsInBase: quiz.questions.length // Общее количество вопросов в базе
  });
});

// Сохранение результата в рейтинг
app.post('/api/leaderboard', (req, res) => {
  const { playerName, quizId, score, correctAnswers, totalQuestions, timeSpent } = req.body;
  
  if (!playerName || !quizId || score === undefined) {
    return res.status(400).json({ error: 'Недостаточно данных' });
  }
  
  const result = {
    id: Date.now().toString(),
    playerName: playerName.trim(),
    quizId: quizId,
    score: score,
    correctAnswers: correctAnswers || 0,
    totalQuestions: totalQuestions || 0,
    timeSpent: timeSpent || 0,
    date: new Date().toISOString(),
    timestamp: Date.now()
  };
  
  leaderboard.push(result);
  
  // Сортируем по очкам (от большего к меньшему)
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
  });
  
  // Ограничиваем до 100 лучших результатов
  if (leaderboard.length > 100) {
    leaderboard.splice(100);
  }

  // Записываем в Google Sheets (асинхронно, не блокируем ответ)
  writeToGoogleSheets(result).then(async (success) => {
    if (success) {
      console.log('✅ Результат записан в Google Sheets, обновляем рейтинг...');
      // Обновляем рейтинг после успешной записи
      await initializeLeaderboard();
    }
  }).catch(err => {
    console.error('Ошибка записи в Google Sheets:', err);
  });
  
  res.json({ success: true, result: result });
});

// Получение рейтинга
app.get('/api/leaderboard', (req, res) => {
  const { quizId } = req.query;
  
  let results = leaderboard;
  
  // Фильтруем по quizId, если указан
  if (quizId) {
    results = leaderboard.filter(r => r.quizId === quizId);
  }
  
  // Группируем по игрокам и берем лучший результат каждого
  const playerBestScores = {};
  results.forEach(result => {
    // Пропускаем результаты с пустыми именами или нулевыми очками
    if (!result.playerName || result.playerName.trim() === '' || result.score === 0) {
      return;
    }
    
    const key = result.playerName.toLowerCase().trim();
    
    // Если игрока еще нет или его новый результат лучше
    if (!playerBestScores[key] || playerBestScores[key].score < result.score) {
      playerBestScores[key] = result;
    }
  });
  
  // Сортируем по очкам (от большего к меньшему)
  const sortedResults = Object.values(playerBestScores).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
  });
  
  // Ограничиваем до 50 лучших игроков
  const topResults = sortedResults.slice(0, 50);
  
  res.json(topResults);
});

// Тестовый endpoint для принудительной загрузки рейтинга
app.get('/api/reload-leaderboard', async (req, res) => {
  console.log('🔄 Принудительная перезагрузка рейтинга...');
  
  try {
    const savedLeaderboard = await loadLeaderboardFromGoogleSheets();
    
    if (savedLeaderboard.length > 0) {
      leaderboard.length = 0; // Очищаем текущий массив
      leaderboard.push(...savedLeaderboard); // Добавляем загруженные данные
      
      // Сортируем по очкам (от большего к меньшему)
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
      });
      
      res.json({ 
        success: true, 
        message: `Рейтинг перезагружен: ${leaderboard.length} записей`,
        leaderboard: leaderboard 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Не удалось загрузить рейтинг из Google Sheets',
        leaderboard: [] 
      });
    }
  } catch (error) {
    console.error('❌ Ошибка перезагрузки рейтинга:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка перезагрузки рейтинга: ' + error.message 
    });
  }
});

// Перезагрузка вопросов из файла (для обновления без перезапуска сервера)
app.post('/api/reload-questions', (req, res) => {
  const { quizId } = req.body;
  
  if (!quizId || !quizzes[quizId]) {
    return res.status(400).json({ error: 'Квиз не найден' });
  }
  
  try {
    const { loadQuiz } = require('./server/utils/quiz-loader');
    const reloadedQuiz = loadQuiz(quizId);
    
    // Обновляем вопросы в памяти
    quizzes[quizId].questions = reloadedQuiz.questions;
    
    // Если это основной квиз 'gnu', обновляем также старые ID для обратной совместимости
    if (quizId === 'gnu') {
      if (quizzes['friends-quiz']) {
        quizzes['friends-quiz'].questions = reloadedQuiz.questions;
      }
      if (quizzes['gnu-multiplayer']) {
        quizzes['gnu-multiplayer'].questions = reloadedQuiz.questions;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Вопросы перезагружены. Загружено ${reloadedQuiz.questions.length} вопросов.`,
      questionCount: reloadedQuiz.questions.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка перезагрузки вопросов: ' + error.message 
    });
  }
});

// Получение IP-адреса сервера
app.get('/api/server-ip', (req, res) => {
  // Получаем IP-адрес из запроса
  const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Получаем локальный IP-адрес сервера
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let serverIp = 'localhost';
  
  // Ищем первый не-loopback IPv4 адрес
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        serverIp = iface.address;
        break;
      }
    }
    if (serverIp !== 'localhost') break;
  }
  
  const port = process.env.PORT || 3000;
  res.json({ 
    ip: serverIp,
    port: port,
    url: `http://${serverIp}:${port}`
  });
});

// Создание комнаты
app.post('/api/create-room', (req, res) => {
  const { quizId, password } = req.body;
  
  // Проверяем, что квиз существует
  if (!quizId || !quizzes[quizId]) {
    return res.status(400).json({ error: 'Квиз не найден' });
  }
  
  const quiz = quizzes[quizId];
  
  // Проверяем пароль из конфигурации квиза
  if (quiz.passwordRequired && quiz.password) {
    if (!password || password !== quiz.password) {
      return res.status(401).json({ error: 'Неверный пароль', requiresPassword: true });
    }
  }
  
  // Обратная совместимость: проверка для старых ID
  if (quizId === 'friends-quiz' || quizId === 'gnu-multiplayer') {
    const gnuQuiz = quizzes['gnu'] || quizzes[quizId];
    if (gnuQuiz && gnuQuiz.passwordRequired && gnuQuiz.password) {
      if (!password || password !== gnuQuiz.password) {
        return res.status(401).json({ error: 'Неверный пароль', requiresPassword: true });
      }
    }
  }
  const roomCode = generateRoomCode();
  
  // Для мультиплеера выбираем 15 случайных вопросов из всех доступных
  // Если создается комната через /api/create-room, это всегда мультиплеер
  let questionsForRoom = [...quiz.questions];
  const questionsPerGame = quiz.gameSettings?.questionsPerGame || 15;
  
  // При создании комнаты это всегда мультиплеер (комнаты создаются только для мультиплеера)
  const isMultiplayer = true;
  
  console.log(`🔵 Создание комнаты ${roomCode}: quizId=${quizId}, всего вопросов=${quiz.questions.length}, будет выбрано=${questionsPerGame}, isMultiplayer=${isMultiplayer}`);
  
  // ВСЕГДА выбираем 15 вопросов для мультиплеера (комнаты создаются только для мультиплеера)
  if (quiz.questions.length > questionsPerGame) {
    // Используем алгоритм Fisher-Yates для правильного перемешивания
    const shuffled = [...quiz.questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Берем нужное количество вопросов (15 для мультиплеера)
    questionsForRoom = shuffled.slice(0, questionsPerGame);
    
    console.log(`✅ Для мультиплеера выбрано ${questionsPerGame} случайных вопросов из ${quiz.questions.length} для комнаты ${roomCode}`);
    
    // Перемешиваем варианты ответов для каждого выбранного вопроса
    questionsForRoom = questionsForRoom.map((q, index) => {
      // Создаем глубокую копию вопроса
      const questionCopy = {
        ...q,
        options: [...q.options],
        id: index + 1
      };
      
      // Перемешиваем варианты ответов
      if (questionCopy.options.length > 0 && questionCopy.correct >= 0) {
        // Сохраняем правильный ответ
        const correctAnswer = questionCopy.options[questionCopy.correct];
        
        // Перемешиваем все варианты
        const shuffledOptions = questionCopy.options.sort(() => Math.random() - 0.5);
        
        // Находим новый индекс правильного ответа
        const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);
        
        // Обновляем вопрос
        questionCopy.options = shuffledOptions;
        questionCopy.correct = newCorrectIndex;
      }
      
      // Убеждаемся, что звездочки удалены из всех вариантов ответов
      questionCopy.options = questionCopy.options.map(option => {
        let cleanOption = option.toString();
        cleanOption = cleanOption.replace(/[★*]$/, '');
        cleanOption = cleanOption.replace(/^\*\s*/, '');
        cleanOption = cleanOption.trim();
        return cleanOption;
      });
      
      return questionCopy;
    });
    
    console.log(`✅ Для мультиплеера выбрано ${questionsPerGame} случайных вопросов из ${quiz.questions.length} для комнаты ${roomCode}`);
  } else {
    console.log(`⚠️ ВНИМАНИЕ: Условие не выполнено! quiz.questions.length=${quiz.questions.length}, questionsPerGame=${questionsPerGame}`);
    console.log(`⚠️ Используются ВСЕ вопросы (${questionsForRoom.length}) вместо ${questionsPerGame}`);
  }
  
  const room = {
    code: roomCode,
    host: null,
    players: [],
    gameState: 'lobby', // lobby, playing, question, results, finished
    currentQuestion: 0,
    questions: questionsForRoom,
    quizId: quizId,
    quizName: quiz.name,
    readyPlayers: new Set(), // Игроки, готовые к следующему вопросу
    startTime: null,
    answers: new Map(),
    password: quiz.passwordRequired ? quiz.password : null // Сохраняем пароль для проверки при подключении игроков
  };
  rooms.set(roomCode, room);
  
  console.log(`📋 Комната ${roomCode} создана: ${questionsForRoom.length} вопросов (из ${quiz.questions.length} доступных)`);
  console.log(`📋 Первые 3 вопроса комнаты:`, questionsForRoom.slice(0, 3).map(q => q.id || 'no-id'));
  
  res.json({ roomCode });
});

// Подключение через Socket.io
io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // Хост подключается к комнате
  socket.on('host-join', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    room.host = socket.id;
    socket.join(roomCode);
    socket.emit('host-connected', { roomCode, players: room.players });
    console.log(`Хост подключен к комнате ${roomCode}`);
  });

  // Игрок подключается к комнате
  socket.on('player-join', ({ roomCode, playerName, password }) => {
    // Нормализуем входные данные
    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const normalizedPlayerName = playerName ? playerName.trim() : '';
    
    console.log(`🔵 Игрок пытается подключиться: комната=${normalizedRoomCode}, имя=${normalizedPlayerName}`);
    
    if (!normalizedRoomCode || !normalizedPlayerName) {
      socket.emit('error', { message: 'Неверные данные: заполните все поля' });
      return;
    }
    
    const room = rooms.get(normalizedRoomCode);
    if (!room) {
      console.log(`❌ Комната ${normalizedRoomCode} не найдена`);
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Пароль проверяется только при создании комнаты хостом
    // Игроки подключаются без проверки пароля
    console.log(`✅ Игрок ${normalizedPlayerName} подключается к комнате ${normalizedRoomCode} (пароль не требуется)`);

    // Если игра уже началась, запрещаем подключение
    if (room.gameState !== 'lobby') {
      socket.emit('error', { message: 'Игра уже началась. Нельзя подключиться к активной игре.' });
      return;
    }

    // Проверка на переполнение
    if (room.players.length >= 14) {
      socket.emit('error', { message: 'Комната переполнена (максимум 14 игроков)' });
      return;
    }

    // Создаем нового игрока
    const player = {
      id: socket.id,
      name: normalizedPlayerName,
      score: 0,
      roomCode: normalizedRoomCode
    };
    room.players.push(player);
    players.set(socket.id, player);
    socket.join(normalizedRoomCode);
    
    socket.emit('player-connected', { playerId: socket.id, roomCode: normalizedRoomCode });
    io.to(normalizedRoomCode).emit('player-list-updated', { players: room.players });
    console.log(`Игрок ${normalizedPlayerName} подключен к комнате ${normalizedRoomCode}`);
  });

  // Хост запускает игру
  socket.on('start-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;
    
    room.gameState = 'playing';
    room.currentQuestion = 0;
    room.answers.clear();
    room.players.forEach(p => p.score = 0);
    
    io.to(roomCode).emit('game-started');
    setTimeout(() => {
      showQuestion(roomCode);
    }, 2000);
  });

  // Хранилище таймеров для комнат
  const questionTimers = new Map();

  // Показать вопрос
  function showQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.currentQuestion >= room.questions.length) {
      endGame(roomCode);
      return;
    }

    room.gameState = 'question';
    room.answers.clear();
    room.readyPlayers.clear(); // Сбрасываем готовность при новом вопросе
    const question = room.questions[room.currentQuestion];
    room.startTime = Date.now();

    // Очищаем предыдущий таймер
    if (questionTimers.has(roomCode)) {
      clearTimeout(questionTimers.get(roomCode));
    }

    // Отправляем статус ответов (все еще не ответили)
    updateAnswerStatus(roomCode);

    const questionData = {
      question: question.question,
      options: question.options,
      questionNumber: room.currentQuestion + 1,
      totalQuestions: room.questions.length,
      time: question.time
    };
    
    console.log(`📤 Отправка вопроса ${questionData.questionNumber} из ${questionData.totalQuestions} в комнату ${roomCode}`);
    
    io.to(roomCode).emit('question', questionData);

    // Таймер для автоматического перехода к результатам
    const timer = setTimeout(() => {
      if (room.gameState === 'question') {
        showResults(roomCode);
      }
      questionTimers.delete(roomCode);
    }, question.time * 1000);
    
    questionTimers.set(roomCode, timer);
  }

  // Обновление статуса ответов
  function updateAnswerStatus(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const answeredPlayers = Array.from(room.answers.keys());
    const playerStatuses = room.players.map(player => ({
      id: player.id,
      name: player.name,
      answered: answeredPlayers.includes(player.id)
    }));

    // Отправляем статус хосту
    io.to(roomCode).emit('answer-status', {
      players: playerStatuses,
      answeredCount: answeredPlayers.length,
      totalPlayers: room.players.length,
      allAnswered: answeredPlayers.length === room.players.length && room.players.length > 0
    });
  }

  // Игрок отправляет ответ
  socket.on('answer', ({ roomCode, answerIndex }) => {
    const room = rooms.get(roomCode);
    const player = players.get(socket.id);
    
    if (!room || !player || room.gameState !== 'question') return;
    if (room.answers.has(socket.id)) return; // Уже ответил

    const question = room.questions[room.currentQuestion];
    const isCorrect = answerIndex === question.correct;
    const answerTime = Date.now() - room.startTime;
    
    room.answers.set(socket.id, {
      playerId: socket.id,
      playerName: player.name,
      answerIndex,
      isCorrect,
      answerTime
    });

    // Начисление очков
    let points = 0;
    if (isCorrect) {
      const timeBonus = Math.max(0, question.time * 1000 - answerTime);
      points = 100 + Math.floor(timeBonus / 100);
      player.score += points;
    }

    socket.emit('answer-received', { 
      isCorrect,
      correctAnswer: question.options[question.correct],
      points: points,
      newScore: player.score
    });
    
    // Обновляем статус ответов
    updateAnswerStatus(roomCode);
    
    // Проверяем, все ли ответили
    if (room.answers.size === room.players.length && room.players.length > 0) {
      // Останавливаем таймер
      if (questionTimers.has(roomCode)) {
        clearTimeout(questionTimers.get(roomCode));
        questionTimers.delete(roomCode);
      }
      // Переходим к результатам через небольшую задержку
      setTimeout(() => {
        if (room.gameState === 'question') {
          showResults(roomCode);
        }
      }, 500);
    }
  });

  // Показать результаты вопроса
  function showResults(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Останавливаем таймер если еще работает
    if (questionTimers.has(roomCode)) {
      clearTimeout(questionTimers.get(roomCode));
      questionTimers.delete(roomCode);
    }

    room.gameState = 'results';
    const question = room.questions[room.currentQuestion];
    const results = Array.from(room.answers.values());

    io.to(roomCode).emit('results', {
      correctAnswer: question.correct,
      correctAnswerText: question.options[question.correct],
      results: results,
      players: room.players.sort((a, b) => b.score - a.score)
    });

    // Не переходим автоматически - ждем подтверждения готовности от всех игроков
    // Обновляем статус готовности (все еще не готовы)
    updateReadyStatus(roomCode);
  }

  // Обновление статуса готовности игроков
  function updateReadyStatus(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const readyPlayerIds = Array.from(room.readyPlayers);
    const playerStatuses = room.players.map(player => ({
      id: player.id,
      name: player.name,
      ready: readyPlayerIds.includes(player.id)
    }));

    const allReady = readyPlayerIds.length === room.players.length && room.players.length > 0;

    // Отправляем статус хосту
    io.to(roomCode).emit('ready-status', {
      players: playerStatuses,
      readyCount: readyPlayerIds.length,
      totalPlayers: room.players.length,
      allReady: allReady
    });
  }

  // Игрок подтверждает готовность к следующему вопросу
  socket.on('player-ready', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = players.get(socket.id);
    if (!player || player.roomCode !== roomCode) return;

    if (room.gameState === 'results') {
      room.readyPlayers.add(socket.id);
      console.log(`Игрок ${player.name} готов к следующему вопросу`);
      updateReadyStatus(roomCode);
    }
  });

  // Хост переходит к следующему вопросу вручную
  socket.on('next-question', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;
    if (room.gameState === 'results') {
      // Проверяем, что все игроки готовы
      const allReady = room.readyPlayers.size === room.players.length && room.players.length > 0;
      if (!allReady) {
        console.log('Не все игроки готовы к следующему вопросу');
        socket.emit('error', { message: 'Не все игроки готовы к следующему вопросу' });
        return;
      }

      room.currentQuestion++;
      if (room.currentQuestion < room.questions.length) {
        showQuestion(roomCode);
      } else {
        endGame(roomCode);
      }
    }
  });

  // Завершение игры
  function endGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.gameState = 'finished';
    const finalResults = room.players.sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('game-finished', {
      results: finalResults
    });
  }

  // Отключение
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const room = rooms.get(player.roomCode);
      if (room) {
        // Удаляем игрока из списка
        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(player.roomCode).emit('player-list-updated', { players: room.players });
        console.log(`Игрок ${player.name} отключился и удален из комнаты ${player.roomCode}`);
      }
      players.delete(socket.id);
    }
    console.log('Отключение:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

// Запуск сервера только если файл запущен напрямую (не импортирован)
if (require.main === module) {
  server.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT}/index.html для выбора квиза`);
    console.log(`Или http://localhost:${PORT}/player.html для игроков`);
    
    // Инициализируем рейтинг из Google Sheets
    await initializeLeaderboard();
    
    // Автоматическое обновление рейтинга каждые 5 минут
    setInterval(async () => {
      console.log('🔄 Автоматическое обновление рейтинга...');
      await initializeLeaderboard();
    }, 5 * 60 * 1000); // 5 минут
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Попробуйте другой порт:`);
    console.error(`PORT=3001 npm start`);
    process.exit(1);
  } else {
    console.error('Ошибка запуска сервера:', err);
    process.exit(1);
  }
});
}

// Экспорт для Vercel и других платформ деплоя
// Vercel требует экспорт app для serverless функций
module.exports = app;

