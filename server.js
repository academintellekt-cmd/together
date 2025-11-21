const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

// Функция загрузки рейтинга из Google Sheets
async function loadLeaderboardFromGoogleSheets() {
  try {
    const WEB_APP_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbztFCa9WW9uHa89EqxlsHczbNvSrTi8mmUGAGcYB4xG-3tAMeGwHOj_0G3HQf93sMHwwg/exec';
    
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
                      if (data.leaderboard.length > 0) {
                        console.log('📋 Первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
                      }
                      resolve(data.leaderboard);
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
              if (data.leaderboard.length > 0) {
                console.log('📋 Первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
              }
              resolve(data.leaderboard);
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
    const WEB_APP_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbztFCa9WW9uHa89EqxlsHczbNvSrTi8mmUGAGcYB4xG-3tAMeGwHOj_0G3HQf93sMHwwg/exec';
    
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
      quizId: result.quizId === 'friends-quiz' ? 'Чемпионат ГНУ' : result.quizId
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

    for (const line of lines) {
      if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('Вопрос')) {
        continue;
      }

      if (line.endsWith('?')) {
        if (currentQuestion && currentQuestion.options.length > 0) {
          questions.push(currentQuestion);
        }
        
        currentQuestion = {
          id: questionId++,
          question: line,
          options: [],
          correct: -1,
          time: 20
        };
      }
      else if (line.startsWith('+') || line.startsWith('*')) {
        if (currentQuestion) {
          let answer = line.substring(1).trim().replace(/[★*]$/, '').trim();
          currentQuestion.options.push(answer);
          if (currentQuestion.correct === -1) {
            currentQuestion.correct = currentQuestion.options.length - 1;
          }
        }
      }
      else if (line.startsWith('-')) {
        if (currentQuestion) {
          const answer = line.substring(1).trim().replace(/[★*]$/, '').trim();
          currentQuestion.options.push(answer);
        }
      }
      else if (line.toLowerCase().includes('time:') || line.toLowerCase().includes('время:')) {
        if (currentQuestion) {
          const timeMatch = line.match(/\d+/);
          if (timeMatch) {
            currentQuestion.time = parseInt(timeMatch[0]);
          }
        }
      }
      else if (currentQuestion && currentQuestion.options.length < 4) {
        let answer = line.trim();
        const isCorrect = answer.endsWith('★') || answer.endsWith('*');
        answer = answer.replace(/[★*]$/, '').trim();
        
        currentQuestion.options.push(answer);
        
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
    
    // Перемешиваем варианты ответов
    questions.forEach(question => {
      if (question.options.length > 0 && question.correct >= 0) {
        const correctAnswer = question.options[question.correct];
        const shuffledOptions = question.options.sort(() => Math.random() - 0.5);
        const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);
        question.options = shuffledOptions;
        question.correct = newCorrectIndex;
      }
    });

    // Перемешиваем вопросы и переназначаем ID
    const shuffled = questions.sort(() => Math.random() - 0.5);
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

// Структура квизов
const quizzes = {
  'general-knowledge': {
    id: 'general-knowledge',
    name: 'Общие знания',
    description: 'Проверьте свои знания в разных областях',
    icon: '🧠',
    questions: [
      {
        id: 1,
        question: "Какая планета самая большая в Солнечной системе?",
        options: ["Земля", "Юпитер", "Сатурн", "Марс"],
        correct: 1,
        time: 15
      },
      {
        id: 2,
        question: "Сколько континентов на Земле?",
        options: ["5", "6", "7", "8"],
        correct: 2,
        time: 10
      },
      {
        id: 3,
        question: "Какая столица Франции?",
        options: ["Лондон", "Берлин", "Париж", "Мадрид"],
        correct: 2,
        time: 10
      },
      {
        id: 4,
        question: "Кто написал 'Войну и мир'?",
        options: ["Достоевский", "Толстой", "Чехов", "Пушкин"],
        correct: 1,
        time: 15
      },
      {
        id: 5,
        question: "Сколько дней в високосном году?",
        options: ["364", "365", "366", "367"],
        correct: 2,
        time: 10
      },
      {
        id: 6,
        question: "Какое животное самое быстрое на суше?",
        options: ["Лев", "Гепард", "Тигр", "Леопард"],
        correct: 1,
        time: 15
      },
      {
        id: 7,
        question: "В каком году человек впервые полетел в космос?",
        options: ["1957", "1961", "1969", "1971"],
        correct: 1,
        time: 20
      },
      {
        id: 8,
        question: "Сколько океанов на Земле?",
        options: ["3", "4", "5", "6"],
        correct: 2,
        time: 10
      },
      {
        id: 9,
        question: "Какая самая длинная река в мире?",
        options: ["Амазонка", "Нил", "Янцзы", "Миссисипи"],
        correct: 0,
        time: 20
      },
      {
        id: 10,
        question: "Кто изобрел телефон?",
        options: ["Эдисон", "Белл", "Тесла", "Маркони"],
        correct: 1,
        time: 15
      }
    ]
  },
  'friends-quiz': {
    id: 'friends-quiz',
    name: 'Чемпионат ГНУ по целям своих братишек',
    description: 'Девушки тоже братишки',
    icon: '👥',
    soloMode: true, // Флаг для соло-режима
    questions: [] // Вопросы загружаются из файла questions.txt
  }
  // Здесь можно добавить новые квизы в будущем
};

// Загрузка вопросов для квиза ГНУ из файла questions.txt (150 вопросов)
// Явно указываем путь к файлу с вопросами
const gnuQuestionsFilePath = path.join(__dirname, 'questions.txt');
console.log(`Загрузка вопросов для квиза ГНУ из файла: ${gnuQuestionsFilePath}`);
quizzes['friends-quiz'].questions = loadQuestionsFromFile(gnuQuestionsFilePath);
console.log(`Загружено ${quizzes['friends-quiz'].questions.length} вопросов для квиза ГНУ`);

// Получение списка квизов
app.get('/api/quizzes', (req, res) => {
  const quizzesList = Object.values(quizzes).map(quiz => {
    const avgTime = quiz.questions.length > 0
      ? Math.round(quiz.questions.reduce((sum, q) => sum + q.time, 0) / quiz.questions.length)
      : 0;
    
    const result = {
      id: quiz.id,
      name: quiz.name,
      description: quiz.description,
      icon: quiz.icon,
      questionCount: quiz.questions.length,
      avgTime: avgTime,
      comingSoon: false,
      soloMode: quiz.soloMode || false
    };
    
    // Для квизов с soloMode добавляем totalQuestionsInBase
    if (quiz.soloMode) {
      result.totalQuestionsInBase = quiz.questions.length;
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
  
  // Для квиза ГНУ выбираем 15 случайных вопросов из 150
  if (quizId === 'friends-quiz' && quiz.questions.length > 15) {
    // Создаем копию массива и перемешиваем
    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    // Берем первые 15
    questionsToSend = shuffled.slice(0, 15);
    
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
    
    console.log(`Для квиза ГНУ выбрано 15 случайных вопросов из ${quiz.questions.length}`);
  } else {
    // Для других квизов также удаляем звездочки из ответов
    questionsToSend = questionsToSend.map(q => ({
      ...q,
      options: q.options.map(option => {
        return option.replace(/[★*]$/, '').replace(/^\*\s*/, '').trim();
      })
    }));
  }
  
  res.json({
    id: quiz.id,
    name: quiz.name,
    description: quiz.description,
    questions: questionsToSend,
    soloMode: quiz.soloMode || false,
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
  writeToGoogleSheets(result).catch(err => {
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
  
  if (quizId === 'friends-quiz') {
    // Загружаем вопросы из questions.txt (150 вопросов)
    const questionsFilePath = path.join(__dirname, 'questions.txt');
    const loadedQuestions = loadQuestionsFromFile(questionsFilePath);
    quizzes['friends-quiz'].questions = loadedQuestions;
    
    res.json({ 
      success: true, 
      message: `Вопросы перезагружены. Загружено ${loadedQuestions.length} вопросов.`,
      questionCount: loadedQuestions.length
    });
  } else {
    res.status(400).json({ error: 'Неверный ID квиза' });
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
  const { quizId } = req.body;
  
  // Проверяем, что квиз существует
  if (!quizId || !quizzes[quizId]) {
    return res.status(400).json({ error: 'Квиз не найден' });
  }
  
  const quiz = quizzes[quizId];
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    host: null,
    players: [],
    gameState: 'lobby', // lobby, playing, question, results, finished
    currentQuestion: 0,
    questions: [...quiz.questions],
    quizId: quizId,
    quizName: quiz.name,
    readyPlayers: new Set(), // Игроки, готовые к следующему вопросу
    startTime: null,
    answers: new Map()
  };
  rooms.set(roomCode, room);
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
  socket.on('player-join', ({ roomCode, playerName }) => {
    // Нормализуем входные данные
    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const normalizedPlayerName = playerName ? playerName.trim() : '';
    
    if (!normalizedRoomCode || !normalizedPlayerName) {
      socket.emit('error', { message: 'Неверные данные: заполните все поля' });
      return;
    }
    
    const room = rooms.get(normalizedRoomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

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

    io.to(roomCode).emit('question', {
      question: question.question,
      options: question.options,
      questionNumber: room.currentQuestion + 1,
      totalQuestions: room.questions.length,
      time: question.time
    });

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

