const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { loadAllQuizzes } = require('./server/utils/quiz-loader');
const { seededShuffle, shuffleQuestions, shuffleOptions } = require('./server/utils/shuffle');
const { parseTimeToSeconds } = require('./server/utils/time');
const { normalizeQuizId } = require('./server/utils/normalize');
const { createLeaderboardRouter } = require('./server/routes/leaderboard');
const { createJoystickRouter } = require('./server/routes/joystick');
const { createReloadRouter } = require('./server/routes/reload');
const { createModeRouter } = require('./server/routes/mode');
const { initSockets } = require('./server/sockets');
const { createGoogleSheetsClient } = require('./server/integrations/google-sheets');
const { RoomsService } = require('./server/services/rooms');
const {
  PORT,
  MAX_ROOMS,
  MAX_TOTAL_PLAYERS,
  MAX_LEADERBOARD_ENTRIES,
  ROOM_TIMEOUT,
  LEADERBOARD_QUEUE_BATCH_SIZE,
  LEADERBOARD_QUEUE_INTERVAL
} = require('./server/config');
const roomsService = new RoomsService({
  maxRooms: MAX_ROOMS,
  maxPlayers: MAX_TOTAL_PLAYERS,
  roomTimeout: ROOM_TIMEOUT
});

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

// Лидерборд API routes
try {
  const leaderboardRouter = createLeaderboardRouter({
    leaderboardService,
    normalizeQuizId,
    writeToGoogleSheets: gsWriteToGoogleSheets,
    processLeaderboardQueue,
    loadLeaderboardFromGoogleSheets: gsLoadLeaderboardFromGoogleSheets,
    initializeLeaderboard,
    LEADERBOARD_QUEUE_BATCH_SIZE,
    MAX_LEADERBOARD_ENTRIES
  });
  app.use('/api/leaderboard', leaderboardRouter);
  // Обратная совместимость для старого endpoint
  app.use('/api/reload-leaderboard', (req, res, next) => {
    req.url = '/reload';
    leaderboardRouter(req, res, next);
  });
  console.log('✅ Leaderboard API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ Leaderboard API routes недоступны:', error.message);
}

// Joystick API routes
try {
  const joystickRouter = createJoystickRouter();
  app.use('/api/joystick-config', joystickRouter);
  console.log('✅ Joystick API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ Joystick API routes недоступны:', error.message);
}

// Reload API routes
try {
  const reloadRouter = createReloadRouter(quizzes);
  app.use('/api/reload', reloadRouter);
  console.log('✅ Reload API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ Reload API routes недоступны:', error.message);
}

