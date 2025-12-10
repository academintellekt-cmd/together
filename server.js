const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { loadAllQuizzes } = require('./server/utils/quiz-loader');

// DMX интеграция
let dmxIntegration = null;
try {
  const { DMXIntegration } = require('./server/dmx/dmx-integration');
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

// Статический middleware - после API роутов
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Geometria', express.static(path.join(__dirname, 'Geometria')));
app.use('/joystick-test', express.static(path.join(__dirname, 'joystick-test')));
app.use('/data/media', express.static(path.join(__dirname, 'data/media')));

// Хранилище комнат и игроков
const rooms = new Map();
const players = new Map();

// Инициализация DMX интеграции
try {
  const { DMXIntegration } = require('./server/dmx/dmx-integration');
  dmxIntegration = new DMXIntegration(io, rooms, players);
  console.log('✅ DMX интеграция инициализирована');
} catch (error) {
  console.warn('⚠️ DMX интеграция недоступна:', error.message);
  dmxIntegration = null;
}

// Инициализация системы состояний освещения
let lightingEngine = null;
let GameEvent = null;
try {
  const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
  const lightingStates = require('./server/dmx/dmx-lighting-states');
  GameEvent = lightingStates.GameEvent;
  lightingEngine = getDMXScenarioEngine();
  console.log('✅ Система состояний освещения инициализирована');
} catch (error) {
  console.warn('⚠️ Система состояний освещения недоступна:', error.message);
  lightingEngine = null;
  GameEvent = null;
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
const LEADERBOARD_QUEUE_BATCH_SIZE = 1; // Размер батча для записи в Google Sheets (1 = записывать сразу)
const LEADERBOARD_QUEUE_INTERVAL = 2 * 1000; // Интервал записи батча (2 секунды для оставшихся записей)

// Очередь для батчинга записей в Google Sheets
const leaderboardQueue = [];

// Функция для нормализации quizId (конвертация названия в ID)
// ВАЖНО: quizzes должен быть загружен до использования этой функции
function normalizeQuizId(quizIdOrName) {
  if (!quizIdOrName) return null;
  
  // Если это уже ID (короткая строка без пробелов или с дефисом), возвращаем как есть
  if (quizIdOrName === 'gnu' || quizIdOrName === 'friends-quiz' || quizIdOrName === 'akadem') {
    return quizIdOrName;
  }
  
  // Приводим к нижнему регистру для сравнения
  const lowerQuizIdOrName = quizIdOrName.toLowerCase().trim();
  
  // Проверяем по названиям квизов (если quizzes уже загружен)
  if (typeof quizzes !== 'undefined' && quizzes) {
    for (const [id, quiz] of Object.entries(quizzes)) {
      const quizNameLower = (quiz.name || '').toLowerCase().trim();
      const quizTitleLower = (quiz.display && quiz.display.title ? quiz.display.title : '').toLowerCase().trim();
      const quizSubtitleLower = (quiz.display && quiz.display.subtitle ? quiz.display.subtitle : '').toLowerCase().trim();
      
      // Точное совпадение
      if (quizNameLower === lowerQuizIdOrName || quizTitleLower === lowerQuizIdOrName) {
        console.log(`🔄 normalizeQuizId: "${quizIdOrName}" найден по названию квиза как "${id}"`);
        return id;
      }
      
      // Частичное совпадение - если запрашиваемое название содержит название квиза или наоборот
      // Это помогает найти "Академгородок: история и легенды" даже если в Google Sheets немного другой формат
      if (quizNameLower && (lowerQuizIdOrName.includes(quizNameLower) || quizNameLower.includes(lowerQuizIdOrName))) {
        console.log(`🔄 normalizeQuizId: "${quizIdOrName}" найден по частичному совпадению с названием "${quiz.name}" как "${id}"`);
        return id;
      }
      
      // Проверяем по subtitle (например, "история и легенды")
      if (quizSubtitleLower && lowerQuizIdOrName.includes(quizSubtitleLower)) {
        console.log(`🔄 normalizeQuizId: "${quizIdOrName}" найден по subtitle "${quizSubtitleLower}" как "${id}"`);
        return id;
      }
    }
  }
  
  // Если не нашли совпадение, проверяем частичные совпадения
  // Проверяем для ГНУ
  if (lowerQuizIdOrName.includes('гну') || lowerQuizIdOrName.includes('чемпионат') || 
      lowerQuizIdOrName.includes('братишек') || lowerQuizIdOrName.includes('цели')) {
    return 'gnu';
  }
  // Проверяем для Академгородка - более точные совпадения
  // Проверяем различные варианты написания
  
  // Сначала проверяем точное совпадение с полным названием
  if (lowerQuizIdOrName === 'академгородок: история и легенды' || 
      lowerQuizIdOrName === 'академгородок история и легенды' ||
      lowerQuizIdOrName.includes('академгородок') && lowerQuizIdOrName.includes('история') && lowerQuizIdOrName.includes('легенды')) {
    console.log(`🔄 normalizeQuizId: "${quizIdOrName}" распознан как "akadem" (полное название)`);
    return 'akadem';
  }
  
  // Если содержит "академ" или "академгородок" - это точно академ
  if (lowerQuizIdOrName.includes('академ') || lowerQuizIdOrName.includes('академгородок')) {
    console.log(`🔄 normalizeQuizId: "${quizIdOrName}" распознан как "akadem" (содержит "академ" или "академгородок")`);
    return 'akadem';
  }
  
  // Если содержит и "история" и "легенды" - это тоже академ
  if (lowerQuizIdOrName.includes('история') && lowerQuizIdOrName.includes('легенды')) {
    console.log(`🔄 normalizeQuizId: "${quizIdOrName}" распознан как "akadem" (содержит "история" и "легенды")`);
    return 'akadem';
  }
  
  // Если начинается с "академгородок" - это академ
  if (lowerQuizIdOrName.startsWith('академгородок')) {
    console.log(`🔄 normalizeQuizId: "${quizIdOrName}" распознан как "akadem" (начинается с "академгородок")`);
    return 'akadem';
  }
  
  // Если ничего не подошло, возвращаем как есть (может быть старый формат)
  return quizIdOrName;
}

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
                        
                        // Логируем, если quizId изменился или если это академ
                        if (originalQuizId !== normalizedQuizId) {
                          console.log(`🔄 Нормализация quizId: "${originalQuizId}" -> "${normalizedQuizId}"`);
                        }
                        
                        // Дополнительное логирование для академ
                        const lowerOriginal = (originalQuizId || '').toLowerCase();
                        if (lowerOriginal.includes('академ') || lowerOriginal.includes('история') || lowerOriginal.includes('легенды')) {
                          console.log(`📋 Академ запись: "${originalQuizId}" -> нормализован в "${normalizedQuizId}", игрок: "${entry.playerName}"`);
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
                        
                        // Логируем, если quizId изменился или если это академ
                        if (originalQuizId !== normalizedQuizId) {
                          console.log(`🔄 Нормализация quizId: "${originalQuizId}" -> "${normalizedQuizId}"`);
                        }
                        
                        // Дополнительное логирование для академ
                        const lowerOriginal = (originalQuizId || '').toLowerCase();
                        if (lowerOriginal.includes('академ') || lowerOriginal.includes('история') || lowerOriginal.includes('легенды')) {
                          console.log(`📋 Академ запись: "${originalQuizId}" -> нормализован в "${normalizedQuizId}", игрок: "${entry.playerName}"`);
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
  
  // Берем все записи из очереди (или батч, если их много)
  const batchSize = Math.min(leaderboardQueue.length, LEADERBOARD_QUEUE_BATCH_SIZE);
  const batch = leaderboardQueue.splice(0, batchSize);
  console.log(`📤 Запись ${batch.length} записи(ей) в Google Sheets...`);
  
  // Записываем каждую запись из батча параллельно
  const promises = batch.map(result => {
    console.log(`📝 Запись результата "${result.playerName}" (${result.score} очков) для "${result.quizId}"...`);
    return writeToGoogleSheets(result);
  });
  const results = await Promise.allSettled(promises);
  
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  console.log(`✅ Записано ${successCount}/${batch.length} записей в Google Sheets`);
  
  // Если были ошибки, логируем их
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`❌ Ошибка записи записи ${index + 1}:`, result.reason);
    }
  });
  
  // Не обновляем рейтинг из Google Sheets после каждой записи (это медленно)
  // Обновление происходит периодически через initializeLeaderboard
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
  
  // Нормализуем quizId при сохранении для единообразия
  const normalizedQuizId = normalizeQuizId(quizId) || quizId;
  console.log(`💾 Сохранение результата: quizId="${quizId}" -> нормализован в "${normalizedQuizId}"`);
  
  const result = {
    id: Date.now().toString(),
    playerName: playerName.trim(),
    quizId: normalizedQuizId, // Сохраняем нормализованный quizId
    score: score,
    correctAnswers: correctAnswers || 0,
    totalQuestions: totalQuestions || 0,
    timeSpent: timeSpent || 0,
    date: new Date().toISOString(),
    timestamp: Date.now()
  };
  
  leaderboard.push(result);
  console.log(`✅ Результат добавлен в память: "${result.playerName}" (${result.score} очков) для квиза "${normalizedQuizId}"`);
  console.log(`📊 Всего записей в памяти: ${leaderboard.length}`);
  
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

  // Добавляем в очередь для батчинга (асинхронно, не блокируем ответ)
  leaderboardQueue.push(result);
  
  // Записываем сразу (асинхронно, не блокируем ответ клиенту)
  // Используем setImmediate для немедленного выполнения после ответа клиенту
  setImmediate(() => {
    processLeaderboardQueue();
  });
  
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
    console.log(`🔍 Фильтрация рейтинга: запрошен quizId="${quizId}", нормализован в "${normalizedQuizId}"`);
    console.log(`📊 Всего записей в рейтинге: ${leaderboard.length}`);
    
    // Логируем все уникальные quizId в рейтинге
    const uniqueQuizIds = [...new Set(leaderboard.map(r => r.quizId))];
    console.log(`📊 Уникальные quizId в рейтинге:`, uniqueQuizIds);
    
    // Фильтруем результаты, нормализуя quizId из рейтинга
    let matchCount = 0;
    results = leaderboard.filter(r => {
      // Нормализуем quizId из записи рейтинга
      const rQuizId = normalizeQuizId(r.quizId) || r.quizId;
      const matches = rQuizId === normalizedQuizId;
      if (matches) {
        matchCount++;
        if (matchCount <= 10) { // Логируем первые 10 совпадений
          console.log(`✅ Найдено совпадение ${matchCount}: "${r.quizId}" -> "${rQuizId}", игрок: "${r.playerName}", очки: ${r.score}`);
        }
      } else {
        // Логируем несовпадения для отладки (только первые несколько)
        if (matchCount === 0 && leaderboard.indexOf(r) < 5) {
          console.log(`❌ Не совпало: "${r.quizId}" -> "${rQuizId}" (ожидали "${normalizedQuizId}")`);
        }
      }
      return matches;
    });
    
    console.log(`📊 Найдено результатов после фильтрации: ${results.length}`);
    
    // Дополнительное логирование для академ
    if (normalizedQuizId === 'akadem' && results.length > 0) {
      console.log(`📋 Все записи для академ (${results.length}):`, results.map(r => ({
        player: r.playerName,
        score: r.score,
        quizId: r.quizId,
        normalized: normalizeQuizId(r.quizId)
      })));
    }
    
    // Если результатов мало или нет, проверяем альтернативные варианты для академ
    if ((results.length === 0 || results.length < 3) && (quizId.toLowerCase().includes('академ') || quizId.toLowerCase().includes('akadem') || normalizedQuizId === 'akadem')) {
      console.log(`🔍 Попытка найти результаты для академ городка альтернативным способом...`);
      console.log(`📊 Текущее количество результатов: ${results.length}`);
      
      // Проверяем все записи в рейтинге, которые могут быть для академ
      const allPossibleAkadem = leaderboard.filter(r => {
        const rQuizId = normalizeQuizId(r.quizId) || r.quizId;
        const rQuizIdLower = (r.quizId || '').toLowerCase();
        // Проверяем по нормализованному ID или по содержимому строки
        return rQuizId === 'akadem' || 
               rQuizIdLower.includes('академ') || 
               rQuizIdLower.includes('академгородок') ||
               (rQuizIdLower.includes('история') && rQuizIdLower.includes('легенды'));
      });
      
      if (allPossibleAkadem.length > 0) {
        console.log(`🔍 Найдено ${allPossibleAkadem.length} потенциальных записей для академ:`);
        allPossibleAkadem.slice(0, 10).forEach(r => {
          console.log(`  - "${r.quizId}" -> "${normalizeQuizId(r.quizId)}", игрок: "${r.playerName}", очки: ${r.score}`);
        });
        
        // Если нашли больше записей, чем было, используем их
        if (allPossibleAkadem.length > results.length) {
          console.log(`✅ Используем ${allPossibleAkadem.length} записей вместо ${results.length}`);
          results = allPossibleAkadem;
        }
      }
    }
  }
  
  // Группируем по игрокам и берем лучший результат каждого
  const playerBestScores = {};
  let skippedCount = 0;
  results.forEach(result => {
    // Пропускаем результаты с пустыми именами или нулевыми очками
    if (!result.playerName || result.playerName.trim() === '' || result.score === 0) {
      skippedCount++;
      if (skippedCount <= 3) {
        console.log(`⏭️ Пропущена запись: имя="${result.playerName}", очки=${result.score}`);
      }
      return;
    }
    
    const key = result.playerName.toLowerCase().trim();
    
    // Если игрока еще нет или его новый результат лучше
    const isAkadem = quizId && (quizId.toLowerCase().includes('академ') || quizId.toLowerCase().includes('akadem'));
    if (!playerBestScores[key]) {
      playerBestScores[key] = result;
      if (isAkadem) {
        console.log(`➕ Добавлен игрок "${result.playerName}" с очками ${result.score}`);
      }
    } else if (playerBestScores[key].score < result.score) {
      if (isAkadem) {
        console.log(`🔄 Обновлен результат для "${result.playerName}": ${playerBestScores[key].score} -> ${result.score}`);
      }
      playerBestScores[key] = result;
    } else {
      if (isAkadem) {
        console.log(`⏭️ Пропущен худший результат для "${result.playerName}": ${result.score} (лучший: ${playerBestScores[key].score})`);
      }
    }
  });
  
  if (skippedCount > 0) {
    console.log(`📊 Пропущено записей: ${skippedCount}`);
  }
  
  console.log(`📊 Уникальных игроков после группировки: ${Object.keys(playerBestScores).length}`);
  
  // Сортируем по очкам (от большего к меньшему)
  const sortedResults = Object.values(playerBestScores).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
  });
  
  // Ограничиваем до 50 лучших игроков
  const topResults = sortedResults.slice(0, 50);
  
  // Финальное логирование для отладки
  if (quizId && (quizId.toLowerCase().includes('академ') || quizId.toLowerCase().includes('akadem'))) {
    console.log(`📊 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ для "${quizId}":`);
    console.log(`  - Всего записей в рейтинге: ${leaderboard.length}`);
    console.log(`  - После фильтрации по quizId: ${results.length}`);
    console.log(`  - Уникальных игроков: ${Object.keys(playerBestScores).length}`);
    console.log(`  - Возвращаем топ игроков: ${topResults.length}`);
    if (topResults.length > 0) {
      console.log(`  - Топ-3 игрока:`, topResults.slice(0, 3).map(r => `${r.playerName} (${r.score} очков)`));
    }
  }
  
  res.json(topResults);
});

