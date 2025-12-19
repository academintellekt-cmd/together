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

// Локальный режим - условная загрузка модулей
let localModeAvailable = false;
let localModeManager = null;

// Проверяем наличие локальных модулей при старте
try {
  require.resolve('./server/local/local-mode.js');
  localModeAvailable = true;
  console.log('✅ Локальные модули доступны');
} catch (e) {
  console.log('🌐 Локальные модули недоступны (глобальный режим)');
}

// Условная загрузка локального модуля
if (localModeAvailable) {
  try {
    const { getLocalModeManager } = require('./server/local/local-mode.js');
    localModeManager = getLocalModeManager();
    console.log('✅ Локальный режим инициализирован');
  } catch (error) {
    console.warn('⚠️ Ошибка загрузки локального модуля:', error.message);
    localModeManager = null;
  }
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Настройка для правильного определения IP клиента
app.set('trust proxy', true); // Доверяем прокси (для правильного определения IP)

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

// ЧГК API routes
try {
  const { router: chgkApiRouter, intellectualRooms: chgkRooms } = require('./server/routes/chgk-api');
  app.use('/api/chgk', chgkApiRouter);
  // Экспортируем хранилище комнат для использования в WebSocket обработчиках
  global.intellectualRooms = chgkRooms;
  console.log('✅ ЧГК API routes зарегистрированы');
  console.log('✅ global.intellectualRooms установлен, тип:', typeof global.intellectualRooms, 'размер:', global.intellectualRooms ? global.intellectualRooms.size : 'N/A');
} catch (error) {
  console.warn('⚠️ ЧГК API routes недоступны:', error.message);
}

// Редиректы для обратной совместимости (старые имена файлов)
app.get('/quiz-questions-host.html', (req, res) => {
  res.redirect(301, '/chgk-host.html');
});
app.get('/quiz-questions-player.html', (req, res) => {
  res.redirect(301, '/chgk-player.html');
});
app.get('/quiz-questions-commission.html', (req, res) => {
  res.redirect(301, '/chgk-commission.html');
});

// Статический middleware будет зарегистрирован после всех API роутов (см. ниже)
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

// API для работы с режимом игры
app.get('/api/mode', (req, res) => {
  res.json({
    mode: localModeAvailable ? 'available' : 'unavailable',
    currentMode: req.query.mode || 'global'
  });
});

app.post('/api/mode', (req, res) => {
  // Просто подтверждаем получение (режим хранится на клиенте)
  const { mode } = req.body;
  console.log(`📝 Клиент установил режим: ${mode}`);
  res.json({ success: true, mode: mode });
});

// API для локального режима
if (localModeAvailable && localModeManager) {
  console.log('✅ Локальный режим доступен, регистрация API роутов для управления станциями');
  // Регистрация станции
  app.post('/api/local/register-station', (req, res) => {
    // Получаем IP клиента из запроса
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                     (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
                     req.headers['x-real-ip'];
    
    // Нормализуем IP (убираем IPv6 префикс)
    let normalizedClientIp = clientIp;
    if (clientIp && clientIp.startsWith('::ffff:')) {
      normalizedClientIp = clientIp.replace('::ffff:', '');
    }
    
    let { ip, stationNumber } = req.body;
    
    // Если IP не указан, используем IP клиента
    if (!ip && normalizedClientIp) {
      ip = normalizedClientIp;
    }
    
    // Если номер станции не указан, пытаемся определить по IP
    if (!stationNumber && ip) {
      const ipMatch = ip.match(/192\.168\.1\.(\d+)/);
      if (ipMatch) {
        const lastOctet = parseInt(ipMatch[1]);
        if (lastOctet >= 21 && lastOctet <= 29) {
          stationNumber = lastOctet - 20;
        }
      }
    }
    
    if (!ip || !stationNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Не удалось определить IP или номер станции',
        detectedIp: normalizedClientIp || ip,
        suggestion: normalizedClientIp ? 'Попробуйте указать номер станции вручную' : 'Проверьте подключение к сети'
      });
    }
    
    const station = localModeManager.registerStation(ip, stationNumber);
    
    if (station) {
      console.log(`✅ Станция ${stationNumber} зарегистрирована: ${ip} (клиент: ${normalizedClientIp})`);
      
      // Уведомляем всех хостов об обновлении списка станций
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
      
      res.json({ success: true, station });
    } else {
      res.status(400).json({ success: false, error: 'Станция не найдена. Проверьте, что IP находится в диапазоне 192.168.1.21-29' });
    }
  });
  
  // API для определения IP клиента
  app.get('/api/local/detect-ip', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                     (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
                     req.headers['x-real-ip'];
    
    let normalizedClientIp = clientIp;
    if (clientIp && clientIp.startsWith('::ffff:')) {
      normalizedClientIp = clientIp.replace('::ffff:', '');
    }
    
    // Определяем номер станции по IP
    let stationNumber = null;
    if (normalizedClientIp) {
      const ipMatch = normalizedClientIp.match(/192\.168\.1\.(\d+)/);
      if (ipMatch) {
        const lastOctet = parseInt(ipMatch[1]);
        if (lastOctet >= 21 && lastOctet <= 29) {
          stationNumber = lastOctet - 20;
        }
      }
    }
    
    res.json({
      ip: normalizedClientIp,
      stationNumber: stationNumber,
      hostname: req.headers.host || 'unknown'
    });
  });
  
  // Получение списка станций
  app.get('/api/local/stations', (req, res) => {
    const stations = localModeManager.getStations();
    res.json({ stations });
  });

  // ========== УНИВЕРСАЛЬНЫЙ HTTP API ДЛЯ УПРАВЛЕНИЯ СТАНЦИЯМИ ==========
  
  /**
   * Отправка универсальной команды станциям через HTTP API
   * POST /api/local/stations/command
   * Body: { stationNumbers: [1,2,3], command: 'navigate', params: {...} }
   */
  app.post('/api/local/stations/command', (req, res) => {
    try {
      const { stationNumbers, command, params } = req.body;

      if (!command) {
        return res.status(400).json({ 
          success: false, 
          error: 'Команда не указана' 
        });
      }

      // Получаем станции для отправки команды
      const stations = localModeManager.getStationsByNumbers(stationNumbers);
      
      if (stations.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Нет подключенных станций для отправки команды' 
        });
      }

      console.log(`📤 HTTP API: Универсальная команда "${command}" отправляется на станции: ${stations.map(s => s.stationNumber).join(', ')}`);

      const results = [];
      const commandData = {
        command: command,
        params: params || {},
        timestamp: Date.now()
      };

      // Отправляем команду всем выбранным станциям
      stations.forEach(station => {
        // Добавляем команду в очередь (гарантирует доставку даже если Socket.io недоступен)
        localModeManager.enqueueCommand(station.stationNumber, command, params);

        let sentToStation = false;
        let sentToPlayers = 0;

        // Пытаемся отправить через Socket.io (если подключен)
        if (station.connected && station.socketId) {
          // Отправляем универсальную команду через Socket.io
          io.to(station.socketId).emit('local-station-command', commandData);
          sentToStation = true;
          console.log(`✅ HTTP API: Команда "${command}" отправлена через Socket.io станции ${station.stationNumber} (${station.ip})`);
        } else {
          console.log(`📝 HTTP API: Команда "${command}" добавлена в очередь для станции ${station.stationNumber} (Socket.io не подключен, будет получена через polling)`);
        }

        // Также отправляем команду всем игрокам в комнатах, связанным с этой станцией
        const playerSockets = findPlayersForStation(station.stationNumber);
        playerSockets.forEach(({ socketId, playerName, roomCode }) => {
          io.to(socketId).emit('local-station-command', commandData);
          sentToPlayers++;
          console.log(`✅ HTTP API: Команда "${command}" отправлена игроку ${playerName} (socketId: ${socketId}, комната: ${roomCode})`);
        });

        // Обновляем состояние станции в зависимости от команды
        if (command === 'navigate' && params && params.page) {
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: params.page,
            pageData: params.data || {}
          });
        } else if (command === 'update-state' && params) {
          const currentState = station.state.customState || {};
          localModeManager.updateStationState(station.stationNumber, {
            customState: {
              ...currentState,
              ...params
            }
          });
        }

        results.push({
          stationNumber: station.stationNumber,
          ip: station.ip,
          success: true,
          sentViaSocket: sentToStation,
          sentToPlayers: sentToPlayers
        });
      });

      // Уведомляем хостов об обновлении состояния станций
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });

      res.json({ 
        success: true, 
        command: command,
        stationsAffected: results.length,
        results: results 
      });
    } catch (error) {
      console.error('❌ Ошибка отправки команды станциям:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка отправки команды: ' + error.message 
      });
    }
  });

  /**
   * Получение состояния конкретной станции
   * GET /api/local/stations/:stationNumber/state
   */
  app.get('/api/local/stations/:stationNumber/state', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const station = localModeManager.getStationByNumber(stationNumber);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      res.json({ 
        success: true, 
        stationNumber: station.stationNumber,
        state: station.state,
        connected: station.connected,
        lastSeen: station.lastSeen,
        ip: station.ip
      });
    } catch (error) {
      console.error('❌ Ошибка получения состояния станции:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка получения состояния: ' + error.message 
      });
    }
  });

  /**
   * Обновление состояния станции напрямую
   * POST /api/local/stations/:stationNumber/state
   * Body: { state: {...} }
   */
  app.post('/api/local/stations/:stationNumber/state', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const { state } = req.body;

      if (!state) {
        return res.status(400).json({ 
          success: false, 
          error: 'Состояние не указано' 
        });
      }

      const station = localModeManager.updateStationState(stationNumber, state);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      // Уведомляем хостов об обновлении
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });

      res.json({ 
        success: true, 
        stationNumber: station.stationNumber,
        state: station.state
      });
    } catch (error) {
      console.error('❌ Ошибка обновления состояния станции:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка обновления состояния: ' + error.message 
      });
    }
  });

  /**
   * Получение команд из очереди для станции (HTTP polling)
   * GET /api/local/stations/:stationNumber/commands
   * Станция периодически опрашивает этот endpoint для получения команд
   */
  app.get('/api/local/stations/:stationNumber/commands', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const station = localModeManager.getStationByNumber(stationNumber);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена',
          commands: []
        });
      }

      // Обновляем время последнего контакта
      station.lastSeen = Date.now();
      if (!station.connected) {
        station.connected = true;
      }

      // Получаем все команды из очереди
      const commands = localModeManager.dequeueCommands(stationNumber);
      
      console.log(`📥 HTTP Polling: Станция ${stationNumber} запросила команды, получено: ${commands.length}`);

      res.json({ 
        success: true, 
        stationNumber: stationNumber,
        commands: commands,
        state: station.state,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Ошибка получения команд для станции:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка получения команд: ' + error.message,
        commands: []
      });
    }
  });

  /**
   * Получение списка всех станций с их состояниями
   * GET /api/local/stations/status
   */
  app.get('/api/local/stations/status', (req, res) => {
    try {
      const stations = localModeManager.getStations();
      const stationsStatus = stations.map(station => ({
        stationNumber: station.stationNumber,
        ip: station.ip,
        connected: station.connected,
        socketId: station.socketId,
        state: station.state,
        lastSeen: station.lastSeen,
        joystick: station.joystick || null
      }));

      res.json({ 
        success: true, 
        stations: stationsStatus,
        total: stationsStatus.length,
        connected: stationsStatus.filter(s => s.connected).length
      });
    } catch (error) {
      console.error('❌ Ошибка получения статуса станций:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка получения статуса: ' + error.message 
      });
    }
  });

  /**
   * Получение конфигурации джойстика для станции
   * GET /api/local/stations/:stationNumber/joystick-config
   */
  app.get('/api/local/stations/:stationNumber/joystick-config', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const station = localModeManager.getStationByNumber(stationNumber);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      // Сначала пробуем получить конфигурацию станции
      let config = station.joystick?.config;
      
      // Если конфигурации нет, загружаем общую
      if (!config) {
        try {
          const configPath = path.join(__dirname, 'data', 'joystick-config.json');
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
          }
        } catch (error) {
          console.warn('⚠️ Ошибка загрузки общей конфигурации джойстика:', error);
        }
      }

      res.json({ 
        success: true, 
        stationNumber: stationNumber,
        config: config || { buttons: {}, axes: {} },
        joystick: station.joystick || null
      });
    } catch (error) {
      console.error('❌ Ошибка получения конфигурации джойстика:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка получения конфигурации: ' + error.message 
      });
    }
  });

  /**
   * Сохранение конфигурации джойстика для станции
   * POST /api/local/stations/:stationNumber/joystick-config
   */
  app.post('/api/local/stations/:stationNumber/joystick-config', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const config = req.body.config || req.body;
      const station = localModeManager.getStationByNumber(stationNumber);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      // Сохраняем конфигурацию в станцию
      localModeManager.updateJoystickConfig(stationNumber, config);

      // Также сохраняем в файл (общая конфигурация)
      try {
        const configPath = path.join(__dirname, 'data', 'joystick-config.json');
        const dataDir = path.dirname(configPath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`✅ Конфигурация джойстика сохранена для станции ${stationNumber}`);
      } catch (error) {
        console.warn('⚠️ Ошибка сохранения общей конфигурации:', error);
      }

      res.json({ 
        success: true, 
        message: 'Конфигурация сохранена',
        stationNumber: stationNumber
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения конфигурации джойстика:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка сохранения конфигурации: ' + error.message 
      });
    }
  });

  /**
   * Получение статуса джойстика для станции
   * GET /api/local/stations/:stationNumber/joystick-status
   */
  app.get('/api/local/stations/:stationNumber/joystick-status', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const joystick = localModeManager.getJoystickConfig(stationNumber);
      
      if (!joystick) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      res.json({ 
        success: true, 
        stationNumber: stationNumber,
        joystick: joystick
      });
    } catch (error) {
      console.error('❌ Ошибка получения статуса джойстика:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка получения статуса: ' + error.message 
      });
    }
  });

  /**
   * Обновление статуса джойстика для станции
   * POST /api/local/stations/:stationNumber/joystick-status
   */
  app.post('/api/local/stations/:stationNumber/joystick-status', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const { status, error } = req.body;
      const station = localModeManager.getStationByNumber(stationNumber);
      
      if (!station) {
        return res.status(404).json({ 
          success: false, 
          error: 'Станция не найдена' 
        });
      }

      localModeManager.updateJoystickStatus(stationNumber, status, error);

      // Уведомляем хостов об обновлении
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });

      res.json({ 
        success: true, 
        message: 'Статус джойстика обновлен',
        stationNumber: stationNumber,
        joystick: station.joystick
      });
    } catch (error) {
      console.error('❌ Ошибка обновления статуса джойстика:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Ошибка обновления статуса: ' + error.message 
      });
    }
  });

  /**
   * Развертывание файлов на станции
   * POST /api/local/stations/deploy
   * Параметры: { username?, password?, stationPath?, stationNumbers? }
   */
  app.post('/api/local/stations/deploy', (req, res) => {
    const { exec } = require('child_process');
    const { username = 'pi', password = '', stationPath = '/home/pi/together', stationNumbers } = req.body;
    
    // Путь к скрипту развертывания
    const deployScript = path.join(__dirname, 'scripts', 'deploy-to-stations.sh');
    
    if (!fs.existsSync(deployScript)) {
      return res.status(404).json({
        success: false,
        error: 'Скрипт развертывания не найден'
      });
    }

    // Формируем команду
    // Всегда передаем все три параметра для корректной работы скрипта
    let command = `bash "${deployScript}" "${username}" "${password || ''}" "${stationPath || '/home/pi/together'}"`;

    console.log(`🚀 Запуск развертывания на станции...`);
    console.log(`   Команда: ${command.replace(password, '***')}`);

    // Запускаем скрипт в фоновом режиме
    const deployProcess = exec(command, {
      cwd: path.join(__dirname),
      maxBuffer: 10 * 1024 * 1024 // 10MB
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Ошибка развертывания:', error);
      }
    });

    // Собираем вывод
    let output = '';
    let errorOutput = '';

    deployProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log(data.toString());
    });

    deployProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(data.toString());
    });

    deployProcess.on('close', (code) => {
      console.log(`📊 Развертывание завершено с кодом: ${code}`);
    });

    // Отправляем ответ сразу (асинхронное выполнение)
    res.json({
      success: true,
      message: 'Развертывание запущено',
      pid: deployProcess.pid,
      note: 'Проверьте логи сервера для отслеживания прогресса'
    });
  });

  /**
   * Получение статуса развертывания (если нужно отслеживать прогресс)
   * GET /api/local/stations/deploy/status
   */
  app.get('/api/local/stations/deploy/status', (req, res) => {
    // Здесь можно добавить логику отслеживания статуса развертывания
    // Пока просто возвращаем информацию о станциях
    try {
      const stations = localModeManager.getStations();
      res.json({
        success: true,
        stations: stations.map(s => ({
          stationNumber: s.stationNumber,
          ip: s.ip,
          connected: s.connected,
          lastSeen: s.lastSeen
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
} else {
  console.warn('⚠️ Локальный режим недоступен - роуты управления станциями не будут зарегистрированы');
  console.warn('   localModeAvailable:', localModeAvailable, 'localModeManager:', !!localModeManager);
}

// Статический middleware - после всех API роутов (включая локальный режим)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')));
app.use('/joystick-test', express.static(path.join(__dirname, 'tests/joystick-test')));
app.use('/data/media', express.static(path.join(__dirname, 'data/media')));

// Получение IP-адреса сервера и клиента
app.get('/api/server-ip', (req, res) => {
  // Получаем IP-адрес клиента из запроса
  const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                   (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
                   req.headers['x-real-ip'];
  
  // Получаем локальный IP-адрес сервера
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let serverIp = 'localhost';
  
  // Нормализуем IP клиента (убираем IPv6 префикс если есть)
  let normalizedClientIp = clientIp;
  if (clientIp && clientIp.startsWith('::ffff:')) {
    normalizedClientIp = clientIp.replace('::ffff:', '');
  }
  
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
    url: `http://${serverIp}:${port}`,
    clientIp: normalizedClientIp || clientIp
  });
});

// Создание комнаты
app.post('/api/create-room', (req, res) => {
  const { quizId, password, mode } = req.body;
  
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
  
  // Определяем режим комнаты
  const roomMode = (mode === 'local' && localModeAvailable && localModeManager) ? 'local' : 'global';
  
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
    lastActivity: Date.now(), // Время последней активности
    mode: roomMode // Режим комнаты: 'local' или 'global'
  };
  rooms.set(roomCode, room);
  
  // Если локальный режим - инициализируем локальную логику
  if (roomMode === 'local' && localModeManager) {
    localModeManager.initializeRoom(roomCode);
    console.log(`🏠 Локальная комната ${roomCode} инициализирована`);
  }
  
  console.log(`📋 Комната ${roomCode} создана (режим: ${roomMode}): ${questionsForRoom.length} вопросов (из ${quiz.questions.length} доступных)`);
  console.log(`📋 Первые 3 вопроса комнаты:`, questionsForRoom.slice(0, 3).map(q => q.id || 'no-id'));
  
  res.json({ roomCode, mode: roomMode });
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

/**
 * Найти всех игроков в комнатах, связанных со станцией
 * Ищет игроков по имени вида "Игрок №X" где X - номер станции
 */
function findPlayersForStation(stationNumber) {
  const playerSockets = [];
  
  // Проходим по всем комнатам
  rooms.forEach((room, roomCode) => {
    if (!room.players) return;
    
    // Ищем игроков с именем вида "Игрок №X" или "ИГРОК №X"
    const stationPlayerNamePattern = new RegExp(`игрок\\s*№?\\s*${stationNumber}`, 'i');
    
    room.players.forEach(player => {
      if (player.name && stationPlayerNamePattern.test(player.name) && !player.disconnected) {
        // Проверяем, что socket существует
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSockets.push({
            socketId: player.id,
            playerName: player.name,
            roomCode: roomCode
          });
        }
      }
    });
  });
  
  return playerSockets;
}

// Подключение через Socket.io
io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);
  console.log('localModeAvailable:', localModeAvailable, 'localModeManager:', !!localModeManager);

  // Хост подключается к комнате
  socket.on('host-join', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    // Устанавливаем хостом только если хост еще не установлен, или если это первый хост
    // Это позволяет нескольким окнам управления быть подключены одновременно
    if (!room.host) {
      room.host = socket.id;
      console.log(`🎮 Основной хост установлен для комнаты ${roomCode}: ${socket.id}`);
    } else {
      console.log(`📡 Дополнительный хост подключен к комнате ${roomCode}: ${socket.id} (основной хост: ${room.host})`);
    }
    room.lastActivity = Date.now(); // Обновляем активность при подключении хоста
    socket.join(roomCode);
    socket.emit('host-connected', { roomCode, players: room.players });
    console.log(`Хост подключен к комнате ${roomCode}, состояние игры: ${room.gameState}`);
    
    // Если игра уже началась, отправляем текущее состояние хосту
    if (room.gameState === 'question' && room.currentQuestion < room.questions.length) {
      // Отправляем текущий вопрос
      const question = room.questions[room.currentQuestion];
      const questionData = {
        question: question.question,
        options: question.options,
        questionNumber: room.currentQuestion + 1,
        totalQuestions: room.questions.length,
        time: question.time,
        quizId: room.quizId
      };
      socket.emit('question', questionData);
      console.log(`📤 Отправлен текущий вопрос ${questionData.questionNumber} хосту при подключении`);
      
      // Отправляем текущий статус ответов
      updateAnswerStatus(roomCode);
      
      // Вычисляем оставшееся время и обновляем данные вопроса
      if (room.startTime) {
        const elapsed = Date.now() - room.startTime;
        const remaining = Math.max(0, Math.floor((question.time * 1000 - elapsed) / 1000));
        if (remaining > 0 && remaining < question.time) {
          // Обновляем время в данных вопроса для правильного отображения таймера
          questionData.time = remaining;
        }
      }
    } else if (room.gameState === 'results' && room.currentQuestion < room.questions.length) {
      // Отправляем текущие результаты
      const question = room.questions[room.currentQuestion];
      const results = Array.from(room.answers.values());
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      socket.emit('results', {
        correctAnswer: question.correct,
        correctAnswerText: question.options[question.correct],
        results: results,
        players: sortedPlayers
      });
      console.log(`📤 Отправлены текущие результаты хосту при подключении`);
      
      // Отправляем текущий статус готовности
      setTimeout(() => {
        updateReadyStatus(roomCode);
      }, 100);
    } else if (room.gameState === 'playing') {
      // Игра началась, но вопрос еще не показан
      socket.emit('game-started');
      console.log(`📤 Отправлено событие game-started хосту при подключении`);
    } else if (room.gameState === 'finished') {
      // Игра завершена, отправляем финальные результаты
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      socket.emit('game-finished', {
        results: sortedPlayers
      });
      console.log(`📤 Отправлены финальные результаты хосту при подключении`);
    }
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
          timeElapsed: room.questionStartTime ? Math.floor((Date.now() - room.questionStartTime) / 1000) : undefined
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
    console.log(`📥 Получено событие start-game для комнаты ${roomCode} от socket.id=${socket.id}`);
    const room = rooms.get(roomCode);
    if (!room) {
      console.warn(`⚠️ Комната ${roomCode} не найдена при попытке начать игру`);
      socket.emit('error', { message: `Комната ${roomCode} не найдена` });
      return;
    }
    
    console.log(`🔍 Проверка прав для запуска игры: room.mode=${room.mode}, room.host=${room.host}, socket.id=${socket.id}`);
    
    // В локальном режиме разрешаем любому хосту запускать игру (проверяем что подключен к комнате)
    // В обычном режиме проверяем что это основной хост
    const isLocalMode = room.mode === 'local';
    const socketRooms = Array.from(socket.rooms || []);
    const isInRoom = socket.rooms && socket.rooms.has(roomCode);
    
    console.log(`🔍 Детали проверки: isLocalMode=${isLocalMode}, isInRoom=${isInRoom}, socket.rooms=[${socketRooms.join(', ')}]`);
    
    const canStart = isLocalMode 
      ? isInRoom  // В локальном режиме - любой хост в комнате
      : (room.host === socket.id);   // В обычном режиме - только основной хост
    
    if (!canStart) {
      console.warn(`⚠️ Попытка начать игру из неподключенного хоста: roomCode=${roomCode}, mode=${room.mode}, socket.id=${socket.id}, isInRoom=${isInRoom}, canStart=${canStart}`);
      socket.emit('error', { message: 'Недостаточно прав для запуска игры. Убедитесь, что вы подключены к комнате как хост.' });
      return;
    }
    
    console.log(`✅ Права подтверждены, начинаем игру для комнаты ${roomCode}`);
    console.log(`📊 Игроков в комнате: ${room.players.length}`);
    
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
    console.log(`🎮 Функция endGame вызвана для комнаты: ${roomCode}`);
    const room = rooms.get(roomCode);
    if (!room) {
      console.warn(`⚠️ Комната ${roomCode} не найдена в функции endGame`);
      return;
    }

    console.log(`📊 Комната найдена: mode=${room.mode}, players=${room.players.length}, gameState=${room.gameState}`);
    
    room.gameState = 'finished';
    room.lastActivity = Date.now(); // Обновляем активность
    const finalResults = room.players.sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('game-finished', {
      results: finalResults
    });
    
    console.log(`📤 Событие game-finished отправлено в комнату ${roomCode}`);
    
    // Если это локальная комната, отправляем команду станциям вернуться в режим ожидания
    if (room.mode === 'local' && localModeAvailable && localModeManager) {
      console.log(`🔧 Локальный режим: отправка команд станциям для возврата в режим ожидания`);
      // Получаем все станции, которые участвуют в игре (по игрокам)
      const stationNumbers = new Set();
      console.log(`👥 Игроки в комнате: ${room.players.map(p => p.name).join(', ')}`);
      
      room.players.forEach(player => {
        // Извлекаем номер станции из имени игрока (например, "Игрок №1" -> 1)
        const match = player.name.match(/игрок\s*№?(\d+)/i);
        if (match) {
          const stationNum = parseInt(match[1]);
          stationNumbers.add(stationNum);
          console.log(`📍 Найдена станция ${stationNum} для игрока ${player.name}`);
        } else {
          console.log(`⚠️ Не удалось определить номер станции для игрока: ${player.name}`);
        }
      });
      
      console.log(`📋 Найдено станций по игрокам: ${Array.from(stationNumbers).join(', ')}`);
      
      // Если не нашли станции по игрокам, отправляем всем подключенным станциям
      const allStations = localModeManager.getStations();
      const connectedStations = allStations.filter(s => s.connected);
      console.log(`🔌 Всего подключенных станций: ${connectedStations.length}`);
      
      const stationsToNotify = stationNumbers.size > 0
        ? localModeManager.getStationsByNumbers(Array.from(stationNumbers))
        : connectedStations;
      
      console.log(`📤 Отправка команды возврата в режим ожидания на станции: ${stationsToNotify.map(s => `${s.stationNumber}(${s.ip}, socketId: ${s.socketId ? 'есть' : 'нет'})`).join(', ')}`);
      
      stationsToNotify.forEach(station => {
        console.log(`🔍 Обработка станции ${station.stationNumber}: connected=${station.connected}, socketId=${station.socketId}`);
        
        if (station.connected && station.socketId) {
          // Используем универсальную систему команд для надежности
          const commandData = {
            command: 'navigate',
            params: {
              page: 'waiting'
            },
            timestamp: Date.now()
          };
          
          console.log(`📤 Отправка local-station-command станции ${station.stationNumber} (socketId: ${station.socketId}):`, commandData);
          io.to(station.socketId).emit('local-station-command', commandData);
          
          // Также отправляем старое событие для обратной совместимости
          console.log(`📤 Отправка local-station-return-to-waiting станции ${station.stationNumber}`);
          io.to(station.socketId).emit('local-station-return-to-waiting');
          
          console.log(`✅ Команда возврата в режим ожидания отправлена станции ${station.stationNumber} (${station.ip})`);
          
          // Обновляем состояние станции
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: 'waiting',
            pageData: {}
          });
        } else {
          console.warn(`⚠️ Станция ${station.stationNumber} не подключена или нет socketId: connected=${station.connected}, socketId=${station.socketId}`);
        }
      });
      
      // Также отправляем команду всем игрокам в комнате, которые могут быть на странице player.html
      console.log(`👥 Отправка команд игрокам в комнате (${room.players.length} игроков)`);
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          const commandData = {
            command: 'navigate',
            params: {
              page: 'waiting'
            },
            timestamp: Date.now()
          };
          
          console.log(`📤 Отправка local-station-command игроку ${player.name} (ID: ${player.id}):`, commandData);
          // Отправляем команду навигации игроку
          playerSocket.emit('local-station-command', commandData);
          
          // Также отправляем старое событие для обратной совместимости
          console.log(`📤 Отправка local-station-return-to-waiting игроку ${player.name}`);
          playerSocket.emit('local-station-return-to-waiting');
          
          console.log(`✅ Команда возврата в режим ожидания отправлена игроку ${player.name} (ID: ${player.id})`);
        } else {
          console.warn(`⚠️ Сокет игрока ${player.name} (ID: ${player.id}) не найден`);
        }
      });
      
      console.log(`✅ Завершена отправка команд для возврата станций в режим ожидания`);
    }
    
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

  // ========== ОБРАБОТЧИКИ ДЛЯ ЧГК (ИНТЕЛЛЕКТУАЛЬНАЯ ИГРА) ==========
  
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
      console.error('❌ global.intellectualRooms:', global.intellectualRooms);
      socket.emit('error', { message: 'Система интеллектуальной игры недоступна' });
      return;
    }
    
    if (!normalizedRoomCode || !normalizedPlayerName) {
      console.error('❌ Не указаны roomCode или playerName');
      socket.emit('error', { message: 'Не указаны код комнаты или имя игрока' });
      return;
    }
    
    console.log(`🔍 Поиск комнаты ${normalizedRoomCode} в ${intellectualRooms.size} комнатах`);
    console.log(`🔍 Доступные комнаты:`, Array.from(intellectualRooms.keys()));
    
    const room = intellectualRooms.get(normalizedRoomCode);
    if (!room) {
      console.error(`❌ Комната ${normalizedRoomCode} не найдена.`);
      console.error(`📋 Доступные комнаты:`, Array.from(intellectualRooms.keys()));
      console.error(`📋 Всего комнат: ${intellectualRooms.size}`);
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
            timeElapsed: room.questionStartTime ? Math.floor((Date.now() - room.questionStartTime) / 1000) : undefined
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
            timeElapsed: room.questionStartTime ? Math.floor((Date.now() - room.questionStartTime) / 1000) : undefined,
            // Показываем правильный ответ для всех вопросов
            answer: question.answer
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
            options: question.options,
            // Показываем правильный ответ для всех вопросов
            answer: question.answer
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
    room.questionStartTime = null; // Время начала будет установлено при запуске таймера
    room.answers.clear();
    room.verifiedAnswers.clear();
    room.lastActivity = Date.now();

    io.to(roomCode).emit('intellectual-question-started', {
      question: question,
      questionIndex: room.currentQuestion,
      totalQuestions: room.questions.length,
      time: question.time || 60 // Время в секундах из вопроса или 60 по умолчанию
    });

    console.log(`❓ Начат вопрос ${room.currentQuestion + 1} в комнате ${roomCode}`);
  });

  // Запуск таймера (кнопка "Время пошло" на комиссии)
  socket.on('intellectual-start-timer', (roomCode) => {
    const intellectualRooms = global.intellectualRooms;
    if (!intellectualRooms) return;
    
    const room = intellectualRooms.get(roomCode);
    // Разрешаем как хосту, так и комиссии запускать таймер
    if (!room || (room.host !== socket.id && room.commission !== socket.id)) return;
    if (room.gameState !== 'question') return; // Таймер можно запустить только во время вопроса
    
    const question = room.questions[room.currentQuestion];
    if (!question) return;
    
    // Устанавливаем время начала вопроса
    room.questionStartTime = Date.now();
    
    // Отправляем событие всем в комнате о запуске таймера
    io.to(roomCode).emit('intellectual-timer-started', {
      questionIndex: room.currentQuestion,
      time: question.time || 60 // Время в секундах из вопроса или 60 по умолчанию
    });
    
    console.log(`⏱️ Таймер запущен для вопроса ${room.currentQuestion + 1} в комнате ${roomCode}`);
    
    // Устанавливаем таймер на сервере для автоматического завершения вопроса
    const timer = setTimeout(() => {
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
    }, (question.time || 60) * 1000);
    
    // Сохраняем таймер в комнате для возможности отмены
    if (!room.timers) room.timers = new Map();
    room.timers.set('question', timer);
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
  // Локальный режим - Socket.io события
  if (localModeAvailable && localModeManager) {
    // Подключение станции
    socket.on('local-station-connect', (data) => {
      console.log('📥 Получено событие local-station-connect:', data);
      const { ip, stationNumber } = data;
      
      if (!ip || !stationNumber) {
        console.warn('⚠️ Не указаны IP или номер станции:', { ip, stationNumber });
        socket.emit('error', { message: 'Не указаны IP или номер станции' });
        return;
      }
      
      console.log(`🔍 Регистрация станции: IP=${ip}, номер=${stationNumber}`);
      const station = localModeManager.registerStation(ip, stationNumber);
      
      if (station) {
        console.log(`✅ Станция ${stationNumber} подключена через Socket.io: ${ip}`);
        // Сохраняем socket.id для станции используя новый метод
        const updatedStation = localModeManager.setStationSocketId(stationNumber, socket.id);
        
        if (updatedStation) {
          console.log(`✅ Socket ID ${socket.id} сохранен для станции ${stationNumber}`);
        } else {
          console.warn(`⚠️ Не удалось сохранить socket ID для станции ${stationNumber}`);
        }

        // Отправляем все накопленные команды из очереди при переподключении
        const queuedCommands = localModeManager.dequeueCommands(stationNumber);
        if (queuedCommands.length > 0) {
          console.log(`📤 Отправка ${queuedCommands.length} накопленных команд станции ${stationNumber} при переподключении`);
          queuedCommands.forEach(cmd => {
            socket.emit('local-station-command', {
              command: cmd.command,
              params: cmd.params,
              timestamp: cmd.timestamp
            });
          });
        }
        
        // Отправляем подтверждение станции вместе с текущим состоянием
        socket.emit('local-station-connected', {
          success: true,
          stationNumber: stationNumber,
          ip: ip,
          state: station.state,
          queuedCommandsCount: queuedCommands.length
        });
        
        // Уведомляем всех хостов об обновлении
        io.emit('local-stations-updated', {
          stations: localModeManager.getStations()
        });
        
        console.log(`📤 Уведомление о подключении станции ${stationNumber} отправлено всем хостам`);
      } else {
        console.error(`❌ Не удалось зарегистрировать станцию: IP=${ip}, номер=${stationNumber}`);
        socket.emit('error', { message: 'Не удалось зарегистрировать станцию' });
      }
    });

    // Подключение хоста локального режима
    socket.on('local-host-connect', () => {
      console.log('✅ Хост локального режима подключен');
      // Отправляем текущий список станций
      socket.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
    });

    // Запуск квиза на выбранных станциях
    socket.on('local-start-quiz', (data) => {
      const { roomCode, quizId, stationNumbers } = data;
      console.log(`🏠 Запуск локального квиза: комната ${roomCode}, квиз ${quizId}, станции: ${stationNumbers ? stationNumbers.join(', ') : 'все'}`);
      
      // Отправляем команду только выбранным станциям
      const stations = stationNumbers && stationNumbers.length > 0
        ? localModeManager.getStationsByNumbers(stationNumbers)
        : localModeManager.getStations().filter(s => s.connected);

      stations.forEach(station => {
        // Добавляем команду в очередь (гарантирует доставку)
        localModeManager.enqueueCommand(station.stationNumber, 'navigate', {
          page: 'quiz',
          roomCode: roomCode,
          quizId: quizId
        });

        // Обновляем состояние станции
        localModeManager.updateStationState(station.stationNumber, {
          currentPage: 'quiz',
          pageData: { roomCode, quizId }
        });

        // Пытаемся отправить через Socket.io (если подключен)
        if (station.connected && station.socketId) {
          // Отправляем универсальную команду через Socket.io
          io.to(station.socketId).emit('local-station-command', {
            command: 'navigate',
            params: {
              page: 'quiz',
              roomCode: roomCode,
              quizId: quizId
            },
            timestamp: Date.now()
          });
          
          // Также отправляем старое событие для обратной совместимости
          io.to(station.socketId).emit('local-station-open-quiz', {
            roomCode: roomCode,
            quizId: quizId
          });
          
          console.log(`✅ Команда запуска квиза отправлена через Socket.io станции ${station.stationNumber} (${station.ip})`);
        } else {
          console.log(`📝 Команда запуска квиза добавлена в очередь для станции ${station.stationNumber} (Socket.io не подключен, будет получена через polling)`);
        }
      });

      // Уведомляем хостов об обновлении
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
    });

    // Обновление станции
    socket.on('local-station-refresh', (data) => {
      const { stationNumber, socketId } = data;
      if (socketId) {
        io.to(socketId).emit('local-station-refresh');
        console.log(`🔄 Обновление станции ${stationNumber}`);
      }
    });

    // Перезагрузка станции
    socket.on('local-station-reload', (data) => {
      const { stationNumber, socketId } = data;
      if (socketId) {
        io.to(socketId).emit('local-station-reload');
        console.log(`🔁 Перезагрузка станции ${stationNumber}`);
      }
    });

    // Пропуск ожидания ответов
    socket.on('local-skip-answers', (data) => {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      // В локальном режиме разрешаем любому хосту выполнять команды (проверяем что подключен к комнате)
      if (!room || room.mode !== 'local' || !socket.rooms.has(roomCode)) {
        console.warn(`⚠️ Попытка пропустить ответы из неподключенного хоста: roomCode=${roomCode}, socket.id=${socket.id}`);
        return;
      }
      
      // Если игра в состоянии вопроса, сразу показываем результаты
      if (room.gameState === 'question') {
        console.log(`⏭️ Пропуск ожидания ответов в комнате ${roomCode}`);
        showResults(roomCode);
      }
    });

    // Пропуск ожидания готовности
    socket.on('local-skip-ready', (data) => {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      // В локальном режиме разрешаем любому хосту выполнять команды (проверяем что подключен к комнате)
      if (!room || room.mode !== 'local' || !socket.rooms.has(roomCode)) {
        console.warn(`⚠️ Попытка пропустить готовность из неподключенного хоста: roomCode=${roomCode}, socket.id=${socket.id}`);
        return;
      }
      
      // Если игра в состоянии результатов, переходим к следующему вопросу
      if (room.gameState === 'results') {
        console.log(`⏭️ Пропуск ожидания готовности в комнате ${roomCode}`);
        room.currentQuestion++;
        if (room.currentQuestion < room.questions.length) {
          showQuestion(roomCode);
        } else {
          endGame(roomCode);
        }
      }
    });

    // Принудительный показ результатов
    socket.on('local-show-results', (data) => {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      // В локальном режиме разрешаем любому хосту выполнять команды (проверяем что подключен к комнате)
      if (!room || room.mode !== 'local' || !socket.rooms.has(roomCode)) {
        console.warn(`⚠️ Попытка показать результаты из неподключенного хоста: roomCode=${roomCode}, socket.id=${socket.id}`);
        return;
      }
      
      if (room.gameState === 'question') {
        console.log(`📊 Принудительный показ результатов в комнате ${roomCode}`);
        showResults(roomCode);
      }
    });

    // Завершение игры
    socket.on('local-end-game', (data) => {
      const { roomCode } = data;
      const room = rooms.get(roomCode);
      // В локальном режиме разрешаем любому хосту выполнять команды (проверяем что подключен к комнате)
      if (!room || room.mode !== 'local' || !socket.rooms.has(roomCode)) {
        console.warn(`⚠️ Попытка завершить игру из неподключенного хоста: roomCode=${roomCode}, socket.id=${socket.id}`);
        return;
      }
      
      console.log(`🏁 Принудительное завершение игры в комнате ${roomCode}`);
      endGame(roomCode);
    });

    // Завершение игры на станциях (вернуть их в режим ожидания)
    socket.on('local-end-game-on-stations', (data) => {
      const { stationNumbers } = data;
      if (!stationNumbers || !Array.isArray(stationNumbers)) return;
      
      console.log(`🛑 Завершение игры на станциях: ${stationNumbers.join(', ')}`);
      
      const stations = localModeManager.getStations();
      stations.forEach(station => {
        if (station.connected && station.socketId && stationNumbers.includes(station.stationNumber)) {
          io.to(station.socketId).emit('local-station-return-to-waiting');
          console.log(`📤 Команда возврата в режим ожидания отправлена станции ${station.stationNumber} (${station.ip})`);
        }
      });
    });

    // Завершение квиза на станциях (вернуть их на начальную страницу local-station.html)
    socket.on('local-end-quiz-on-stations', (data) => {
      const { stationNumbers } = data || {};
      
      const stations = localModeManager.getStations();
      const connectedStations = stations.filter(s => s.connected && s.socketId);
      
      // Если stationNumbers не указан, отправляем команду всем подключенным станциям
      const stationsToEnd = stationNumbers && Array.isArray(stationNumbers) 
        ? connectedStations.filter(s => stationNumbers.includes(s.stationNumber))
        : connectedStations;
      
      if (stationsToEnd.length === 0) {
        console.log('⚠️ Нет подключенных станций для завершения квиза');
        return;
      }
      
      console.log(`🛑 Завершение квиза на станциях: ${stationsToEnd.map(s => s.stationNumber).join(', ')}`);
      
      stationsToEnd.forEach(station => {
        // Отправляем команду на socketId станции (если она на local-station.html)
        if (station.socketId) {
          io.to(station.socketId).emit('local-station-end-quiz');
          console.log(`📤 Команда завершения квиза отправлена станции ${station.stationNumber} (socketId: ${station.socketId})`);
        }
        
        // Также отправляем команду всем игрокам в комнатах, связанным с этой станцией
        const playerSockets = findPlayersForStation(station.stationNumber);
        playerSockets.forEach(({ socketId, playerName, roomCode }) => {
          io.to(socketId).emit('local-station-end-quiz');
          console.log(`📤 Команда завершения квиза отправлена игроку ${playerName} (socketId: ${socketId}, комната: ${roomCode})`);
        });
        
        // Также отправляем универсальную команду навигации
        const commandData = {
          command: 'navigate',
          params: {
            page: 'waiting'
          },
          timestamp: Date.now()
        };
        
        if (station.socketId) {
          io.to(station.socketId).emit('local-station-command', commandData);
        }
        
        playerSockets.forEach(({ socketId }) => {
          io.to(socketId).emit('local-station-command', commandData);
        });
      });
    });

    // ========== УНИВЕРСАЛЬНАЯ СИСТЕМА УПРАВЛЕНИЯ СТАНЦИЯМИ ==========
    
    /**
     * Универсальная команда для управления станциями
     * Поддерживает команды: navigate, update-state, update-content, execute-action, custom
     */
    socket.on('local-station-command', (data) => {
      const { stationNumbers, command, params } = data;
      
      if (!command) {
        console.warn('⚠️ Команда не указана');
        socket.emit('error', { message: 'Команда не указана' });
        return;
      }

      // Получаем станции для отправки команды
      const stations = localModeManager.getStationsByNumbers(stationNumbers);
      
      if (stations.length === 0) {
        console.warn('⚠️ Нет подключенных станций для отправки команды');
        socket.emit('error', { message: 'Нет подключенных станций' });
        return;
      }

      console.log(`📤 Универсальная команда "${command}" отправляется на станции: ${stations.map(s => s.stationNumber).join(', ')}`);

      // Отправляем команду всем выбранным станциям
      stations.forEach(station => {
        // Добавляем команду в очередь (гарантирует доставку даже если Socket.io отключится)
        localModeManager.enqueueCommand(station.stationNumber, command, params);

        const commandData = {
          command: command,
          params: params || {},
          timestamp: Date.now()
        };

        // Пытаемся отправить через Socket.io (если подключен)
        if (station.connected && station.socketId) {
          // Отправляем универсальную команду на socketId станции
          io.to(station.socketId).emit('local-station-command', commandData);
          console.log(`✅ Команда "${command}" отправлена через Socket.io станции ${station.stationNumber} (socketId: ${station.socketId})`);
        } else {
          console.log(`📝 Команда "${command}" добавлена в очередь для станции ${station.stationNumber} (Socket.io не подключен, будет получена через polling)`);
        }

        // Также отправляем команду всем игрокам в комнатах, связанным с этой станцией
        const playerSockets = findPlayersForStation(station.stationNumber);
        playerSockets.forEach(({ socketId, playerName, roomCode }) => {
          io.to(socketId).emit('local-station-command', commandData);
          console.log(`✅ Команда "${command}" отправлена игроку ${playerName} (socketId: ${socketId}, комната: ${roomCode})`);
        });

        // Обновляем состояние станции в зависимости от команды
        if (command === 'navigate' && params && params.page) {
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: params.page,
            pageData: params.data || {}
          });
        } else if (command === 'update-state' && params) {
          const currentState = station.state.customState || {};
          localModeManager.updateStationState(station.stationNumber, {
            customState: {
              ...currentState,
              ...params
            }
          });
        }
      });

      // Уведомляем хостов об обновлении состояния станций
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
    });

    /**
     * Получение статуса от станции
     * Станции могут отправлять свой статус обратно на сервер
     */
    socket.on('local-station-status', (data) => {
      const { stationNumber, status, state, data: statusData } = data;
      
      if (!stationNumber) {
        console.warn('⚠️ Номер станции не указан в статусе');
        return;
      }

      const station = localModeManager.getStationByNumber(stationNumber);
      if (station && station.socketId === socket.id) {
        // Обновляем состояние станции
        if (state) {
          localModeManager.updateStationState(stationNumber, {
            ...state,
            lastUpdate: Date.now()
          });
        }

        console.log(`📥 Статус от станции ${stationNumber}: ${status || 'unknown'}`);
        
        // Уведомляем хостов об обновлении статуса
        io.emit('local-station-status-updated', {
          stationNumber: stationNumber,
          status: status,
          state: station.state,
          data: statusData,
          timestamp: Date.now()
        });
      }
    });

    /**
     * Получение текущего состояния станции
     */
    socket.on('local-station-get-state', (data) => {
      const { stationNumber } = data;
      
      if (!stationNumber) {
        socket.emit('error', { message: 'Номер станции не указан' });
        return;
      }

      const station = localModeManager.getStationByNumber(stationNumber);
      if (station) {
        socket.emit('local-station-state', {
          stationNumber: stationNumber,
          state: station.state,
          connected: station.connected,
          lastSeen: station.lastSeen
        });
      } else {
        socket.emit('error', { message: 'Станция не найдена' });
      }
    });

    // ========== КОМАНДЫ УПРАВЛЕНИЯ ЖИЗНЕННЫМ ЦИКЛОМ КВИЗА ==========

    /**
     * Завершить квиз и сбросить регистрации
     */
    socket.on('local-end-quiz-and-reset', (data) => {
      const { stationNumbers, roomCode, clearRoom, returnToWaiting } = data;
      
      console.log(`🔄 Завершение квиза и сброс: комната ${roomCode}, станции: ${stationNumbers || 'все'}`);
      
      // 1. Завершаем текущую игру, если комната существует
      if (roomCode && clearRoom !== false) {
        const room = rooms.get(roomCode);
        if (room) {
          // Отключаем всех игроков от комнаты
          room.players.forEach(player => {
            const playerSocketId = player.id;
            const playerSocket = io.sockets.sockets.get(playerSocketId);
            if (playerSocket) {
              playerSocket.leave(roomCode);
              // Отправляем событие об окончании игры
              playerSocket.emit('game-finished', { results: room.players });
            }
            // Удаляем игрока из глобального списка
            players.delete(playerSocketId);
          });
          
          // Удаляем комнату
          rooms.delete(roomCode);
          console.log(`🗑️ Комната ${roomCode} удалена`);
        }
      }
      
      // 2. Возвращаем станции в режим ожидания
      const stations = stationNumbers 
        ? localModeManager.getStationsByNumbers(stationNumbers)
        : localModeManager.getStations().filter(s => s.connected);
      
      stations.forEach(station => {
        if (station.connected && station.socketId) {
          if (returnToWaiting !== false) {
            io.to(station.socketId).emit('local-station-command', {
              command: 'navigate',
              params: { page: 'waiting' },
              timestamp: Date.now()
            });
          }
          
          // Очищаем состояние станции
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: 'waiting',
            pageData: {},
            customState: {}
          });
          
          console.log(`✅ Станция ${station.stationNumber} сброшена в режим ожидания`);
        }
      });
      
      // Уведомляем хостов об обновлении
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
      
      socket.emit('local-quiz-reset-complete', {
        success: true,
        stationsReset: stations.length
      });
    });

    /**
     * Начать новый квиз на станциях
     */
    socket.on('local-start-new-quiz', (data) => {
      const { stationNumbers, roomCode, quizId, autoConnect, playerNames } = data;
      
      if (!roomCode || !quizId) {
        socket.emit('error', { message: 'Не указаны roomCode или quizId' });
        return;
      }
      
      console.log(`🚀 Запуск нового квиза: комната ${roomCode}, квиз ${quizId}, станции: ${stationNumbers || 'все'}`);
      
      // Отправляем команду навигации на станции
      const stations = stationNumbers 
        ? localModeManager.getStationsByNumbers(stationNumbers)
        : localModeManager.getStations().filter(s => s.connected);
      
      stations.forEach(station => {
        if (station.connected && station.socketId) {
          const playerName = playerNames && playerNames[station.stationNumber] 
            ? playerNames[station.stationNumber]
            : `Игрок №${station.stationNumber}`;
          
          io.to(station.socketId).emit('local-station-command', {
            command: 'navigate',
            params: {
              page: 'quiz',
              roomCode: roomCode,
              quizId: quizId,
              autoConnect: autoConnect !== false,
              playerName: playerName
            },
            timestamp: Date.now()
          });
          
          // Обновляем состояние станции
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: 'quiz',
            pageData: {
              roomCode: roomCode,
              quizId: quizId,
              playerName: playerName
            }
          });
          
          console.log(`✅ Команда запуска квиза отправлена станции ${station.stationNumber}`);
        }
      });
      
      // Уведомляем хостов об обновлении
      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });
      
      socket.emit('local-quiz-started', {
        success: true,
        roomCode: roomCode,
        quizId: quizId,
        stations: stations.map(s => s.stationNumber)
      });
    });

    // ========== КОМАНДЫ УПРАВЛЕНИЯ ИГРОКАМИ ==========

    /**
     * Вспомогательная функция для поиска игрока по номеру станции
     */
    function findPlayerByStation(stationNumber, roomCode = null) {
      // Ищем игрока по имени, которое соответствует станции
      const expectedName = `Игрок №${stationNumber}`;
      const expectedNameLower = expectedName.toLowerCase();
      
      // Если указана комната, ищем в ней
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          const player = room.players.find(p => {
            const playerNameLower = (p.name || '').trim().toLowerCase();
            return playerNameLower === expectedNameLower || 
                   playerNameLower.includes(`игрок №${stationNumber}`) ||
                   playerNameLower.includes(`игрок${stationNumber}`);
          });
          if (player) {
            return { player, room };
          }
        }
      } else {
        // Ищем во всех комнатах
        for (const [code, room] of rooms.entries()) {
          const player = room.players.find(p => {
            const playerNameLower = (p.name || '').trim().toLowerCase();
            return playerNameLower === expectedNameLower || 
                   playerNameLower.includes(`игрок №${stationNumber}`) ||
                   playerNameLower.includes(`игрок${stationNumber}`);
          });
          if (player) {
            return { player, room: room };
          }
        }
      }
      
      return null;
    }

    /**
     * Управление действиями игроков
     */
    socket.on('local-player-action', (data) => {
      const { stationNumbers, action, params, roomCode } = data;
      
      if (!action) {
        socket.emit('error', { message: 'Действие не указано' });
        return;
      }
      
      const stations = stationNumbers 
        ? localModeManager.getStationsByNumbers(stationNumbers)
        : localModeManager.getStations().filter(s => s.connected);
      
      console.log(`🎮 Выполнение действия "${action}" для игроков на станциях: ${stations.map(s => s.stationNumber).join(', ')}`);
      
      stations.forEach(station => {
        // Получаем сокет станции для отправки команд навигации
        const stationSocket = station.socketId ? io.sockets.sockets.get(station.socketId) : null;
        
        // Ищем игрока в комнате
        const playerInfo = findPlayerByStation(station.stationNumber, roomCode);
        const playerSocket = playerInfo ? io.sockets.sockets.get(playerInfo.player.id) : null;
        
        // Получаем комнату для проверки состояния игры
        const room = roomCode ? rooms.get(roomCode) : null;
        
        switch(action) {
          case 'ready':
            // Нажать кнопку "Готов" за игрока
            if (playerInfo && playerSocket && room && room.gameState === 'results') {
              if (!room.readyPlayers.has(playerInfo.player.id)) {
                room.readyPlayers.add(playerInfo.player.id);
                room.lastActivity = Date.now();
                console.log(`✅ Игрок ${playerInfo.player.name} (станция ${station.stationNumber}) помечен как готовый`);
                
                // Отправляем событие игроку
                playerSocket.emit('force-player-ready', { roomCode: room.roomCode });
                
                // Обновляем статус готовности
                updateReadyStatus(room.roomCode);
              }
            } else if (!playerInfo && roomCode && stationSocket && room && room.gameState === 'results') {
              // Если игрок не найден, но есть комната, открываем страницу игрока и затем отправляем команду
              console.log(`📂 Открываем страницу игрока для станции ${station.stationNumber} перед выполнением ready`);
              stationSocket.emit('local-station-command', {
                command: 'navigate',
                params: {
                  page: 'quiz',
                  roomCode: roomCode,
                  autoConnect: true
                },
                timestamp: Date.now()
              });
              
              // Отправляем команду через небольшую задержку, чтобы страница успела загрузиться
              setTimeout(() => {
                const updatedPlayerInfo = findPlayerByStation(station.stationNumber, roomCode);
                if (updatedPlayerInfo) {
                  const updatedPlayerSocket = io.sockets.sockets.get(updatedPlayerInfo.player.id);
                  if (updatedPlayerSocket && room && room.gameState === 'results') {
                    if (!room.readyPlayers.has(updatedPlayerInfo.player.id)) {
                      room.readyPlayers.add(updatedPlayerInfo.player.id);
                      room.lastActivity = Date.now();
                      updatedPlayerSocket.emit('force-player-ready', { roomCode: roomCode });
                      updateReadyStatus(roomCode);
                    }
                  }
                }
              }, 2000);
            }
            break;
            
          case 'select-answer':
            // Выбрать ответ за игрока
            const answer = params && params.answer !== undefined ? params.answer : null;
            if (playerInfo && playerSocket && room && room.gameState === 'question' && answer !== null) {
              // Проверяем, не ответил ли уже игрок
              const existingAnswer = Array.from(room.answers.values()).find(a => a.playerId === playerInfo.player.id);
              if (!existingAnswer) {
                // Эмулируем выбор ответа
                playerSocket.emit('force-select-answer', {
                  answer: answer,
                  roomCode: room.roomCode
                });
                console.log(`✅ Ответ ${answer} выбран за игрока ${playerInfo.player.name} (станция ${station.stationNumber})`);
              }
            } else if (!playerInfo && roomCode && stationSocket && room && room.gameState === 'question' && answer !== null) {
              // Если игрок не найден, открываем страницу игрока
              console.log(`📂 Открываем страницу игрока для станции ${station.stationNumber} перед выбором ответа`);
              stationSocket.emit('local-station-command', {
                command: 'navigate',
                params: {
                  page: 'quiz',
                  roomCode: roomCode,
                  autoConnect: true
                },
                timestamp: Date.now()
              });
              
              // Отправляем команду через задержку
              setTimeout(() => {
                const updatedPlayerInfo = findPlayerByStation(station.stationNumber, roomCode);
                if (updatedPlayerInfo) {
                  const updatedPlayerSocket = io.sockets.sockets.get(updatedPlayerInfo.player.id);
                  if (updatedPlayerSocket && room && room.gameState === 'question') {
                    const existingAnswer = Array.from(room.answers.values()).find(a => a.playerId === updatedPlayerInfo.player.id);
                    if (!existingAnswer) {
                      updatedPlayerSocket.emit('force-select-answer', {
                        answer: answer,
                        roomCode: roomCode
                      });
                    }
                  }
                }
              }, 2000);
            }
            break;
            
          case 'connect':
            // Принудительно подключить игрока к комнате
            const targetRoomCode = params && params.roomCode ? params.roomCode : roomCode;
            const playerName = params && params.playerName 
              ? params.playerName 
              : `Игрок №${station.stationNumber}`;
            
            if (targetRoomCode && stationSocket) {
              // Сначала открываем страницу игрока
              console.log(`📂 Открываем страницу игрока для станции ${station.stationNumber} для подключения к комнате ${targetRoomCode}`);
              stationSocket.emit('local-station-command', {
                command: 'navigate',
                params: {
                  page: 'quiz',
                  roomCode: targetRoomCode,
                  autoConnect: true,
                  playerName: playerName
                },
                timestamp: Date.now()
              });
              
              // Если игрок уже подключен, отправляем команду подключения
              if (playerSocket) {
                playerSocket.emit('force-connect', {
                  roomCode: targetRoomCode,
                  playerName: playerName
                });
                console.log(`✅ Команда подключения отправлена игроку на станции ${station.stationNumber}`);
              }
            }
            break;
            
          case 'disconnect':
            // Отключить игрока от комнаты
            if (playerInfo && room) {
              if (playerSocket) {
                playerSocket.leave(room.roomCode);
              }
              room.players = room.players.filter(p => p.id !== playerInfo.player.id);
              players.delete(playerInfo.player.id);
              console.log(`✅ Игрок ${playerInfo.player.name} (станция ${station.stationNumber}) отключен от комнаты`);
              
              // Уведомляем комнату об обновлении списка игроков
              io.to(room.roomCode).emit('player-list-updated', { players: room.players });
              
              // Возвращаем станцию на страницу ожидания
              if (stationSocket) {
                stationSocket.emit('local-station-command', {
                  command: 'navigate',
                  params: { page: 'waiting' },
                  timestamp: Date.now()
                });
              }
            }
            break;
        }
      });
    });

    // ========== КОМАНДЫ УПРАВЛЕНИЯ ИГРОЙ ==========

    /**
     * Управление игровым процессом
     */
    socket.on('local-game-control', (data) => {
      const { action, roomCode } = data;
      
      if (!action || !roomCode) {
        socket.emit('error', { message: 'Не указаны action или roomCode' });
        return;
      }
      
      const room = rooms.get(roomCode);
      if (!room) {
        console.error(`❌ Комната ${roomCode} не найдена при обработке local-game-control`);
        socket.emit('error', { message: 'Комната не найдена' });
        return;
      }

      // В локальном режиме разрешаем любому хосту выполнять команды (проверяем что подключен к комнате)
      if (room.mode !== 'local' || !socket.rooms.has(roomCode)) {
        console.warn(`⚠️ Попытка управления игрой из неподключенного хоста: roomCode=${roomCode}, mode=${room.mode}, socket.id=${socket.id}, inRoom=${socket.rooms.has(roomCode)}`);
        socket.emit('error', { message: 'Недостаточно прав для управления игрой. Подключитесь к комнате как хост.' });
        return;
      }
      
      console.log(`🎮 Управление игрой: действие "${action}" в комнате ${roomCode}, mode=${room.mode}, gameState=${room.gameState}`);
      
      switch(action) {
        case 'skip-answers':
          // Пропустить ожидание ответов
          if (room.gameState === 'question') {
            showResults(roomCode);
            socket.emit('local-game-control-result', { success: true, action: 'skip-answers' });
          }
          break;
          
        case 'skip-ready':
          // Пропустить ожидание готовности
          if (room.gameState === 'results') {
            room.currentQuestion++;
            if (room.currentQuestion < room.questions.length) {
              showQuestion(roomCode);
            } else {
              endGame(roomCode);
            }
            socket.emit('local-game-control-result', { success: true, action: 'skip-ready' });
          }
          break;
          
        case 'show-results':
          // Показать результаты
          if (room.gameState === 'question') {
            showResults(roomCode);
            socket.emit('local-game-control-result', { success: true, action: 'show-results' });
          }
          break;
          
        case 'next-question':
          // Перейти к следующему вопросу
          if (room.gameState === 'results') {
            room.currentQuestion++;
            if (room.currentQuestion < room.questions.length) {
              showQuestion(roomCode);
            } else {
              endGame(roomCode);
            }
            socket.emit('local-game-control-result', { success: true, action: 'next-question' });
          }
          break;
          
        case 'end-game':
          // Завершить игру
          console.log(`🏁 Завершение игры в комнате ${roomCode} по команде local-game-control`);
          endGame(roomCode);
          socket.emit('local-game-control-result', { success: true, action: 'end-game' });
          console.log(`✅ Команда end-game выполнена для комнаты ${roomCode}`);
          break;
          
        default:
          socket.emit('error', { message: `Неизвестное действие: ${action}` });
      }
    });

    // ========== КОМАНДЫ ОБНОВЛЕНИЯ ОТОБРАЖЕНИЯ ==========

    /**
     * Обновление отображения на станциях
     */
    socket.on('local-update-display', (data) => {
      const { stationNumbers, element, text, html, style, action, elements } = data;
      
      const stations = stationNumbers 
        ? localModeManager.getStationsByNumbers(stationNumbers)
        : localModeManager.getStations().filter(s => s.connected);
      
      console.log(`📝 Обновление отображения на станциях: ${stations.map(s => s.stationNumber).join(', ')}`);
      
      stations.forEach(station => {
        if (station.connected && station.socketId) {
          io.to(station.socketId).emit('local-station-command', {
            command: 'update-display',
            params: {
              element: element,
              text: text,
              html: html,
              style: style,
              action: action, // 'show' или 'hide'
              elements: elements // массив селекторов
            },
            timestamp: Date.now()
          });
        }
      });
      
      socket.emit('local-update-display-result', {
        success: true,
        stationsUpdated: stations.length
      });
    });

    // ========== КОМАНДЫ МАССОВЫХ ОПЕРАЦИЙ ==========

    /**
     * Выполнение нескольких действий подряд
     */
    socket.on('local-batch-actions', (data) => {
      const { stationNumbers, actions, delay } = data;
      
      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        socket.emit('error', { message: 'Не указаны действия или массив пуст' });
        return;
      }
      
      console.log(`📦 Выполнение пакета из ${actions.length} действий на станциях: ${stationNumbers || 'все'}`);
      
      let currentIndex = 0;
      const executeNext = () => {
        if (currentIndex >= actions.length) {
          socket.emit('local-batch-actions-complete', {
            success: true,
            actionsExecuted: actions.length
          });
          return;
        }
        
        const action = actions[currentIndex];
        const { command, params } = action;
        
        // Выполняем действие через соответствующий обработчик
        switch(command) {
          case 'local-station-command':
            socket.emit('local-station-command', {
              stationNumbers: stationNumbers,
              command: params.command,
              params: params.params
            });
            break;
          case 'local-player-action':
            socket.emit('local-player-action', {
              stationNumbers: stationNumbers,
              action: params.action,
              params: params.params,
              roomCode: params.roomCode
            });
            break;
          case 'local-game-control':
            socket.emit('local-game-control', {
              action: params.action,
              roomCode: params.roomCode
            });
            break;
          case 'local-update-display':
            socket.emit('local-update-display', {
              stationNumbers: stationNumbers,
              ...params
            });
            break;
        }
        
        currentIndex++;
        
        // Задержка перед следующим действием
        if (currentIndex < actions.length) {
          setTimeout(executeNext, delay || 1000);
        } else {
          setTimeout(() => {
            socket.emit('local-batch-actions-complete', {
              success: true,
              actionsExecuted: actions.length
            });
          }, delay || 1000);
        }
      };
      
      executeNext();
    });

    // ========== МОНИТОРИНГ И СТАТУСЫ ==========

    /**
     * Получение статуса всех игроков в комнате
     */
    socket.on('get-players-status', (data) => {
      const { roomCode } = data;
      
      if (!roomCode) {
        socket.emit('error', { message: 'Не указан roomCode' });
        return;
      }
      
      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Комната не найдена' });
        return;
      }
      
      const playersStatus = room.players.map(player => {
        const station = localModeManager.getStations().find(s => {
          const playerNameLower = (player.name || '').trim().toLowerCase();
          const stationNameLower = `игрок №${s.stationNumber}`.toLowerCase();
          return playerNameLower === stationNameLower || 
                 playerNameLower.includes(`игрок${s.stationNumber}`);
        });
        
        const hasAnswered = Array.from(room.answers.values()).some(a => a.playerId === player.id);
        const isReady = room.readyPlayers.has(player.id);
        
        return {
          stationNumber: station ? station.stationNumber : null,
          name: player.name,
          id: player.id,
          connected: !player.disconnected,
          ready: isReady,
          answered: hasAnswered,
          score: player.score || 0
        };
      });
      
      socket.emit('players-status', {
        roomCode: roomCode,
        players: playersStatus,
        gameState: room.gameState,
        currentQuestion: room.currentQuestion + 1,
        totalQuestions: room.questions.length
      });
    });
  }

  socket.on('disconnect', () => {
    // Обработка отключения станции в локальном режиме
    if (localModeAvailable && localModeManager) {
      const station = localModeManager.removeStationSocketId(socket.id);
      if (station) {
        console.log(`🔌 Станция ${station.stationNumber} отключена`);
        
        // Уведомляем хостов об обновлении
        io.emit('local-stations-updated', {
          stations: localModeManager.getStations()
        });
      }
    }

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