// Mode API routes
try {
  const modeRouter = createModeRouter(localModeAvailable);
  app.use('/api/mode', modeRouter);
  console.log('✅ Mode API routes зарегистрированы');
} catch (error) {
  console.warn('⚠️ Mode API routes недоступны:', error.message);
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
const rooms = roomsService.getRooms();
const players = roomsService.getPlayers();
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

// Сервис рейтинга
const leaderboardService = require('./server/services/leaderboard');
const leaderboard = leaderboardService.getLeaderboard();
const leaderboardQueue = leaderboardService.getQueue();

// Инициализация рейтинга при запуске сервера
async function initializeLeaderboard() {
  await leaderboardService.initializeLeaderboard(gsLoadLeaderboardFromGoogleSheets);
}

// Функция для обработки очереди рейтинга (батчинг)
async function processLeaderboardQueue() {
  await leaderboardService.processLeaderboardQueue(gsWriteToGoogleSheets, initializeLeaderboard);
}

// Функция записи результата в Google Sheets через Apps Script Web App
async function writeToGoogleSheets(result) {
  return gsWriteToGoogleSheets(result);
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

// Клиент Google Sheets (использует актуальный объект quizzes)
const {
  loadLeaderboardFromGoogleSheets: gsLoadLeaderboardFromGoogleSheets,
  writeToGoogleSheets: gsWriteToGoogleSheets
} = createGoogleSheetsClient({
  normalizeQuizId,
  quizzes
});

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

// DMX API routes уже зарегистрированы выше (перед статическим middleware)

// API для локального режима
if (localModeAvailable && localModeManager) {
  try {
    const { createLocalRouter } = require('./server/routes/local');
    const localRouter = createLocalRouter({ localModeManager, io, findPlayersForStation });
    app.use('/api/local', localRouter);
    console.log('✅ Локальный режим доступен, роуты зарегистрированы');
    } catch (error) {
    console.warn('⚠️ Ошибка регистрации роутов локального режима:', error.message);
  }
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
  
  const port = PORT;
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

// Вспомогательные функции Socket.IO
  const questionTimers = new Map();

  function showQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.currentQuestion >= room.questions.length) {
      endGame(roomCode);
      return;
    }

    room.gameState = 'question';
    room.answers.clear();
  room.readyPlayers.clear();
    const question = room.questions[room.currentQuestion];
    room.startTime = Date.now();
  room.lastActivity = Date.now();

    if (questionTimers.has(roomCode)) {
      clearTimeout(questionTimers.get(roomCode));
    }

    updateAnswerStatus(roomCode);

    const questionData = {
      question: question.question,
      options: question.options,
      questionNumber: room.currentQuestion + 1,
      totalQuestions: room.questions.length,
      time: question.time,
    quizId: room.quizId
    };
    
    console.log(`📤 Отправка вопроса ${questionData.questionNumber} из ${questionData.totalQuestions} в комнату ${roomCode}`);
    
    io.to(roomCode).emit('question', questionData);
    
    if (dmxScenarioEngine) {
      dmxScenarioEngine.handleGameEvent(roomCode, 'QUESTION_STARTED', {
        questionId: question.id
      });
    }

    const timer = setTimeout(() => {
      if (room.gameState === 'question') {
        showResults(roomCode);
      }
      questionTimers.delete(roomCode);
    }, question.time * 1000);
    
    questionTimers.set(roomCode, timer);
  }

  function updateAnswerStatus(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const activePlayers = room.players.filter(p => !p.disconnected);
    const answeredPlayerNames = Array.from(room.answers.values()).map(a => a.playerName);
    const answeredSocketIds = Array.from(room.answers.keys());
    
    const playerStatuses = activePlayers.map(player => {
      const answered = answeredSocketIds.includes(player.id) || 
                      answeredPlayerNames.includes(player.name);
      return {
        id: player.id,
        name: player.name,
        answered: answered
      };
    });

    io.to(roomCode).emit('answer-status', {
      players: playerStatuses,
      answeredCount: answeredPlayerNames.length,
      totalPlayers: activePlayers.length,
      allAnswered: answeredPlayerNames.length === activePlayers.length && activePlayers.length > 0
    });
  }

  function showResults(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (questionTimers.has(roomCode)) {
      clearTimeout(questionTimers.get(roomCode));
      questionTimers.delete(roomCode);
    }

    room.gameState = 'results';
  room.lastActivity = Date.now();
    const question = room.questions[room.currentQuestion];
    const results = Array.from(room.answers.values());

    const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
    io.to(roomCode).emit('results', {
      correctAnswer: question.correct,
      correctAnswerText: question.options[question.correct],
      results: results,
      players: sortedPlayers
    });

    if (dmxScenarioEngine) {
      const resultsWithIndices = results.map(result => ({
        playerIndex: getPlayerIndex(roomCode, result.playerId),
        isCorrect: result.isCorrect
      })).filter(r => r.playerIndex !== -1);
      
      dmxScenarioEngine.handleGameEvent(roomCode, 'SHOW_CORRECT_ANSWER', {
        results: resultsWithIndices
      });
      
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

    updateReadyStatus(roomCode);
  }

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

    io.to(roomCode).emit('ready-status', {
      players: playerStatuses,
      readyCount: readyPlayerIds.length,
      totalPlayers: room.players.length,
      allReady: allReady
    });

    if (allReady && room.gameState === 'results') {
      setTimeout(() => {
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
    }, 500);
  }
}

  function endGame(roomCode) {
    console.log(`🎮 Функция endGame вызвана для комнаты: ${roomCode}`);
    const room = rooms.get(roomCode);
    if (!room) {
      console.warn(`⚠️ Комната ${roomCode} не найдена в функции endGame`);
      return;
    }

    console.log(`📊 Комната найдена: mode=${room.mode}, players=${room.players.length}, gameState=${room.gameState}`);
    
    room.gameState = 'finished';
  room.lastActivity = Date.now();
    const finalResults = room.players.sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('game-finished', {
      results: finalResults
    });
    
    console.log(`📤 Событие game-finished отправлено в комнату ${roomCode}`);
    
    if (room.mode === 'local' && localModeAvailable && localModeManager) {
      const stationNumbers = new Set();
      room.players.forEach(player => {
        const match = player.name.match(/игрок\s*№?(\d+)/i);
        if (match) {
          const stationNum = parseInt(match[1]);
          stationNumbers.add(stationNum);
        }
      });
      
      const allStations = localModeManager.getStations();
      const connectedStations = allStations.filter(s => s.connected);
      
      const stationsToNotify = stationNumbers.size > 0
        ? localModeManager.getStationsByNumbers(Array.from(stationNumbers))
        : connectedStations;
      
      stationsToNotify.forEach(station => {
        if (station.connected && station.socketId) {
          const commandData = {
            command: 'navigate',
            params: {
              page: 'waiting'
            },
            timestamp: Date.now()
          };
          io.to(station.socketId).emit('local-station-command', commandData);
          io.to(station.socketId).emit('local-station-return-to-waiting');
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: 'waiting',
            pageData: {}
          });
        }
      });
      
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
          playerSocket.emit('local-station-command', commandData);
          playerSocket.emit('local-station-return-to-waiting');
        }
      });
    }
    
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

// Подключение через Socket.io
initSockets(io, {
  roomsService,
  findPlayersForStation,
  dmxScenarioEngine,
  localModeAvailable,
  localModeManager,
  updateAnswerStatus,
  updateReadyStatus,
  quizzes,
  showQuestion,
  showResults,
  endGame,
  // Для обратной совместимости фронта: полный список игроков и статусы
  emitPlayerList: (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    io.to(roomCode).emit('player-list', room.players);
    io.to(roomCode).emit('player-list-updated', { players: room.players });
  }
});
// Функция для очистки неактивных комнат
function cleanupInactiveRooms() {
  const cleanedCount = roomsService.cleanupInactive(dmxScenarioEngine);
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