// Тестовый endpoint для принудительной загрузки рейтинга
app.get('/api/reload-leaderboard', async (req, res) => {
  console.log('🔄 Принудительная перезагрузка рейтинга...');
  console.log(`📊 Текущее количество записей в памяти: ${leaderboard.length}`);
  
  try {
    const savedLeaderboard = await loadLeaderboardFromGoogleSheets();
    
    // Сохраняем текущие записи из памяти (новые результаты, которые еще не в Google Sheets)
    const currentLeaderboardIds = new Set(leaderboard.map(r => r.id));
    const newResults = leaderboard.filter(r => {
      // Оставляем только те результаты, которых нет в загруженных данных
      // или которые новее (по timestamp)
      const foundInSaved = savedLeaderboard.find(s => s.id === r.id);
      return !foundInSaved || (foundInSaved && r.timestamp > foundInSaved.timestamp);
    });
    
    console.log(`📊 Загружено из Google Sheets: ${savedLeaderboard.length} записей`);
    console.log(`📊 Новых результатов в памяти (еще не в Google Sheets): ${newResults.length}`);
    
    if (savedLeaderboard.length > 0) {
      // Объединяем данные: сначала загруженные из Google Sheets, затем новые из памяти
      const mergedLeaderboard = [...savedLeaderboard];
      
      // Добавляем новые результаты, которых нет в загруженных данных
      newResults.forEach(newResult => {
        const exists = mergedLeaderboard.find(r => r.id === newResult.id);
        if (!exists) {
          mergedLeaderboard.push(newResult);
          console.log(`➕ Добавлен новый результат в память: "${newResult.playerName}" (${newResult.score} очков) для "${newResult.quizId}"`);
        }
      });
      
      leaderboard.length = 0; // Очищаем текущий массив
      leaderboard.push(...mergedLeaderboard); // Добавляем объединенные данные
      
      // Сортируем по очкам (от большего к меньшему)
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp; // При одинаковых очках - кто раньше
      });
      
      console.log(`✅ Рейтинг обновлен: ${leaderboard.length} записей (${savedLeaderboard.length} из Google Sheets + ${newResults.length} новых)`);
      
      res.json({ 
        success: true, 
        message: `Рейтинг перезагружен: ${leaderboard.length} записей`,
        leaderboard: leaderboard 
      });
    } else {
      // Если не удалось загрузить из Google Sheets, оставляем текущие данные в памяти
      console.log(`⚠️ Не удалось загрузить из Google Sheets, оставляем ${leaderboard.length} записей в памяти`);
      res.json({ 
        success: false, 
        message: 'Не удалось загрузить рейтинг из Google Sheets, используем данные из памяти',
        leaderboard: leaderboard 
      });
    }
  } catch (error) {
    console.error('❌ Ошибка перезагрузки рейтинга:', error);
    // При ошибке оставляем текущие данные в памяти
    res.json({ 
      success: false, 
      message: 'Ошибка перезагрузки рейтинга: ' + error.message + ', используем данные из памяти',
      leaderboard: leaderboard 
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
  
  // Инициализация системы освещения для новой комнаты
  if (lightingEngine && GameEvent) {
    try {
      lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_STARTED, {
        playerCount: 14
      });
    } catch (error) {
      console.warn('⚠️ Ошибка инициализации освещения для комнаты:', error.message);
    }
  }
  
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

// Инициализация DMX интеграции (после создания io)
try {
  const { DMXIntegration } = require('./server/dmx/dmx-integration');
  dmxIntegration = new DMXIntegration(io, rooms, players);
  console.log('✅ DMX интеграция инициализирована');
} catch (error) {
  console.warn('⚠️ DMX интеграция недоступна:', error.message);
  dmxIntegration = null;
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
    room.lastActivity = Date.now(); // Обновляем активность при подключении игрока
    
    socket.emit('player-connected', { 
      playerId: socket.id, 
      roomCode: normalizedRoomCode,
      quizId: room.quizId // Добавляем quizId для применения стилей
    });
    io.to(normalizedRoomCode).emit('player-list-updated', { players: room.players });
    console.log(`Игрок ${normalizedPlayerName} подключен к комнате ${normalizedRoomCode}`);
    
    // DMX: игрок подключился (старая система)
    if (dmxIntegration) {
      dmxIntegration.onPlayerJoin(normalizedRoomCode, socket.id);
    }
    
    // Система состояний освещения: игрок подключился
    if (lightingEngine && GameEvent) {
      try {
        const playerIndex = room.players.length - 1; // Индекс только что добавленного игрока
        lightingEngine.handleGameEvent(normalizedRoomCode, GameEvent.PLAYER_JOINED, {
          playerIndex: playerIndex
        });
      } catch (error) {
        console.warn('⚠️ Ошибка обработки события PLAYER_JOINED:', error.message);
      }
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
    
    // DMX: игра началась (старая система)
    if (dmxIntegration) {
      dmxIntegration.onGameStarted(roomCode);
    }
    
    // Система состояний освещения: игра началась
    if (lightingEngine && GameEvent) {
      try {
        lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_STARTED, {
          playerCount: room.players.length
        });
        // Устанавливаем всех игроков в состояние ожидания готовности
        lightingEngine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY);
      } catch (error) {
        console.warn('⚠️ Ошибка обработки события GAME_STARTED:', error.message);
      }
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
    
    // DMX: вопрос показан (старая система)
    if (dmxIntegration) {
      dmxIntegration.onQuestionShown(roomCode);
    }
    
    // Система состояний освещения: вопрос начался
    if (lightingEngine && GameEvent) {
      try {
        lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_STARTED, {
          questionId: `q${room.currentQuestion + 1}`
        });
      } catch (error) {
        console.warn('⚠️ Ошибка обработки события QUESTION_STARTED:', error.message);
      }
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
    
    // DMX: игрок ответил (старая система)
    if (dmxIntegration) {
      dmxIntegration.onPlayerAnswer(roomCode, socket.id);
      
      // DMX: правильный/неправильный ответ
      if (isCorrect) {
        dmxIntegration.onCorrectAnswer(roomCode, socket.id);
      } else {
        dmxIntegration.onIncorrectAnswer(roomCode, socket.id);
      }
    }
    
    // Система состояний освещения: игрок ответил
    if (lightingEngine && GameEvent) {
      try {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
            playerIndex: playerIndex,
            isCorrect: isCorrect
          });
        }
      } catch (error) {
        console.warn('⚠️ Ошибка обработки события PLAYER_ANSWERED:', error.message);
      }
    }
    
    // Обновляем статус ответов
    updateAnswerStatus(roomCode);
    
    // Проверяем, все ли ответили
    if (room.answers.size === room.players.length && room.players.length > 0) {
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

    io.to(roomCode).emit('results', {
      correctAnswer: question.correct,
      correctAnswerText: question.options[question.correct],
      results: results,
      players: room.players.sort((a, b) => b.score - a.score)
    });

    // DMX: показать результаты (старая система)
    if (dmxIntegration) {
      dmxIntegration.onShowResults(roomCode, results);
    }
    
    // Система состояний освещения: показать правильный ответ
    if (lightingEngine && GameEvent) {
      try {
        // Формируем результаты для каждого игрока
        const lightingResults = room.players.map((player, index) => {
          const answer = room.answers.get(player.id);
          return {
            playerIndex: index,
            isCorrect: answer ? answer.isCorrect : false
          };
        });
        
        lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, {
          results: lightingResults
        });
        
        // Через небольшую задержку показываем результаты с лидерами
        setTimeout(() => {
          const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
          const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;
          
          const scoreboard = room.players.map((player, index) => ({
            playerIndex: index,
            score: player.score,
            isLeader: player.score === maxScore && maxScore > 0
          }));
          
          lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_RESULTS, {
            scoreboard: scoreboard
          });
        }, 2000);
      } catch (error) {
        console.warn('⚠️ Ошибка обработки событий результатов:', error.message);
      }
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
      // Система состояний освещения: все игроки готовы
      if (lightingEngine && GameEvent) {
        try {
          lightingEngine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY);
        } catch (error) {
          console.warn('⚠️ Ошибка обработки события ALL_PLAYERS_READY:', error.message);
        }
      }
      
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
      
      // Система состояний освещения: игрок готов
      if (lightingEngine && GameEvent) {
        try {
          const playerIndex = room.players.findIndex(p => p.id === socket.id);
          if (playerIndex !== -1) {
            lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_READY, {
              playerIndex: playerIndex
            });
          }
        } catch (error) {
          console.warn('⚠️ Ошибка обработки события PLAYER_READY:', error.message);
        }
      }
      
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
    
    // DMX: игра завершена (старая система)
    if (dmxIntegration) {
      dmxIntegration.onGameFinished(roomCode, finalResults);
    }
    
    // Система состояний освещения: игра завершена
    if (lightingEngine && GameEvent) {
      try {
        const finalResultsWithRank = finalResults.map((player, index) => {
          const playerIndex = room.players.findIndex(p => p.id === player.id);
          return {
            playerIndex: playerIndex !== -1 ? playerIndex : index,
            score: player.score,
            rank: index + 1
          };
        });
        
        lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_FINISHED, {
          finalResults: finalResultsWithRank
        });
        
        // Очищаем комнату через некоторое время
        setTimeout(() => {
          lightingEngine.cleanupRoom(roomCode);
        }, 10000);
      } catch (error) {
        console.warn('⚠️ Ошибка обработки события GAME_FINISHED:', error.message);
      }
    }
  }

  // Отключение
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const room = rooms.get(player.roomCode);
      if (room) {
        // Удаляем игрока из списка
        room.players = room.players.filter(p => p.id !== socket.id);
        room.lastActivity = Date.now(); // Обновляем активность при отключении игрока
        io.to(player.roomCode).emit('player-list-updated', { players: room.players });
        console.log(`Игрок ${player.name} отключился и удален из комнаты ${player.roomCode}`);
      }
      players.delete(socket.id);
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
        // DMX: очистка комнаты (старая система)
        if (dmxIntegration) {
          dmxIntegration.cleanupRoom(code);
        }
        // Система состояний освещения: очистка комнаты
        if (lightingEngine) {
          try {
            lightingEngine.cleanupRoom(code);
          } catch (error) {
            console.warn(`⚠️ Ошибка очистки освещения для комнаты ${code}:`, error.message);
          }
        }
        rooms.delete(code);
        cleanedCount++;
        console.log(`🗑️ Удалена завершенная комната: ${code}`);
      }
    }
    // Удаляем комнаты в лобби без активности более ROOM_TIMEOUT
    else if (room.gameState === 'lobby' && room.lastActivity) {
      if (now - room.lastActivity > ROOM_TIMEOUT) {
        // Система состояний освещения: очистка комнаты
        if (lightingEngine) {
          try {
            lightingEngine.cleanupRoom(code);
          } catch (error) {
            console.warn(`⚠️ Ошибка очистки освещения для комнаты ${code}:`, error.message);
          }
        }
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
  server.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
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
    
    // Обработка очереди рейтинга (для оставшихся записей, если что-то не записалось сразу)
    // Основная запись происходит сразу при сохранении результата через setImmediate
    setInterval(() => {
      if (leaderboardQueue.length > 0) {
        console.log(`⏰ Периодическая проверка: осталось ${leaderboardQueue.length} записей в очереди`);
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

