const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { loadAllQuizzes } = require('./server/utils/quiz-loader');

// DMX интеграция - новая система сценариев
let dmxScenarioEngine = null;
try {
  const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
  // Инициализация будет после создания io, rooms, players
} catch (error) {
  console.warn('⚠️ DMX модуль недоступен:', error.message);
}

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

// DMX API routes - регистрируем ПЕРЕД статическим middleware
try {
  const dmxApiRouter = require('./server/routes/dmx-api');
  app.use('/api/dmx', dmxApiRouter);
  console.log('✅ DMX API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ DMX API routes недоступны:', error.message);
}

// Quiz-Questions API routes
try {
  const { router: quizQuestionsApiRouter, intellectualRooms: quizQuestionsRooms } = require('./server/routes/quiz-questions-api');
  app.use('/api/quiz-questions', quizQuestionsApiRouter);
  // Экспортируем хранилище комнат для использования в WebSocket обработчиках
  global.intellectualRooms = quizQuestionsRooms;
  console.log('✅ Quiz-Questions API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ Quiz-Questions API routes недоступны:', error.message);
}

// Статический middleware - после API роутов
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')));
app.use('/joystick-test', express.static(path.join(__dirname, 'tests/joystick-test')));
app.use('/data/media', express.static(path.join(__dirname, 'data/media')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// Хранилище комнат и игроков
const rooms = new Map();
const players = new Map();
// Хранилище игроков интеллектуальных комнат (для отслеживания подключений)
const intellectualPlayers = new Map();

// Инициализация DMX системы сценариев
try {
  const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
  dmxScenarioEngine = getDMXScenarioEngine();
  console.log('✅ DMX система сценариев инициализирована');
} catch (error) {
  console.warn('⚠️ DMX система сценариев недоступна:', error.message);
  dmxScenarioEngine = null;
}

// Хранилище рейтинга для соло-режима
let leaderboard = [];

// Seed-based перемешивание для стабильности в сессии
function seededShuffle(array, seed) {
  const shuffled = [...array];
  let rng = seed;
  
  // Простой LCG (Linear Congruential Generator)
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (rng * 9301 + 49297) % 233280;
    const j = Math.floor((rng / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

// Перемешивание вопросов с seed
function shuffleQuestions(questions, seed = Date.now()) {
  return seededShuffle(questions, seed);
}

// Перемешивание вариантов ответов с seed
function shuffleOptions(options, correctIndex, seed = Date.now()) {
  const shuffled = seededShuffle([...options], seed);
  const correctAnswer = options[correctIndex];
  const newCorrectIndex = shuffled.indexOf(correctAnswer);
  return { options: shuffled, correctIndex: newCorrectIndex };
}

// Константы для масштабируемости
const MAX_ROOMS = 50; // Максимум активных комнат одновременно
const MAX_TOTAL_PLAYERS = 500; // Максимум игроков на сервере
const MAX_LEADERBOARD_ENTRIES = 1000; // Максимум записей рейтинга в памяти
const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 минут неактивности для очистки комнаты
const LEADERBOARD_QUEUE_BATCH_SIZE = 10; // Размер батча для записи в Google Sheets
const LEADERBOARD_QUEUE_INTERVAL = 30 * 1000; // Интервал записи батча (30 секунд)

// Очередь для батчинга записей в Google Sheets
const leaderboardQueue = [];

// Функция для нормализации quizId (конвертация названия в ID)
// ВАЖНО: quizzes должен быть загружен до использования этой функции
function normalizeQuizId(quizIdOrName) {
  if (!quizIdOrName) return null;
  
  const knownIds = ['gnu', 'friends-quiz', 'akadem', 'gazprom'];
  if (knownIds.includes(quizIdOrName)) {
    return quizIdOrName;
  }
  
  const lower = quizIdOrName.toLowerCase().trim();
  
  // Газпром
  if (lower.includes('газпром') || 
      (lower.includes('тестирование') && lower.includes('сотрудников'))) {
    return 'gazprom';
  }
  
  // Академгородок
  if (lower.includes('академ') || lower.includes('академгородок') ||
      (lower.includes('история') && lower.includes('легенды'))) {
    return 'akadem';
  }
  
  // ГНУ
  if (lower.includes('гну') || lower.includes('чемпионат') || 
      lower.includes('братишек') || lower.includes('цели')) {
    return 'gnu';
  }
  
  // Проверка по названиям квизов
  if (typeof quizzes !== 'undefined' && quizzes) {
    for (const [id, quiz] of Object.entries(quizzes)) {
      const quizName = (quiz.name || '').toLowerCase().trim();
      const quizTitle = (quiz.display?.title || '').toLowerCase().trim();
      
      if (quizName === lower || quizTitle === lower ||
          lower.includes(quizName) || quizName.includes(lower) ||
          lower.includes(quizTitle) || quizTitle.includes(lower)) {
        return id;
      }
    }
  }
  
  return quizIdOrName;
}

// Инициализация рейтинга при запуске сервера
async function initializeLeaderboard() {
  console.log('🔄 Загрузка рейтинга из Google Sheets...');
  const savedLeaderboard = await loadLeaderboardFromGoogleSheets();
  
  // Полностью заменяем данные в памяти данными из Google Sheets
  leaderboard.length = 0;
  
  if (savedLeaderboard.length > 0) {
    // Нормализуем quizId для всех записей
    savedLeaderboard.forEach(entry => {
      const originalQuizId = entry.quizId;
      const normalizedQuizId = normalizeQuizId(entry.quizId) || entry.quizId;
      
      // Логируем записи "роман" при загрузке
      if (entry.playerName?.toLowerCase().includes('роман')) {
        console.log(`🔍 Загрузка "роман" из Google Sheets: оригинальный quizId="${originalQuizId}", нормализованный="${normalizedQuizId}", очки=${entry.score}, дата=${entry.date}`);
      }
      
      leaderboard.push({ ...entry, quizId: normalizedQuizId });
    });
    
    // Сортируем по очкам (от большего к меньшему)
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    });
    
    // Проверяем, есть ли "роман" в загруженных данных
    const romanEntries = leaderboard.filter(e => e.playerName?.toLowerCase().includes('роман'));
    if (romanEntries.length > 0) {
      console.log(`📊 Найдено ${romanEntries.length} записей "роман" в загруженном рейтинге:`, romanEntries.map(e => ({ quizId: e.quizId, score: e.score, date: e.date })));
    } else {
      console.log(`⚠️ Записи "роман" НЕ найдены в загруженном рейтинге`);
    }
    
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
                      
                      // Логируем все уникальные quizId ДО нормализации
                      const originalQuizIds = [...new Set(data.leaderboard.map(e => e.quizId))];
                      console.log('📊 Уникальные quizId ДО нормализации (из Google Sheets):', originalQuizIds);
                      console.log('📊 Всего записей из Google Sheets:', data.leaderboard.length);
                      
                      // Показываем примеры записей с разными quizId
                      originalQuizIds.forEach(qid => {
                        const examples = data.leaderboard.filter(e => e.quizId === qid);
                        console.log(`📋 Записей с quizId "${qid}": ${examples.length}`);
                        if (examples.length > 0) {
                          console.log(`📋 Примеры записей с quizId "${qid}":`, examples.slice(0, 2).map(e => ({ player: e.playerName, score: e.score, quizId: e.quizId })));
                        }
                      });
                      
                      // Проверяем, есть ли записи, которые могут быть для академгородка
                      const possibleAkadem = data.leaderboard.filter(e => {
                        const lower = (e.quizId || '').toLowerCase();
                        return lower.includes('академ') || lower.includes('история') || lower.includes('легенды');
                      });
                      if (possibleAkadem.length > 0) {
                        console.log(`🔍 Найдено ${possibleAkadem.length} записей, которые могут быть для академгородка:`, possibleAkadem.map(e => ({ player: e.playerName, quizId: e.quizId })));
                      }
                      
                      // Нормализуем quizId для каждой записи
                      const processedLeaderboard = data.leaderboard.map(entry => {
                        const originalQuizId = entry.quizId;
                        const normalizedQuizId = normalizeQuizId(originalQuizId) || originalQuizId;
                        
                        // Логируем, если quizId изменился
                        if (originalQuizId !== normalizedQuizId) {
                          console.log(`🔄 Нормализация quizId: "${originalQuizId}" -> "${normalizedQuizId}"`);
                        }
                        
                        return {
                          ...entry,
                          quizId: normalizedQuizId
                        };
                      });
                      
                      // Логируем все уникальные quizId после нормализации
                      const normalizedQuizIds = [...new Set(processedLeaderboard.map(e => e.quizId))];
                      console.log('📊 Уникальные quizId ПОСЛЕ нормализации:', normalizedQuizIds);
                      
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
              
              // Логируем все уникальные quizId ДО нормализации
              const originalQuizIds = [...new Set(data.leaderboard.map(e => e.quizId))];
              console.log('📊 Уникальные quizId ДО нормализации (из Google Sheets):', originalQuizIds);
              console.log('📊 Всего записей из Google Sheets:', data.leaderboard.length);
              
              // Показываем примеры записей с разными quizId
              originalQuizIds.forEach(qid => {
                const examples = data.leaderboard.filter(e => e.quizId === qid);
                console.log(`📋 Записей с quizId "${qid}": ${examples.length}`);
                if (examples.length > 0) {
                  console.log(`📋 Примеры записей с quizId "${qid}":`, examples.slice(0, 2).map(e => ({ player: e.playerName, score: e.score, quizId: e.quizId })));
                }
              });
              
              // Проверяем, есть ли записи, которые могут быть для академгородка
              const possibleAkadem = data.leaderboard.filter(e => {
                const lower = (e.quizId || '').toLowerCase();
                return lower.includes('академ') || lower.includes('история') || lower.includes('легенды');
              });
              if (possibleAkadem.length > 0) {
                console.log(`🔍 Найдено ${possibleAkadem.length} записей, которые могут быть для академгородка:`, possibleAkadem.map(e => ({ player: e.playerName, quizId: e.quizId })));
              }
              
              // Нормализуем quizId для каждой записи
              const processedLeaderboard = data.leaderboard.map(entry => {
                const originalQuizId = entry.quizId;
                const normalizedQuizId = normalizeQuizId(originalQuizId) || originalQuizId;
                
                // Логируем, если quizId изменился
                if (originalQuizId !== normalizedQuizId) {
                  console.log(`🔄 Нормализация quizId: "${originalQuizId}" -> "${normalizedQuizId}"`);
                }
                
                return {
                  ...entry,
                  quizId: normalizedQuizId
                };
              });
              
              // Логируем все уникальные quizId после нормализации
              const normalizedQuizIds = [...new Set(processedLeaderboard.map(e => e.quizId))];
              console.log('📊 Уникальные quizId ПОСЛЕ нормализации:', normalizedQuizIds);
              
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

// Функция для обработки очереди рейтинга (батчинг)
async function processLeaderboardQueue() {
  if (leaderboardQueue.length === 0) return;
  
  const batch = leaderboardQueue.splice(0, LEADERBOARD_QUEUE_BATCH_SIZE);
  console.log(`📤 Запись батча из ${batch.length} записей в Google Sheets...`);
  
  // Записываем каждую запись из батча
  const promises = batch.map(result => writeToGoogleSheets(result));
  const results = await Promise.allSettled(promises);
  
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  console.log(`✅ Записано ${successCount}/${batch.length} записей в Google Sheets`);
  
  // Если все успешно, обновляем рейтинг из Google Sheets
  if (successCount === batch.length && batch.length > 0) {
    console.log('🔄 Обновляем рейтинг из Google Sheets...');
    await initializeLeaderboard();
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

    // Сохраняем нормализованный quizId, но также сохраняем название для отображения
    // ВАЖНО: quizId должен быть нормализованным ID (akadem, gnu, gazprom), а не названием
    const normalizedQuizId = result.quizId; // Уже нормализован при сохранении
    const quizName = quizzes[normalizedQuizId]?.name || result.quizId;
    
    const data = {
      date: result.date,
      playerName: result.playerName,
      score: result.score,
      correctAnswers: result.correctAnswers,
      totalQuestions: result.totalQuestions,
      timeSpent: result.timeSpent, // Передаем в секундах, Apps Script сам отформатирует
      percentage: percentage,
      quizId: normalizedQuizId, // Сохраняем нормализованный ID, а не название
      quizName: quizName // Название для отображения (если нужно)
    };
    
    // Логируем сохранение в Google Sheets
    if (result.playerName?.toLowerCase().includes('роман')) {
      console.log(`📝 Сохранение "роман" в Google Sheets: quizId="${normalizedQuizId}", quizName="${quizName}", очки=${result.score}`);
    }

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
    
    // Генерируем seed для сессии
    const sessionSeed = Date.now() + Math.floor(Math.random() * 1000);
    
    // Перемешиваем варианты ответов для каждого вопроса с seed
    questions.forEach((question, index) => {
      if (question.options && question.options.length > 0 && question.correct >= 0) {
        const { options, correctIndex } = shuffleOptions(
          question.options,
          question.correct,
          sessionSeed + index
        );
        question.options = options;
        question.correct = correctIndex;
      }
    });

    // Перемешиваем вопросы с seed
    const shuffled = shuffleQuestions(questions, sessionSeed);
    
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
    // Генерируем seed для сессии
    const sessionSeed = Date.now() + Math.floor(Math.random() * 1000);
    
    // Перемешиваем вопросы с seed
    const shuffled = shuffleQuestions([...quiz.questions], sessionSeed);
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
      
      // Перемешиваем варианты ответов с seed
      if (questionCopy.options.length > 0 && questionCopy.correct >= 0) {
        const { options, correctIndex } = shuffleOptions(
          questionCopy.options,
          questionCopy.correct,
          sessionSeed + index
        );
        questionCopy.options = options;
        questionCopy.correct = correctIndex;
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
  
  const originalQuizId = quizId;
  const normalizedQuizId = normalizeQuizId(quizId) || quizId;
  
  // Логируем сохранение результата для отладки
  console.log(`💾 Сохранение результата: игрок="${playerName.trim()}", оригинальный quizId="${originalQuizId}", нормализованный quizId="${normalizedQuizId}", очки=${score}`);
  
  const result = {
    id: Date.now().toString(),
    playerName: playerName.trim(),
    quizId: normalizedQuizId,
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
    
    // Ограничиваем до MAX_LEADERBOARD_ENTRIES лучших результатов в памяти
    // Остальные хранятся только в Google Sheets
    if (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
      leaderboard.splice(MAX_LEADERBOARD_ENTRIES);
      console.log(`📊 Рейтинг ограничен до ${MAX_LEADERBOARD_ENTRIES} записей в памяти`);
    }

  // Записываем результат в Google Sheets сразу (асинхронно, не блокируем ответ)
  writeToGoogleSheets(result).then(success => {
    if (!success) {
      // Если запись не удалась, добавляем в очередь для повторной попытки
      leaderboardQueue.push(result);
      console.log('⚠️ Запись в Google Sheets не удалась, добавлено в очередь для повторной попытки');
    }
  }).catch(error => {
    // В случае ошибки добавляем в очередь для повторной попытки
    leaderboardQueue.push(result);
    console.error('❌ Ошибка записи в Google Sheets, добавлено в очередь для повторной попытки:', error.message);
  });
  
  // Если очередь достигла размера батча, обрабатываем её (на случай накопления ошибок)
  if (leaderboardQueue.length >= LEADERBOARD_QUEUE_BATCH_SIZE) {
    processLeaderboardQueue();
  }
  
  res.json({ success: true, result: result });
});

// Сохранение конфигурации джойстика
app.post('/api/joystick-config', (req, res) => {
  try {
    const config = req.body;
    const configPath = path.join(__dirname, 'data', 'joystick-config.json');
    
    // Создаем директорию, если её нет
    const dataDir = path.dirname(configPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Сохраняем конфигурацию
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('✅ Конфигурация джойстика сохранена в файл');
    
    res.json({ success: true, message: 'Конфигурация сохранена' });
  } catch (error) {
    console.error('❌ Ошибка при сохранении конфигурации джойстика:', error);
    res.status(500).json({ error: 'Ошибка при сохранении конфигурации', details: error.message });
  }
});

// Загрузка конфигурации джойстика
app.get('/api/joystick-config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'data', 'joystick-config.json');
    
    if (!fs.existsSync(configPath)) {
      // Если файла нет, возвращаем пустую конфигурацию
      return res.json({ buttons: {}, axes: {} });
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    console.log('✅ Конфигурация джойстика загружена из файла');
    res.json(config);
  } catch (error) {
    console.error('❌ Ошибка при загрузке конфигурации джойстика:', error);
    // В случае ошибки возвращаем пустую конфигурацию
    res.json({ buttons: {}, axes: {} });
  }
});

// Получение рейтинга
app.get('/api/leaderboard', (req, res) => {
  const { quizId } = req.query;
  
  let results = leaderboard;
  
  // Фильтруем по quizId, если указан
  if (quizId) {
    const normalizedQuizId = normalizeQuizId(quizId) || quizId;
    console.log(`📊 Запрос лидерборда: оригинальный quizId="${quizId}", нормализованный="${normalizedQuizId}", всего записей в памяти=${leaderboard.length}`);
    
    results = leaderboard.filter(r => {
      if (!r.quizId) return false;
      
      const rNormalized = normalizeQuizId(r.quizId);
      const matches = rNormalized === normalizedQuizId;
      
      // Логируем первые несколько записей для отладки
      if (leaderboard.indexOf(r) < 5) {
        console.log(`  📋 Запись: игрок="${r.playerName}", quizId="${r.quizId}" -> нормализованный="${rNormalized}", совпадает=${matches}`);
      }
      
      return matches;
    });
    
    console.log(`📊 После фильтрации найдено ${results.length} записей для quizId="${normalizedQuizId}"`);
  }
  
  // Группируем по игрокам и берем лучший результат каждого
  const playerBestScores = {};
  results.forEach(result => {
    if (!result.playerName?.trim()) return;
    
    const key = result.playerName.trim().toLowerCase().replace(/\s+/g, ' ');
    const current = playerBestScores[key];
    
    // Логируем для отладки, если это игрок "роман"
    if (key.includes('роман')) {
      console.log(`  🔍 Найден результат для "роман": очки=${result.score}, quizId="${result.quizId}", timestamp=${result.timestamp}, текущий лучший=${current ? current.score : 'нет'}`);
    }
    
    if (!current || result.score > current.score || 
        (result.score === current.score && result.timestamp > current.timestamp)) {
      playerBestScores[key] = result;
      if (key.includes('роман')) {
        console.log(`  ✅ Обновлен лучший результат для "роман": очки=${result.score}`);
      }
    }
  });
  
  // Сортируем по очкам (от большего к меньшему)
  const sortedResults = Object.values(playerBestScores).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
  });
  
  // Ограничиваем до 50 лучших игроков
  const topResults = sortedResults.slice(0, 50);
  
  // Проверяем, попал ли "роман" в топ-50
  const romanInTop = topResults.find(r => r.playerName?.toLowerCase().includes('роман'));
  if (romanInTop) {
    console.log(`✅ "роман" в топ-50: позиция=${topResults.indexOf(romanInTop) + 1}, очки=${romanInTop.score}`);
  } else {
    console.log(`⚠️ "роман" НЕ попал в топ-50. Всего результатов после фильтрации: ${results.length}, после группировки: ${sortedResults.length}`);
    // Ищем "роман" во всех результатах
    const allRoman = sortedResults.filter(r => r.playerName?.toLowerCase().includes('роман'));
    if (allRoman.length > 0) {
      console.log(`  📋 Найдено результатов "роман" во всех данных: ${allRoman.length}`, allRoman.map(r => ({ score: r.score, quizId: r.quizId })));
    }
  }
  
  res.json(topResults);
});

// Тестовый endpoint для принудительной загрузки рейтинга
app.get('/api/reload-leaderboard', async (req, res) => {
  console.log('🔄 Принудительная перезагрузка рейтинга...');
  
  try {
    // Сохраняем очередь перед перезагрузкой
    const currentQueue = [...leaderboardQueue];
    
    // Если есть записи в очереди, записываем их перед перезагрузкой
    if (currentQueue.length > 0) {
      const batch = [...currentQueue];
      leaderboardQueue.splice(0, currentQueue.length);
      const promises = batch.map(result => writeToGoogleSheets(result));
      await Promise.allSettled(promises);
    }
    
    // Загружаем данные из Google Sheets (это источник истины)
    const savedLeaderboard = await loadLeaderboardFromGoogleSheets();
    
    // Полностью заменяем данные в памяти данными из Google Sheets
    leaderboard.length = 0;
    
    if (savedLeaderboard.length > 0) {
      // Нормализуем quizId для всех записей
      savedLeaderboard.forEach(entry => {
        const normalizedQuizId = normalizeQuizId(entry.quizId) || entry.quizId;
        leaderboard.push({ ...entry, quizId: normalizedQuizId });
      });
      
      // Сортируем по очкам (от большего к меньшему)
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp;
      });
      
      // Ограничиваем до MAX_LEADERBOARD_ENTRIES лучших результатов в памяти
      if (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
        leaderboard.splice(MAX_LEADERBOARD_ENTRIES);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Рейтинг перезагружен: ${leaderboard.length} записей`,
      leaderboard: leaderboard 
    });
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

// DMX API routes уже зарегистрированы выше (перед статическим middleware)

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
  
  // Проверка лимитов перед созданием комнаты
  if (rooms.size >= MAX_ROOMS) {
    console.warn(`⚠️ Достигнут лимит комнат: ${rooms.size}/${MAX_ROOMS}`);
    return res.status(503).json({ error: 'Сервер перегружен. Попробуйте позже.' });
  }
  
  if (players.size >= MAX_TOTAL_PLAYERS) {
    console.warn(`⚠️ Достигнут лимит игроков: ${players.size}/${MAX_TOTAL_PLAYERS}`);
    return res.status(503).json({ error: 'Сервер перегружен. Попробуйте позже.' });
  }
  
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
    // Генерируем seed для сессии на основе времени создания комнаты
    const sessionSeed = Date.now() + Math.floor(Math.random() * 1000);
    
    // Используем seed-based перемешивание для стабильности
    const shuffled = shuffleQuestions([...quiz.questions], sessionSeed);
    
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
      
      // Перемешиваем варианты ответов с seed
      if (questionCopy.options.length > 0 && questionCopy.correct >= 0) {
        const { options, correctIndex } = shuffleOptions(
          questionCopy.options,
          questionCopy.correct,
          sessionSeed + index
        );
        
        // Обновляем вопрос
        questionCopy.options = options;
        questionCopy.correct = correctIndex;
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
    password: quiz.passwordRequired ? quiz.password : null, // Сохраняем пароль для проверки при подключении игроков
    createdAt: Date.now(), // Время создания комнаты
    lastActivity: Date.now() // Время последней активности
  };
  rooms.set(roomCode, room);
  
  console.log(`📋 Комната ${roomCode} создана: ${questionsForRoom.length} вопросов (из ${quiz.questions.length} доступных)`);
  console.log(`📋 Первые 3 вопроса комнаты:`, questionsForRoom.slice(0, 3).map(q => q.id || 'no-id'));
  
  res.json({ roomCode });
});

// Инициализация DMX системы сценариев (после создания io)
try {
  const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
  dmxScenarioEngine = getDMXScenarioEngine();
  console.log('✅ DMX система сценариев инициализирована');
} catch (error) {
  console.warn('⚠️ DMX система сценариев недоступна:', error.message);
  dmxScenarioEngine = null;
}

// Вспомогательная функция для получения индекса игрока в комнате
function getPlayerIndex(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || !room.players) return -1;
  return room.players.findIndex(p => p.id === playerId);
}

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
    room.lastActivity = Date.now(); // Обновляем активность при подключении хоста
    socket.join(roomCode);
    socket.emit('host-connected', { roomCode, players: room.players });
    console.log(`Хост подключен к комнате ${roomCode}`);
  });

  // Игрок подключается к комнате
  socket.on('player-join', ({ roomCode, playerName, password }) => {
    console.log(`📥 Получено событие player-join: roomCode=${roomCode}, playerName=${playerName}`);
    
    // Нормализуем входные данные
    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const normalizedPlayerName = playerName ? playerName.trim() : '';
    
    console.log(`🔵 Игрок пытается подключиться: комната=${normalizedRoomCode}, имя=${normalizedPlayerName}`);
    
    if (!normalizedRoomCode || !normalizedPlayerName) {
      console.log(`❌ Неверные данные: roomCode=${normalizedRoomCode}, playerName=${normalizedPlayerName}`);
      socket.emit('error', { message: 'Неверные данные: заполните все поля' });
      return;
    }
    
    const room = rooms.get(normalizedRoomCode);
    if (!room) {
      console.log(`❌ Комната ${normalizedRoomCode} не найдена. Доступные комнаты:`, Array.from(rooms.keys()));
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Пароль проверяется только при создании комнаты хостом
    // Игроки подключаются без проверки пароля
    console.log(`✅ Игрок ${normalizedPlayerName} подключается к комнате ${normalizedRoomCode} (пароль не требуется), состояние игры: ${room.gameState}`);

    // ВАЖНО: Проверяем переподключение ДО любых проверок на gameState
    // Проверяем, есть ли уже игрок с таким именем в комнате (переподключение)
    // Ищем игрока по имени (без учета регистра и пробелов)
    console.log(`🔍 Поиск игрока для переподключения: имя="${normalizedPlayerName}", игроки в комнате:`, room.players.map(p => ({ name: p.name, disconnected: p.disconnected, id: p.id })));
    const existingPlayer = room.players.find(p => {
      const playerNameNormalized = (p.name || '').trim().toLowerCase();
      const inputNameNormalized = normalizedPlayerName.toLowerCase();
      const matches = playerNameNormalized === inputNameNormalized;
      if (matches) {
        console.log(`✅ Найден существующий игрок: "${p.name}" (нормализованное: "${playerNameNormalized}", disconnected: ${p.disconnected || false})`);
      }
      return matches;
    });
    let player;
    let isReconnection = false;

    if (existingPlayer) {
      // Найден игрок с таким именем
      console.log(`🔍 Найден существующий игрок: name="${existingPlayer.name}", disconnected=${existingPlayer.disconnected}, id=${existingPlayer.id}, score=${existingPlayer.score}`);
      
      // Проверяем disconnected (может быть undefined в старых записях, считаем undefined как false = подключен)
      const isDisconnected = existingPlayer.disconnected === true;
      if (!isDisconnected) {
        // Игрок уже подключен - это ошибка
        console.warn(`⚠️ Игрок ${normalizedPlayerName} уже подключен к комнате ${normalizedRoomCode} (disconnected: ${existingPlayer.disconnected})`);
        socket.emit('error', { message: 'Игрок с таким именем уже подключен к этой комнате' });
        return;
      }
      
      // Переподключение отключенного игрока - РАЗРЕШАЕМ в любом состоянии игры
      isReconnection = true;
      console.log(`🔄 Переподключение игрока ${normalizedPlayerName} (был отключен: ${existingPlayer.disconnected}), состояние игры: ${room.gameState}, текущий счет: ${existingPlayer.score}`);
      
      // Удаляем старую запись из players Map, если старый socket еще существует
      if (players.has(existingPlayer.id)) {
        players.delete(existingPlayer.id);
      }
      
      // Сохраняем старый socket.id перед обновления
      const oldSocketId = existingPlayer.id;
      
      // Обновляем данные игрока
      existingPlayer.id = socket.id;
      existingPlayer.disconnected = false;
      player = existingPlayer;
      
      // Обновляем ответы: переносим ответы со старого socket.id на новый
      // Ищем ответы по старому socket.id или по имени игрока
      if (room.answers.has(oldSocketId)) {
        // Переносим ответ со старого socket.id на новый
        const oldAnswer = room.answers.get(oldSocketId);
        room.answers.delete(oldSocketId);
        room.answers.set(socket.id, oldAnswer);
      } else {
        // Также проверяем по имени игрока (на случай, если socket.id уже изменился)
        for (const [answerSocketId, answer] of room.answers.entries()) {
          if (answer.playerName === normalizedPlayerName) {
            // Переносим ответ на новый socket.id
            room.answers.delete(answerSocketId);
            room.answers.set(socket.id, answer);
            break; // Нашли ответ, выходим
          }
        }
      }
    } else {
      // Новое подключение
      // Проверка на переполнение (считаем только активных игроков)
      const activePlayers = room.players.filter(p => !p.disconnected);
      if (activePlayers.length >= 14) {
        socket.emit('error', { message: 'Комната переполнена (максимум 14 игроков)' });
        return;
      }

      // Новое подключение - игрока с таким именем нет в комнате
      // Для новых игроков проверяем, можно ли подключаться во время игры
      if (room.gameState !== 'lobby') {
        console.log(`❌ Блокировка нового подключения: игра уже началась (gameState: ${room.gameState})`);
        socket.emit('error', { message: 'Игра уже началась. Нельзя подключиться к активной игре.' });
        return;
      }
      
      // Создаем нового игрока
      player = {
        id: socket.id,
        name: normalizedPlayerName,
        score: 0,
        roomCode: normalizedRoomCode,
        disconnected: false
      };
      room.players.push(player);
    }

    // Обновляем players Map
    players.set(socket.id, player);
    socket.join(normalizedRoomCode);
    room.lastActivity = Date.now(); // Обновляем активность при подключении игрока
    
    // Подготавливаем данные для отправки клиенту
    const connectionData = {
      playerId: socket.id,
      roomCode: normalizedRoomCode,
      quizId: room.quizId,
      isReconnection: isReconnection,
      playerScore: player.score
    };

    // Если это переподключение и игра уже началась, отправляем текущее состояние
    if (isReconnection && room.gameState !== 'lobby') {
      if (room.gameState === 'question') {
        // Игра идет, отправляем текущий вопрос
        const question = room.questions[room.currentQuestion];
        const questionData = {
          question: question.question,
          options: question.options,
          questionNumber: room.currentQuestion + 1,
          totalQuestions: room.questions.length,
          time: question.time,
          quizId: room.quizId,
          timeElapsed: room.startTime ? Math.floor((Date.now() - room.startTime) / 1000) : 0
        };
        connectionData.currentQuestion = questionData;
        connectionData.gameState = 'question';
        
        // Проверяем, ответил ли игрок на текущий вопрос (по имени, так как socket.id мог измениться)
        const hasAnswered = Array.from(room.answers.values()).some(a => 
          a.playerName === normalizedPlayerName
        );
        
        // Проверяем, не истекло ли время вопроса
        const timeElapsed = room.startTime ? Math.floor((Date.now() - room.startTime) / 1000) : 0;
        const timeExpired = timeElapsed >= question.time;
        
        // Если время истекло, считаем, что игрок не может ответить (hasAnswered = true)
        connectionData.hasAnswered = hasAnswered || timeExpired;
        connectionData.timeExpired = timeExpired;
      } else if (room.gameState === 'results') {
        // Показываются результаты, отправляем их
        const question = room.questions[room.currentQuestion];
        const results = Array.from(room.answers.values());
        const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
        connectionData.currentResults = {
          correctAnswer: question.correct,
          correctAnswerText: question.options[question.correct],
          results: results,
          players: sortedPlayers
        };
        connectionData.gameState = 'results';
      } else if (room.gameState === 'playing') {
        // Игра началась, но вопрос еще не показан
        connectionData.gameState = 'playing';
      } else if (room.gameState === 'finished') {
        // Игра завершена
        const finalResults = room.players.sort((a, b) => b.score - a.score);
        connectionData.finalResults = {
          results: finalResults
        };
        connectionData.gameState = 'finished';
      }
    }
    
    console.log(`📤 Отправка player-connected: isReconnection=${isReconnection}, gameState=${connectionData.gameState || 'lobby'}, playerScore=${player.score}`);
    socket.emit('player-connected', connectionData);
    io.to(normalizedRoomCode).emit('player-list-updated', { players: room.players });
    
    if (isReconnection) {
      console.log(`✅ Игрок ${normalizedPlayerName} переподключен к комнате ${normalizedRoomCode}, очки: ${player.score}, состояние игры: ${room.gameState}`);
    } else {
      console.log(`✅ Игрок ${normalizedPlayerName} подключен к комнате ${normalizedRoomCode} (новое подключение)`);
    }
    
    // DMX: игрок подключился
    const playerIndex = getPlayerIndex(normalizedRoomCode, socket.id);
    if (dmxScenarioEngine && playerIndex !== -1) {
      dmxScenarioEngine.handleGameEvent(normalizedRoomCode, 'PLAYER_JOINED', {
        playerIndex
      });
    }
  });

  // Хост запускает игру
  socket.on('start-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;
    
    room.gameState = 'playing';
    room.currentQuestion = 0;
    room.answers.clear();
    room.players.forEach(p => p.score = 0);
    room.lastActivity = Date.now(); // Обновляем активность
    
    io.to(roomCode).emit('game-started');
    
    // DMX: игра началась
    if (dmxScenarioEngine) {
      dmxScenarioEngine.handleGameEvent(roomCode, 'GAME_STARTED', {
        playerCount: room.players.length
      });
    }
    
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
    room.lastActivity = Date.now(); // Обновляем активность при показе вопроса

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
      time: question.time,
      quizId: room.quizId // Добавляем quizId для применения стилей
    };
    
    console.log(`📤 Отправка вопроса ${questionData.questionNumber} из ${questionData.totalQuestions} в комнату ${roomCode}`);
    
    io.to(roomCode).emit('question', questionData);
    
    // DMX: вопрос показан
    if (dmxScenarioEngine) {
      dmxScenarioEngine.handleGameEvent(roomCode, 'QUESTION_STARTED', {
        questionId: question.id
      });
    }

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

    // Получаем активных игроков (не отключенных)
    const activePlayers = room.players.filter(p => !p.disconnected);
    const answeredPlayerNames = Array.from(room.answers.values()).map(a => a.playerName);
    const answeredSocketIds = Array.from(room.answers.keys());
    
    const playerStatuses = activePlayers.map(player => {
      // Проверяем ответ по socket.id или по имени (для переподключения)
      const answered = answeredSocketIds.includes(player.id) || 
                      answeredPlayerNames.includes(player.name);
      return {
        id: player.id,
        name: player.name,
        answered: answered
      };
    });

    // Отправляем статус хосту
    io.to(roomCode).emit('answer-status', {
      players: playerStatuses,
      answeredCount: answeredPlayerNames.length,
      totalPlayers: activePlayers.length,
      allAnswered: answeredPlayerNames.length === activePlayers.length && activePlayers.length > 0
    });
  }

  // Игрок отправляет ответ
  socket.on('answer', ({ roomCode, answerIndex }) => {
    const room = rooms.get(roomCode);
    const player = players.get(socket.id);
    
    if (!room || !player || room.gameState !== 'question') return;
    
    // Проверяем, не ответил ли уже этот игрок (по socket.id или по имени)
    const alreadyAnswered = room.answers.has(socket.id) || 
      Array.from(room.answers.values()).some(a => a.playerName === player.name);
    if (alreadyAnswered) {
      console.log(`⚠️ Игрок ${player.name} уже ответил на вопрос`);
      return;
    }

    const question = room.questions[room.currentQuestion];
    const isCorrect = answerIndex === question.correct;
    const answerTime = Date.now() - room.startTime;
    room.lastActivity = Date.now(); // Обновляем активность при ответе игрока
    
    room.answers.set(socket.id, {
      playerId: socket.id,
      playerName: player.name,
      answerIndex,
      isCorrect,
      answerTime
    });

    // Начисление очков
    // Бонус за скорость: чем быстрее ответил, тем больше бонус
    // Формула: базовые 100 баллов + бонус (время вопроса - время ответа) / 100
    let points = 0;
    if (isCorrect) {
      // answerTime уже в миллисекундах (Date.now() - room.startTime)
      // question.time в секундах, поэтому умножаем на 1000
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
    
    // DMX: игрок ответил
    const playerIndex = getPlayerIndex(roomCode, socket.id);
    if (dmxScenarioEngine && playerIndex !== -1) {
      dmxScenarioEngine.handleGameEvent(roomCode, 'PLAYER_ANSWERED', {
        playerIndex,
        isCorrect
      });
    }
    
    // Обновляем статус ответов
    updateAnswerStatus(roomCode);
    
    // Проверяем, все ли активные игроки ответили
    const activePlayers = room.players.filter(p => !p.disconnected);
    const answeredCount = new Set(Array.from(room.answers.values()).map(a => a.playerName)).size;
    if (answeredCount === activePlayers.length && activePlayers.length > 0) {
      // Останавливаем таймер
      if (questionTimers.has(roomCode)) {
        clearTimeout(questionTimers.get(roomCode));
        questionTimers.delete(roomCode);
      }
      // Переходим к результатам через небольшую задержку (0.75 секунды)
      setTimeout(() => {
        if (room.gameState === 'question') {
          showResults(roomCode);
        }
      }, 750);
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
    room.lastActivity = Date.now(); // Обновляем активность при показе результатов
    const question = room.questions[room.currentQuestion];
    const results = Array.from(room.answers.values());

    const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
    io.to(roomCode).emit('results', {
      correctAnswer: question.correct,
      correctAnswerText: question.options[question.correct],
      results: results,
      players: sortedPlayers
    });

    // DMX: показать правильный ответ и результаты
    if (dmxScenarioEngine) {
      // Сначала показываем правильный ответ с результатами всех игроков
      const resultsWithIndices = results.map(result => ({
        playerIndex: getPlayerIndex(roomCode, result.playerId),
        isCorrect: result.isCorrect
      })).filter(r => r.playerIndex !== -1);
      
      dmxScenarioEngine.handleGameEvent(roomCode, 'SHOW_CORRECT_ANSWER', {
        results: resultsWithIndices
      });
      
      // Затем показываем результаты с таблицей лидеров
      const scoreboard = sortedPlayers.map((player, index) => ({
        playerIndex: getPlayerIndex(roomCode, player.id),
        score: player.score,
        isLeader: index === 0
      })).filter(p => p.playerIndex !== -1);
      
      setTimeout(() => {
        dmxScenarioEngine.handleGameEvent(roomCode, 'SHOW_RESULTS', {
          scoreboard
        });
      }, 500);
    }

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

    // Автоматически переходим к следующему вопросу, когда все игроки готовы
    if (allReady && room.gameState === 'results') {
      // Небольшая задержка для визуальной обратной связи
      setTimeout(() => {
        // Проверяем еще раз, что игра все еще в состоянии results и все готовы
        const currentRoom = rooms.get(roomCode);
        if (currentRoom && currentRoom.gameState === 'results') {
          const currentReadyCount = currentRoom.readyPlayers.size;
          if (currentReadyCount === currentRoom.players.length && currentRoom.players.length > 0) {
            currentRoom.currentQuestion++;
            if (currentRoom.currentQuestion < currentRoom.questions.length) {
              showQuestion(roomCode);
            } else {
              endGame(roomCode);
            }
          }
        }
      }, 500); // Небольшая задержка для плавности
    }
  }

  // Игрок подтверждает готовность к следующему вопросу
  socket.on('player-ready', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = players.get(socket.id);
    if (!player || player.roomCode !== roomCode) return;

    if (room.gameState === 'results') {
      room.readyPlayers.add(socket.id);
      room.lastActivity = Date.now(); // Обновляем активность
      console.log(`Игрок ${player.name} готов к следующему вопросу`);
      
      // DMX: игрок готов
      const playerIndex = getPlayerIndex(roomCode, socket.id);
      if (dmxScenarioEngine && playerIndex !== -1) {
        dmxScenarioEngine.handleGameEvent(roomCode, 'PLAYER_READY', {
          playerIndex
        });
      }
      
      updateReadyStatus(roomCode);
      
      // Проверяем, все ли готовы
      if (room.readyPlayers.size === room.players.length && room.players.length > 0) {
        // DMX: все игроки готовы
        if (dmxScenarioEngine) {
          dmxScenarioEngine.handleGameEvent(roomCode, 'ALL_PLAYERS_READY', {
            readyPlayers: Array.from(room.readyPlayers).map(id => getPlayerIndex(roomCode, id)).filter(i => i !== -1)
          });
        }
      }
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
      room.lastActivity = Date.now(); // Обновляем активность при переходе к следующему вопросу
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
    room.lastActivity = Date.now(); // Обновляем активность
    const finalResults = room.players.sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('game-finished', {
      results: finalResults
    });
    
    // DMX: игра завершена
    if (dmxScenarioEngine) {
      const finalResultsWithIndices = finalResults.map((player, index) => ({
        playerIndex: getPlayerIndex(roomCode, player.id),
        score: player.score,
        rank: index + 1
      })).filter(p => p.playerIndex !== -1);
      
      dmxScenarioEngine.handleGameEvent(roomCode, 'GAME_FINISHED', {
        finalResults: finalResultsWithIndices
      });
    }
  }

  // ========== ОБРАБОТЧИКИ ДЛЯ QUIZ-QUESTIONS (ИНТЕЛЛЕКТУАЛЬНАЯ ИГРА) ==========
  
  // Хост подключается к интеллектуальной игре
  socket.on('intellectual-host-join', (roomCode) => {
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) {
      socket.emit('error', { message: 'Система интеллектуальной игры недоступна' });
      return;
    }
    
    const room = intellectualRooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    room.host = socket.id;
    room.lastActivity = Date.now();
    socket.join(roomCode);
    socket.emit('intellectual-host-connected', { roomCode, players: room.players });
    console.log(`📋 Хост подключен к интеллектуальной комнате ${roomCode}`);
  });

  // Игрок подключается к интеллектуальной игре
  socket.on('intellectual-player-join', ({ roomCode, playerName }) => {
    console.log(`📥 Получено событие intellectual-player-join: roomCode=${roomCode}, playerName=${playerName}`);
    
    // Нормализуем входные данные
    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const normalizedPlayerName = playerName ? playerName.trim() : '';
    
    console.log(`🔵 Попытка подключения игрока: roomCode=${normalizedRoomCode}, playerName=${normalizedPlayerName}`);
    
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) {
      console.error('❌ Система интеллектуальной игры недоступна');
      socket.emit('error', { message: 'Система интеллектуальной игры недоступна' });
      return;
    }
    
    if (!normalizedRoomCode || !normalizedPlayerName) {
      console.error('❌ Не указаны roomCode или playerName');
      socket.emit('error', { message: 'Не указаны код комнаты или имя игрока' });
      return;
    }
    
    const room = intellectualRooms.get(normalizedRoomCode);
    if (!room) {
      console.error(`❌ Комната ${normalizedRoomCode} не найдена. Доступные комнаты:`, Array.from(intellectualRooms.keys()));
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // ВАЖНО: Проверяем переподключение ДО любых проверок на gameState
    // Проверяем, есть ли уже игрок с таким именем в комнате (переподключение)
    const inputNameNormalized = normalizedPlayerName.trim().toLowerCase();
    console.log(`🔍 Поиск игрока для переподключения: имя="${normalizedPlayerName}", нормализованное="${inputNameNormalized}", игроки в комнате:`, room.players.map(p => ({ 
      name: p.name, 
      normalizedName: (p.name || '').trim().toLowerCase(),
      disconnected: p.disconnected || false, 
      id: p.id 
    })));
    
    const existingPlayer = room.players.find(p => {
      const playerNameNormalized = (p.name || '').trim().toLowerCase();
      const matches = playerNameNormalized === inputNameNormalized;
      if (matches) {
        console.log(`✅ Найден существующий игрок: "${p.name}" (нормализованное: "${playerNameNormalized}", disconnected: ${p.disconnected || false}, id: ${p.id})`);
      }
      return matches;
    });
    
    if (!existingPlayer) {
      console.log(`❌ Игрок "${normalizedPlayerName}" не найден в комнате. Все игроки:`, room.players.map(p => ({ name: p.name, normalizedName: (p.name || '').trim().toLowerCase() })));
    }
    
    let player;
    let isReconnection = false;

    if (existingPlayer) {
      // Найден игрок с таким именем
      console.log(`🔍 Найден существующий игрок: name="${existingPlayer.name}", disconnected=${existingPlayer.disconnected}, id=${existingPlayer.id}, score=${existingPlayer.score}`);
      
      // Проверяем disconnected (может быть undefined в старых записях, считаем undefined как false = подключен)
      const isDisconnected = existingPlayer.disconnected === true;
      if (!isDisconnected) {
        // Игрок уже подключен - это ошибка
        console.warn(`⚠️ Игрок ${normalizedPlayerName} уже подключен к интеллектуальной комнате ${normalizedRoomCode} (disconnected: ${existingPlayer.disconnected})`);
        socket.emit('error', { message: 'Игрок с таким именем уже подключен к этой комнате' });
        return;
      }
      
      // Переподключение отключенного игрока - РАЗРЕШАЕМ в любом состоянии игры
      isReconnection = true;
      console.log(`🔄 Переподключение игрока ${normalizedPlayerName} (был отключен: ${existingPlayer.disconnected}), состояние игры: ${room.gameState}, текущий счет: ${existingPlayer.score}`);
      
      // Сохраняем старый socket.id перед обновлением
      const oldSocketId = existingPlayer.id;
      
      // Удаляем старую запись из intellectualPlayers Map, если старый socket еще существует
      if (intellectualPlayers.has(existingPlayer.id)) {
        intellectualPlayers.delete(existingPlayer.id);
      }
      
      // Обновляем данные игрока
      existingPlayer.id = socket.id;
      existingPlayer.disconnected = false;
      player = existingPlayer;
      
      // Обновляем Map для отслеживания подключений
      intellectualPlayers.set(socket.id, {
        name: player.name,
        roomCode: normalizedRoomCode
      });
      
      // Обновляем ответы: переносим ответы со старого socket.id на новый
      if (room.answers.has(oldSocketId)) {
        const oldAnswer = room.answers.get(oldSocketId);
        room.answers.delete(oldSocketId);
        room.answers.set(socket.id, oldAnswer);
      } else {
        // Также проверяем по имени игрока (на случай, если socket.id уже изменился)
        for (const [answerSocketId, answer] of room.answers.entries()) {
          if (answer.playerName === normalizedPlayerName) {
            // Переносим ответ на новый socket.id
            room.answers.delete(answerSocketId);
            room.answers.set(socket.id, answer);
            break; // Нашли ответ, выходим
          }
        }
      }
      
      if (room.verifiedAnswers.has(oldSocketId)) {
        const oldVerified = room.verifiedAnswers.get(oldSocketId);
        room.verifiedAnswers.delete(oldSocketId);
        room.verifiedAnswers.set(socket.id, oldVerified);
      } else {
        // Также проверяем по имени игрока для проверенных ответов
        for (const [verifiedSocketId, verified] of room.verifiedAnswers.entries()) {
          // Проверяем по имени через ответы или напрямую
          const answer = Array.from(room.answers.values()).find(a => a.playerName === normalizedPlayerName);
          if (answer && answer.playerId === verified.playerId) {
            room.verifiedAnswers.delete(verifiedSocketId);
            room.verifiedAnswers.set(socket.id, verified);
            break;
          }
        }
      }
    } else {
      // Новое подключение - игрока с таким именем нет в комнате
      console.log(`🆕 Новое подключение игрока ${normalizedPlayerName} (не найден в комнате), состояние игры: ${room.gameState}`);
      console.log(`🔍 Детали поиска: нормализованное имя="${normalizedPlayerName.toLowerCase()}", игроки в комнате:`, room.players.map(p => ({ 
        name: p.name, 
        normalizedName: (p.name || '').trim().toLowerCase(),
        disconnected: p.disconnected || false, 
        id: p.id 
      })));
      
      // Для новых игроков проверяем, можно ли подключаться во время игры
      if (room.gameState !== 'lobby') {
        // FALLBACK: Если игра уже началась, но игрок не найден, проверяем, может быть он был удален или не помечен как disconnected
        // Ищем всех игроков с таким именем (независимо от статуса disconnected)
        const disconnectedPlayers = room.players.filter(p => {
          const pNameNormalized = (p.name || '').trim().toLowerCase();
          const nameMatches = pNameNormalized === inputNameNormalized;
          // Проверяем, что игрок либо отключен, либо его socket.id не соответствует текущему (старое подключение)
          const isDisconnectedOrOld = p.disconnected === true || p.disconnected === undefined || p.id !== socket.id;
          return nameMatches && isDisconnectedOrOld;
        });
        
        if (disconnectedPlayers.length > 0) {
          // Нашли отключенного игрока - это переподключение!
          const foundPlayer = disconnectedPlayers[0];
          console.log(`🔄 FALLBACK: Найден отключенный игрок для переподключения: "${foundPlayer.name}" (disconnected: ${foundPlayer.disconnected}, id: ${foundPlayer.id})`);
          
          isReconnection = true;
          const oldSocketId = foundPlayer.id;
          
          // Удаляем старую запись из intellectualPlayers Map, если старый socket еще существует
          if (intellectualPlayers.has(foundPlayer.id)) {
            intellectualPlayers.delete(foundPlayer.id);
          }
          
          // Обновляем данные игрока
          foundPlayer.id = socket.id;
          foundPlayer.disconnected = false;
          player = foundPlayer;
          
          // Обновляем Map для отслеживания подключений
          intellectualPlayers.set(socket.id, {
            name: player.name,
            roomCode: normalizedRoomCode
          });
          
          // Обновляем ответы: переносим ответы со старого socket.id на новый
          if (room.answers.has(oldSocketId)) {
            const oldAnswer = room.answers.get(oldSocketId);
            room.answers.delete(oldSocketId);
            room.answers.set(socket.id, oldAnswer);
          } else {
            // Также проверяем по имени игрока (на случай, если socket.id уже изменился)
            for (const [answerSocketId, answer] of room.answers.entries()) {
              if (answer.playerName === normalizedPlayerName) {
                // Переносим ответ на новый socket.id
                room.answers.delete(answerSocketId);
                room.answers.set(socket.id, answer);
                break; // Нашли ответ, выходим
              }
            }
          }
          
          if (room.verifiedAnswers.has(oldSocketId)) {
            const oldVerified = room.verifiedAnswers.get(oldSocketId);
            room.verifiedAnswers.delete(oldSocketId);
            room.verifiedAnswers.set(socket.id, oldVerified);
          } else {
            // Также проверяем по имени игрока для проверенных ответов
            for (const [verifiedSocketId, verified] of room.verifiedAnswers.entries()) {
              // Проверяем по имени через ответы или напрямую
              const answer = Array.from(room.answers.values()).find(a => a.playerName === normalizedPlayerName);
              if (answer && answer.playerId === verified.playerId) {
                room.verifiedAnswers.delete(verifiedSocketId);
                room.verifiedAnswers.set(socket.id, verified);
                break;
              }
            }
          }
        } else {
          // Действительно новое подключение во время активной игры - блокируем
          console.log(`❌ Блокировка нового подключения: игра уже началась (gameState: ${room.gameState})`);
          console.log(`⚠️ ВНИМАНИЕ: Игрок "${normalizedPlayerName}" не найден в комнате, но игра уже началась. Возможно, игрок был удален или не был помечен как disconnected при отключении.`);
          socket.emit('error', { message: 'Игра уже началась. Нельзя подключиться к активной игре.' });
          return;
        }
      } else {
        // Игра еще не началась - можно создать нового игрока
        // Создаем нового игрока
        player = {
          id: socket.id,
          name: normalizedPlayerName,
          score: 0,
          disconnected: false
        };
        room.players.push(player);
        console.log(`✅ Создан новый игрок: name="${player.name}", id=${player.id}, disconnected=${player.disconnected}`);
      }
    }

    // Сохраняем игрока в Map для отслеживания подключений (и для нового, и для переподключенного)
    intellectualPlayers.set(socket.id, {
      name: player.name,
      roomCode: normalizedRoomCode
    });
    console.log(`✅ Игрок добавлен в intellectualPlayers Map: socket.id=${socket.id}, name="${player.name}", roomCode=${normalizedRoomCode}`);

    socket.join(normalizedRoomCode);
    room.lastActivity = Date.now();
    
    // Подготавливаем данные для отправки клиенту
    const connectionData = {
      roomCode: normalizedRoomCode,
      playerName: player.name,
      isReconnection: isReconnection,
      playerScore: player.score
    };

    // Если это переподключение и игра уже началась, отправляем текущее состояние
    if (isReconnection && room.gameState !== 'lobby') {
      connectionData.gameState = room.gameState;
      
      if (room.gameState === 'question' || room.gameState === 'waiting-verification') {
        // Игра идет, отправляем текущий вопрос
        const question = room.questions[room.currentQuestion];
        if (question) {
          const questionData = {
            question: question.question,
            options: question.options,
            questionNumber: room.currentQuestion + 1,
            totalQuestions: room.questions.length,
            time: question.time,
            timeElapsed: room.startTime ? Math.floor((Date.now() - room.startTime) / 1000) : 0
          };
          connectionData.currentQuestion = questionData;
          
          // Проверяем, ответил ли игрок на текущий вопрос (по socket.id или по имени)
          let hasAnswered = room.answers.has(socket.id);
          if (!hasAnswered) {
            // Проверяем по имени игрока (на случай, если socket.id изменился)
            hasAnswered = Array.from(room.answers.values()).some(a => 
              a.playerName === normalizedPlayerName
            );
          }
          connectionData.hasAnswered = hasAnswered;
        }
      } else if (room.gameState === 'waiting-next-question') {
        // Ожидание следующего вопроса
        connectionData.gameState = 'waiting-next-question';
      } else if (room.gameState === 'finished') {
        // Игра завершена
        connectionData.gameState = 'finished';
        const finalResults = room.players.sort((a, b) => b.score - a.score);
        connectionData.finalResults = {
          results: finalResults
        };
      }
    }
    
    console.log(`📤 Отправка intellectual-player-connected: isReconnection=${isReconnection}, gameState=${connectionData.gameState || 'lobby'}, playerScore=${player.score}`);
    socket.emit('intellectual-player-connected', connectionData);
    
    // Уведомляем всех (включая хост) об обновлении списка игроков
    io.to(normalizedRoomCode).emit('intellectual-player-list-updated', { players: room.players });
    
    if (isReconnection) {
      console.log(`✅ Игрок ${normalizedPlayerName} переподключен к интеллектуальной комнате ${normalizedRoomCode}, очки: ${player.score}, состояние игры: ${room.gameState}`);
    } else {
      console.log(`✅ Игрок ${normalizedPlayerName} подключен к интеллектуальной комнате ${normalizedRoomCode} (новое подключение). Всего игроков: ${room.players.length}`);
    }
    console.log(`📢 Отправлено обновление списка игроков в комнату ${normalizedRoomCode}`);
  });

  // Счетная комиссия подключается
  socket.on('intellectual-commission-join', ({ roomCode }) => {
    console.log(`📥 Получено событие intellectual-commission-join: roomCode=${roomCode}`);
    
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) {
      console.error('❌ Система интеллектуальной игры недоступна');
      socket.emit('error', { message: 'Система интеллектуальной игры недоступна' });
      return;
    }
    
    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = intellectualRooms.get(normalizedRoomCode);
    if (!room) {
      console.error(`❌ Комната ${normalizedRoomCode} не найдена. Доступные комнаты:`, Array.from(intellectualRooms.keys()));
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    // Сохраняем старый socket.id если комиссия уже была подключена
    const oldCommissionId = room.commission;
    const isReconnection = oldCommissionId && oldCommissionId !== socket.id;
    
    room.commission = socket.id;
    room.lastActivity = Date.now();
    socket.join(normalizedRoomCode);
    
    // Подготавливаем данные для отправки клиенту
    const connectionData = {
      roomCode: normalizedRoomCode,
      isReconnection: isReconnection,
      gameState: room.gameState
    };
    
    // Если игра уже началась, отправляем текущее состояние
    if (room.gameState !== 'lobby' && room.gameState !== 'finished') {
      if (room.gameState === 'question' || room.gameState === 'waiting-verification') {
        // Игра идет, отправляем текущий вопрос и ответы
        const question = room.questions[room.currentQuestion];
        if (question) {
          connectionData.currentQuestion = {
            question: question.question,
            options: question.options,
            questionNumber: room.currentQuestion + 1,
            totalQuestions: room.questions.length,
            time: question.time,
            timeElapsed: room.startTime ? Math.floor((Date.now() - room.startTime) / 1000) : 0
          };
          
          // Отправляем текущие ответы
          const currentAnswers = Array.from(room.answers.entries());
          connectionData.answers = currentAnswers.map(([socketId, answer]) => {
            // Находим игрока по socket.id, если playerName не указан
            let playerName = answer.playerName;
            if (!playerName) {
              const player = room.players.find(p => p.id === socketId);
              playerName = player ? player.name : 'Неизвестный';
            }
            
            return {
              playerId: answer.playerId || socketId,
              playerName: playerName,
              answer: answer.answer || answer.text || '',
              time: answer.time || 0
            };
          });
          console.log(`📤 Отправка ${currentAnswers.length} ответов комиссии для вопроса ${room.currentQuestion + 1}`);
          
          // Отправляем проверенные ответы
          // Важно: verifiedAnswers хранится по ключу (socket.id), но содержит playerId
          const verifiedAnswers = Array.from(room.verifiedAnswers.entries());
          connectionData.verifiedAnswers = verifiedAnswers.map(([storageKey, verified]) => {
            // Находим правильный playerId из answers, используя storageKey (socket.id)
            const answerEntry = Array.from(room.answers.entries()).find(([ansSocketId, ans]) => {
              return ansSocketId === storageKey;
            });
            
            // Используем playerId из ответа, если он есть, иначе используем storageKey или verified.playerId
            const playerId = answerEntry ? (answerEntry[1].playerId || answerEntry[0]) : (verified.playerId || storageKey);
            
            return {
              playerId: playerId,
              isCorrect: verified.isCorrect,
              score: verified.score
            };
          });
          console.log(`📤 Отправка ${verifiedAnswers.length} проверенных ответов комиссии`, connectionData.verifiedAnswers.map(v => ({ playerId: v.playerId })));
        }
      } else if (room.gameState === 'waiting-next-question') {
        // Ожидание следующего вопроса - отправляем последний вопрос и все проверенные ответы
        connectionData.gameState = 'waiting-next-question';
        const question = room.questions[room.currentQuestion];
        if (question) {
          connectionData.currentQuestion = {
            question: question.question,
            questionNumber: room.currentQuestion + 1,
            options: question.options
          };
        }
        
        // Отправляем все ответы на последний вопрос
        const currentAnswers = Array.from(room.answers.entries())
          .filter(([playerId, answer]) => {
            // Проверяем, что ответ относится к текущему вопросу
            return answer && (answer.questionIndex === room.currentQuestion || answer.questionIndex === undefined);
          })
          .map(([playerId, answer]) => {
            const player = room.players.find(p => p.id === playerId);
            return {
              playerId: playerId,
              playerName: answer.playerName || (player ? player.name : 'Неизвестный'),
              answer: answer.answer || answer.text || '',
              text: answer.text || answer.answer || '',
              time: answer.time || 0
            };
          });
        connectionData.answers = currentAnswers;
        
        // Отправляем все проверенные ответы
        const verifiedAnswers = Array.from(room.verifiedAnswers.values());
        connectionData.verifiedAnswers = verifiedAnswers.map(verified => ({
          playerId: verified.playerId,
          isCorrect: verified.isCorrect,
          score: verified.score
        }));
        console.log(`📤 Отправка состояния waiting-next-question комиссии: ${currentAnswers.length} ответов, ${verifiedAnswers.length} проверенных`);
      }
    }

    console.log(`📤 Отправка intellectual-commission-connected: isReconnection=${isReconnection}, gameState=${connectionData.gameState || 'lobby'}`);
    socket.emit('intellectual-commission-connected', connectionData);
    
    if (isReconnection) {
      console.log(`✅ Комиссия переподключена к комнате ${normalizedRoomCode}, состояние игры: ${room.gameState}`);
    } else {
      console.log(`✅ Комиссия подключена к комнате ${normalizedRoomCode}, состояние игры: ${room.gameState}`);
    }
  });

  // Игрок отправляет ответ
  socket.on('intellectual-answer', ({ roomCode, answer, time }) => {
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) return;
    
    const room = intellectualRooms.get(roomCode);
    // Принимаем ответы даже если игра уже в состоянии waiting-verification (таймер закончился)
    if (!room || (room.gameState !== 'question' && room.gameState !== 'waiting-verification')) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    room.answers.set(socket.id, {
      playerId: socket.id,
      playerName: player.name,
      text: answer || '', // Пустой ответ, если не указан
      answer: answer || '', // Дублируем для совместимости
      time: time,
      submittedAt: Date.now()
    });

    room.lastActivity = Date.now();

    // Уведомляем хост о новом ответе
    io.to(room.host).emit('intellectual-player-answered', {
      playerName: player.name,
      playerId: player.id,
      answersCount: room.answers.size,
      totalPlayers: room.players.length
    });

    // Уведомляем комиссию о новом ответе
    if (room.commission) {
      io.to(room.commission).emit('intellectual-new-answer');
    }

    console.log(`📝 Игрок ${player.name} отправил ответ в комнате ${roomCode}${answer ? '' : ' (пустой)'}`);
  });

  // Хост или комиссия начинает вопрос
  socket.on('intellectual-start-question', (roomCode) => {
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) return;
    
    const room = intellectualRooms.get(roomCode);
    // Разрешаем как хосту, так и комиссии запускать следующий вопрос
    if (!room || (room.host !== socket.id && room.commission !== socket.id)) return;
    if (room.currentQuestion >= room.questions.length) {
      // Игра завершена
      room.gameState = 'finished';
      io.to(roomCode).emit('intellectual-game-finished', {
        players: room.players.sort((a, b) => b.score - a.score)
      });
      return;
    }

    const question = room.questions[room.currentQuestion];
    room.gameState = 'question';
    room.questionStartTime = Date.now();
    room.answers.clear();
    room.verifiedAnswers.clear();
    room.lastActivity = Date.now();

    io.to(roomCode).emit('intellectual-question-started', {
      question: question,
      questionIndex: room.currentQuestion,
      totalQuestions: room.questions.length
    });

    console.log(`❓ Начат вопрос ${room.currentQuestion + 1} в комнате ${roomCode}`);
  });

  // Таймер вопроса истек
  socket.on('intellectual-question-timeout', (roomCode) => {
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) return;
    
    const room = intellectualRooms.get(roomCode);
    if (!room || room.host !== socket.id) return;

    room.gameState = 'waiting-verification';
    room.lastActivity = Date.now();

    // Отправляем пустые ответы для игроков, которые не ответили
    room.players.forEach(player => {
      if (!room.answers.has(player.id)) {
        room.answers.set(player.id, {
          playerId: player.id,
          playerName: player.name,
          text: '',
          answer: '', // Дублируем для совместимости
          time: room.questionStartTime ? Date.now() - room.questionStartTime : 0,
          submittedAt: Date.now()
        });
        
        // Уведомляем комиссию о новом ответе
        if (room.commission) {
          io.to(room.commission).emit('intellectual-new-answer');
        }
        
        console.log(`📝 Автоматически добавлен пустой ответ для игрока ${player.name} (время истекло)`);
      }
    });

    io.to(roomCode).emit('intellectual-question-ended');
    console.log(`⏰ Время вопроса истекло в комнате ${roomCode}. Добавлены пустые ответы для неответивших игроков.`);
  });

    // Комиссия обновила проверку
    socket.on('intellectual-verification-updated', ({ roomCode, questionIndex }) => {
      const intellectualRooms = global.intellectualRooms;
      if (!intellectualRooms) return;
      
      const room = intellectualRooms.get(roomCode);
      if (!room || room.commission !== socket.id) return;

      const verifiedCount = room.verifiedAnswers.size;
      const totalAnswers = room.answers.size;

      io.to(roomCode).emit('intellectual-verification-update', {
        verifiedCount: verifiedCount,
        totalAnswers: totalAnswers
      });

      // Если все ответы проверены, уведомляем (но НЕ переходим автоматически)
      if (verifiedCount === totalAnswers && totalAnswers > 0) {
        room.gameState = 'waiting-next-question';
        
        // Отправляем результаты каждому игроку индивидуально
        const currentQuestion = room.questions[room.currentQuestion];
        room.players.forEach(player => {
          const playerAnswer = room.answers.get(player.id);
          const verification = room.verifiedAnswers.get(player.id);
          
          io.to(player.id).emit('intellectual-question-result', {
            question: {
              question: currentQuestion.question,
              answer: currentQuestion.answer
            },
            playerAnswer: playerAnswer ? (playerAnswer.text || '') : '',
            correctAnswer: currentQuestion.answer || '',
            isCorrect: verification ? verification.isCorrect : false,
            pointsEarned: verification ? verification.score : 0,
            currentScore: player.score,
            questionIndex: room.currentQuestion,
            totalQuestions: room.questions.length
          });
        });
        
        io.to(roomCode).emit('intellectual-verification-complete', {
          players: room.players.sort((a, b) => b.score - a.score)
        });
      }
    });

    // Комиссия показывает таблицу лидеров на хосте
    socket.on('intellectual-show-leaderboard', ({ roomCode, players }) => {
      const intellectualRooms = global.intellectualRooms;
      if (!intellectualRooms) return;
      
      const room = intellectualRooms.get(roomCode);
      if (!room || room.commission !== socket.id) return;
      
      // Останавливаем таймер вопроса, если он еще идет
      room.gameState = 'waiting-next-question';
      
      // Останавливаем таймер для всех игроков и хоста
      io.to(roomCode).emit('intellectual-question-ended');
      
      // Отправляем таблицу лидеров на хост
      if (room.host) {
        io.to(room.host).emit('intellectual-show-leaderboard', {
          players: players || room.players.sort((a, b) => b.score - a.score)
        });
      }
      
      console.log(`📊 Таблица лидеров отправлена на хост в комнате ${roomCode}. Таймер остановлен.`);
    });

    // Комиссия переходит к следующему вопросу
    socket.on('intellectual-next-question', (roomCode) => {
      const intellectualRooms = global.intellectualRooms;
      if (!intellectualRooms) return;
      
      const room = intellectualRooms.get(roomCode);
      if (!room || room.commission !== socket.id) return;
      
      // Проверяем, что все ответы проверены
      const verifiedCount = room.verifiedAnswers.size;
      const totalAnswers = room.answers.size;
      
      if (verifiedCount !== totalAnswers || totalAnswers === 0) {
        console.log(`⚠️ Не все ответы проверены в комнате ${roomCode} (проверено: ${verifiedCount}/${totalAnswers})`);
        socket.emit('error', { message: 'Не все ответы проверены' });
        return;
      }
      
      // Переходим к следующему вопросу
      room.currentQuestion++;
      if (room.currentQuestion < room.questions.length) {
        // Запускаем следующий вопрос напрямую
        const question = room.questions[room.currentQuestion];
        room.gameState = 'question';
        room.questionStartTime = Date.now();
        room.answers.clear();
        room.verifiedAnswers.clear();
        room.lastActivity = Date.now();

        io.to(roomCode).emit('intellectual-question-started', {
          question: question,
          questionIndex: room.currentQuestion,
          totalQuestions: room.questions.length
        });

        console.log(`❓ Начат вопрос ${room.currentQuestion + 1} в комнате ${roomCode} (по запросу комиссии)`);
      } else {
        room.gameState = 'finished';
        io.to(roomCode).emit('intellectual-game-finished', {
          players: room.players.sort((a, b) => b.score - a.score)
        });
      }
    });

  // Отключение
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const room = rooms.get(player.roomCode);
      if (room) {
        // Помечаем игрока как отключенного вместо удаления
        // Ищем игрока по socket.id или по имени (на случай если socket.id изменился)
        let roomPlayer = room.players.find(p => p.id === socket.id);
        if (!roomPlayer) {
          // Если не нашли по id, ищем по имени
          const playerNameNormalized = (player.name || '').trim().toLowerCase();
          roomPlayer = room.players.find(p => {
            const pNameNormalized = (p.name || '').trim().toLowerCase();
            return pNameNormalized === playerNameNormalized;
          });
          if (roomPlayer) {
            console.log(`🔍 Найден игрок по имени при отключении: "${roomPlayer.name}" (id: ${roomPlayer.id}, socket.id: ${socket.id})`);
          }
        }
        if (roomPlayer) {
          roomPlayer.disconnected = true;
          // Сохраняем время отключения для возможной очистки позже
          roomPlayer.disconnectedAt = Date.now();
          console.log(`🔌 Игрок ${player.name} отключился от комнаты ${player.roomCode} (состояние сохранено, disconnected=true, id: ${roomPlayer.id})`);
        } else {
          console.warn(`⚠️ Игрок ${player.name} не найден в комнате ${player.roomCode} при отключении. Игроки в комнате:`, room.players.map(p => ({ name: p.name, id: p.id, disconnected: p.disconnected })));
        }
        room.lastActivity = Date.now(); // Обновляем активность при отключении игрока
        
        // Отправляем обновленный список игроков (с информацией об отключенных)
        io.to(player.roomCode).emit('player-list-updated', { players: room.players });
      }
      players.delete(socket.id);
    }
    
    // Обработка отключения для интеллектуальной игры
    const intellectualPlayer = intellectualPlayers.get(socket.id);
    if (intellectualPlayer) {
      const intellectualRooms = global.intellectualRooms;
      if (intellectualRooms) {
        const room = intellectualRooms.get(intellectualPlayer.roomCode);
        if (room) {
          // Помечаем игрока как отключенного вместо удаления
          // Ищем игрока по socket.id или по имени (на случай если socket.id изменился)
          let roomPlayer = room.players.find(p => p.id === socket.id);
          if (!roomPlayer) {
            // Если не нашли по id, ищем по имени
            const playerNameNormalized = (intellectualPlayer.name || '').trim().toLowerCase();
            roomPlayer = room.players.find(p => {
              const pNameNormalized = (p.name || '').trim().toLowerCase();
              return pNameNormalized === playerNameNormalized;
            });
            if (roomPlayer) {
              console.log(`🔍 Найден игрок по имени при отключении: "${roomPlayer.name}" (id: ${roomPlayer.id}, socket.id: ${socket.id})`);
            }
          }
          
          if (roomPlayer) {
            roomPlayer.disconnected = true;
            // Сохраняем время отключения для возможной очистки позже
            roomPlayer.disconnectedAt = Date.now();
            console.log(`🔌 Игрок ${intellectualPlayer.name} отключился от интеллектуальной комнаты ${intellectualPlayer.roomCode} (состояние сохранено, disconnected=true, id: ${roomPlayer.id})`);
          } else {
            console.warn(`⚠️ Игрок ${intellectualPlayer.name} не найден в интеллектуальной комнате ${intellectualPlayer.roomCode} при отключении. Игроки в комнате:`, room.players.map(p => ({ name: p.name, id: p.id, disconnected: p.disconnected })));
          }
          room.lastActivity = Date.now(); // Обновляем активность при отключении игрока
          
          // Отправляем обновленный список игроков (с информацией об отключенных)
          io.to(intellectualPlayer.roomCode).emit('intellectual-player-list-updated', { players: room.players });
        }
      }
      intellectualPlayers.delete(socket.id);
    } else {
      // Если игрок не найден в Map, но может быть в комнате, ищем его по socket.id во всех комнатах
      const intellectualRooms = global.intellectualRooms;
      if (intellectualRooms) {
        for (const [code, room] of intellectualRooms.entries()) {
          const roomPlayer = room.players.find(p => p.id === socket.id);
          if (roomPlayer) {
            console.log(`🔍 Найден игрок по socket.id при отключении (не был в Map): "${roomPlayer.name}" (id: ${roomPlayer.id}, socket.id: ${socket.id})`);
            roomPlayer.disconnected = true;
            roomPlayer.disconnectedAt = Date.now();
            room.lastActivity = Date.now();
            console.log(`🔌 Игрок ${roomPlayer.name} отключился от интеллектуальной комнаты ${code} (состояние сохранено, disconnected=true, id: ${roomPlayer.id})`);
            io.to(code).emit('intellectual-player-list-updated', { players: room.players });
            break;
          }
        }
      }
    }
    
    // Обработка отключения хоста или комиссии интеллектуальной игры
    const intellectualRooms = global.intellectualRooms;
    if (intellectualRooms) {
      for (const [code, room] of intellectualRooms.entries()) {
        // Обработка отключения хоста или комиссии
        if (room.host === socket.id) {
          room.lastActivity = Date.now();
          console.log(`🔌 Хост отключился от интеллектуальной комнаты ${code}`);
        } else if (room.commission === socket.id) {
          // Комиссия отключилась - не удаляем, просто обновляем активность
          // При переподключении комиссия получит текущее состояние игры
          room.lastActivity = Date.now();
          console.log(`🔌 Комиссия отключилась от интеллектуальной комнаты ${code} (можно переподключиться)`);
        }
      }
    }
    
    console.log('Отключение:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

// Функция для очистки неактивных комнат
function cleanupInactiveRooms() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [code, room] of rooms.entries()) {
    // Удаляем комнаты, которые завершены и неактивны более ROOM_TIMEOUT
    if (room.gameState === 'finished' && room.lastActivity) {
      if (now - room.lastActivity > ROOM_TIMEOUT) {
        // DMX: очистка комнаты
        if (dmxScenarioEngine) {
          dmxScenarioEngine.cleanupRoom(code);
        }
        rooms.delete(code);
        cleanedCount++;
        console.log(`🗑️ Удалена завершенная комната: ${code}`);
      }
    }
    // Удаляем комнаты в лобби без активности более ROOM_TIMEOUT
    else if (room.gameState === 'lobby' && room.lastActivity) {
      if (now - room.lastActivity > ROOM_TIMEOUT) {
        rooms.delete(code);
        cleanedCount++;
        console.log(`🗑️ Удалена неактивная комната в лобби: ${code}`);
      }
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Очищено ${cleanedCount} неактивных комнат`);
  }
}

// Функция для мониторинга производительности
function logPerformanceStats() {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  
  console.log(`📊 Статистика производительности:`);
  console.log(`   Комнаты: ${rooms.size}/${MAX_ROOMS}`);
  console.log(`   Игроки: ${players.size}/${MAX_TOTAL_PLAYERS}`);
  console.log(`   Рейтинг в памяти: ${leaderboard.length}/${MAX_LEADERBOARD_ENTRIES}`);
  console.log(`   Очередь рейтинга: ${leaderboardQueue.length}`);
  console.log(`   Память: ${memMB} МБ / ${memTotalMB} МБ`);
  
  // Предупреждения при высокой нагрузке
  if (rooms.size > MAX_ROOMS * 0.8) {
    console.warn(`⚠️ Высокая нагрузка: ${Math.round(rooms.size / MAX_ROOMS * 100)}% комнат занято`);
  }
  if (players.size > MAX_TOTAL_PLAYERS * 0.8) {
    console.warn(`⚠️ Высокая нагрузка: ${Math.round(players.size / MAX_TOTAL_PLAYERS * 100)}% игроков подключено`);
  }
  if (memMB > 500) {
    console.warn(`⚠️ Высокое использование памяти: ${memMB} МБ`);
  }
}

// Запуск сервера только если файл запущен напрямую (не импортирован)
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Сервер запущен на порту ${PORT} (доступен на всех интерфейсах)`);
    console.log(`Откройте http://localhost:${PORT}/index.html для выбора квиза`);
    console.log(`Или http://localhost:${PORT}/player.html для игроков`);
    console.log(`📊 Лимиты: ${MAX_ROOMS} комнат, ${MAX_TOTAL_PLAYERS} игроков, ${MAX_LEADERBOARD_ENTRIES} записей рейтинга`);
    
    // Инициализируем рейтинг из Google Sheets
    await initializeLeaderboard();
    
    // Автоматическое обновление рейтинга каждые 5 минут
    setInterval(async () => {
      console.log('🔄 Автоматическое обновление рейтинга...');
      await initializeLeaderboard();
    }, 5 * 60 * 1000); // 5 минут
    
    // Обработка очереди рейтинга (батчинг) каждые LEADERBOARD_QUEUE_INTERVAL
    setInterval(() => {
      if (leaderboardQueue.length > 0) {
        processLeaderboardQueue();
      }
    }, LEADERBOARD_QUEUE_INTERVAL);
    
    // Очистка неактивных комнат каждые 5 минут
    setInterval(() => {
      cleanupInactiveRooms();
    }, 5 * 60 * 1000);
    
    // Мониторинг производительности каждую минуту
    setInterval(() => {
      logPerformanceStats();
    }, 60 * 1000);
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

