/**
 * Unified Server with New Architecture
 * Использует новый протокол Socket.IO и единую систему комнат
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Новая архитектура
const { initializeSocketRouter } = require('./server/core/socket-router');
const { getRoomManager } = require('./server/core/rooms');
const { getGameRegistry } = require('./server/games/index');
const { getEventBus } = require('./server/core/events');
const { getConfigManager } = require('./server/utils/config-manager');

// Совместимость
const { initializeCompatibilityAdapter } = require('./server/core/compatibility-adapter');

// Утилиты
const { loadAllQuizzes } = require('./server/utils/quiz-loader');

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Настройка Express
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Менеджеры
const roomManager = getRoomManager();
const gameRegistry = getGameRegistry();
const eventBus = getEventBus();
let configManager = null;

try {
  configManager = getConfigManager();
  const versionInfo = configManager.getVersionInfo();
  console.log(`✅ Система конфигураций (версия: ${versionInfo.version})`);
} catch (error) {
  console.warn('⚠️ Ошибка инициализации конфигураций:', error.message);
}

// Загрузка квизов
let quizzes = {};
try {
  quizzes = loadAllQuizzes();
  console.log(`✅ Загружено квизов: ${Object.keys(quizzes).length}`);
} catch (error) {
  console.error('❌ Ошибка загрузки квизов:', error);
}

// Локальный режим (станции)
let localModeAvailable = false;
let localModeManager = null;

try {
  require.resolve('./server/local/local-mode.js');
  localModeAvailable = true;
  const { getLocalModeManager } = require('./server/local/local-mode.js');
  localModeManager = getLocalModeManager();
  console.log('✅ Локальный режим доступен');
} catch (e) {
  console.log('🌐 Локальный режим недоступен (глобальный режим)');
}

// DMX интеграция
let dmxScenarioEngine = null;
let unifiedDMXIntegration = null;

try {
  const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
  const { getUnifiedDMXIntegration } = require('./server/dmx/dmx-integration-unified');
  
  dmxScenarioEngine = getDMXScenarioEngine();
  unifiedDMXIntegration = getUnifiedDMXIntegration();
  
  // TODO: Инициализировать DMX контроллер и эффекты
  // unifiedDMXIntegration.initialize(controller, effects);
  
  console.log('✅ DMX система доступна');
} catch (error) {
  console.warn('⚠️ DMX система недоступна:', error.message);
}

// ============================================
// API ROUTES
// ============================================

// Unified Rooms API
try {
  const roomsApiRouter = require('./server/routes/rooms-api');
  app.use('/api/rooms', roomsApiRouter);
  console.log('✅ Unified Rooms API');
} catch (error) {
  console.error('❌ Rooms API недоступен:', error.message);
}

// DMX API
try {
  const dmxApiRouter = require('./server/routes/dmx-api');
  app.use('/api/dmx', dmxApiRouter);
  console.log('✅ DMX API');
} catch (error) {
  console.warn('⚠️ DMX API недоступен:', error.message);
}

// Legacy CHGK API (для обратной совместимости)
try {
  const { router: chgkApiRouter } = require('./server/routes/chgk-api');
  app.use('/api/chgk', chgkApiRouter);
  console.log('✅ Legacy CHGK API (compatibility)');
} catch (error) {
  console.warn('⚠️ CHGK API недоступен:', error.message);
}

// Stations API (локальный режим)
if (localModeAvailable && localModeManager) {
  app.get('/api/stations/status', (req, res) => {
    const stations = localModeManager.getStations();
    res.json({ stations });
  });

  app.post('/api/stations/command', (req, res) => {
    try {
      const { stationNumbers, command, params } = req.body;

      if (!command) {
        return res.status(400).json({ 
          success: false, 
          error: 'Команда не указана'
        });
      }

      const stations = localModeManager.getStations();
      const results = [];

      stationNumbers.forEach(stationNumber => {
        const station = stations.find(s => s.stationNumber === stationNumber);
        
        if (station && station.connected && station.socketId) {
          const commandData = {
            command,
            params,
            timestamp: Date.now()
          };
          
          io.to(station.socketId).emit('local-station-command', commandData);
          results.push({ stationNumber, success: true });
        } else {
          results.push({ stationNumber, success: false, error: 'Станция не подключена' });
        }
      });

      res.json({ success: true, results });
    } catch (error) {
      console.error('❌ Ошибка отправки команды:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('✅ Stations API');
}

// Quizzes API
app.get('/api/quizzes', (req, res) => {
  const quizList = Object.keys(quizzes).map(id => ({
    id,
    name: quizzes[id].name,
    display: quizzes[id].display,
    questionCount: quizzes[id].questions?.length || 0
  }));
  res.json(quizList);
});

// Get specific quiz by ID (with or without questions based on query parameter)
app.get('/api/quizzes/:quizId', (req, res) => {
  const { quizId } = req.params;
  const includeQuestions = req.query.questions === 'true' || req.query.full === 'true';
  
  if (!quizzes[quizId]) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  const quiz = quizzes[quizId];
  
  // Базовый объект с конфигурацией
  const response = {
    id: quiz.id || quizId,
    name: quiz.name,
    display: quiz.display,
    questionCount: quiz.questions?.length || 0,
    passwordRequired: quiz.passwordRequired || false,
    password: quiz.password || null,
    description: quiz.description,
    icon: quiz.icon,
    colors: quiz.colors,
    gameSettings: quiz.gameSettings
  };
  
  // Если запрашиваются вопросы, добавляем их
  if (includeQuestions && quiz.questions) {
    response.questions = quiz.questions;
  }
  
  // Для обратной совместимости: если клиент ожидает questions (как solo.html),
  // возвращаем их по умолчанию
  if (!includeQuestions) {
    // Проверяем, есть ли в запросе заголовок или другие признаки, что нужны questions
    // Для простоты всегда возвращаем questions, если они есть
    if (quiz.questions) {
      response.questions = quiz.questions;
    }
  }
  
  res.json(response);
});

// Mode API (for local mode detection)
app.get('/api/mode', (req, res) => {
  res.json({
    mode: localModeAvailable ? 'available' : 'unavailable',
    currentMode: req.query.mode || 'global'
  });
});

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  console.log(`📝 Клиент установил режим: ${mode}`);
  res.json({ success: true, mode: mode });
});

// Legacy create-room endpoint
app.post('/api/create-room', (req, res) => {
  try {
    const { quizId, password, mode } = req.body;
    
    if (!quizId || !quizzes[quizId]) {
      return res.status(400).json({ error: 'Квиз не найден' });
    }

    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const quizData = quizzes[quizId];
    
    const gameEngine = gameRegistry.getGame('quiz');
    const room = gameEngine.createRoom(roomCode, {
      quizData,
      mode: mode || 'online',
      password
    });

    res.json({ roomCode, quizId });
  } catch (error) {
    console.error('❌ Ошибка создания комнаты:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// REDIRECTS (обратная совместимость)
// ============================================

// Legacy redirects
app.get('/quiz-questions-host.html', (req, res) => {
  res.redirect(301, '/chgk-host.html');
});
app.get('/quiz-questions-player.html', (req, res) => {
  res.redirect(301, '/chgk-player.html');
});
app.get('/quiz-questions-commission.html', (req, res) => {
  res.redirect(301, '/chgk-commission.html');
});

// ============================================
// STATIC FILES
// ============================================

app.use('/docs', express.static(path.join(__dirname, 'docs')));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// SOCKET.IO - UNIFIED PROTOCOL
// ============================================

// Инициализация нового роутера
const socketRouter = initializeSocketRouter(io);
console.log('✅ Unified Socket.IO protocol initialized');

// Инициализация адаптера совместимости
initializeCompatibilityAdapter(io, socketRouter);
console.log('✅ Compatibility adapter initialized');

// Локальный режим - специальные события
if (localModeAvailable && localModeManager) {
  io.on('connection', (socket) => {
    // Регистрация станции
    socket.on('local-station-register', (data) => {
      const { stationNumber, ip } = data;
      
      if (!stationNumber) {
        socket.emit('local-station-error', { message: 'Station number required' });
        return;
      }

      const station = localModeManager.registerStation(ip || socket.handshake.address, stationNumber);
      
      if (station) {
        station.socketId = socket.id;
        station.connected = true;
        station.lastSeen = Date.now();
        
        socket.emit('local-station-registered', { stationNumber, station });
        io.emit('local-stations-updated', {
          stations: localModeManager.getStations()
        });
        
        console.log(`✅ Station ${stationNumber} registered via Socket.IO`);
      } else {
        socket.emit('local-station-error', { message: 'Failed to register station' });
      }
    });

    // Heartbeat станции
    socket.on('local-station-heartbeat', (data) => {
      const { stationNumber } = data;
      const stations = localModeManager.getStations();
      const station = stations.find(s => s.stationNumber === stationNumber);
      
      if (station) {
        station.lastSeen = Date.now();
        station.connected = true;
      }
    });

    // Отключение станции
    socket.on('disconnect', () => {
      const stations = localModeManager.getStations();
      const station = stations.find(s => s.socketId === socket.id);
      
      if (station) {
        station.connected = false;
        station.socketId = null;
        
        io.emit('local-stations-updated', {
          stations: localModeManager.getStations()
        });
        
        console.log(`👋 Station ${station.stationNumber} disconnected`);
      }
    });
  });

  console.log('✅ Local mode Socket.IO handlers');
}

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 UNIFIED SERVER STARTED');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🎮 Games available: ${gameRegistry.getAllGames().map(g => g.id).join(', ')}`);
  console.log(`📚 Quizzes loaded: ${Object.keys(quizzes).length}`);
  console.log(`🏠 Rooms: unified storage`);
  console.log(`🔌 Socket.IO: unified protocol + compatibility`);
  console.log(`💡 DMX: ${dmxScenarioEngine ? 'enabled' : 'disabled'}`);
  console.log(`🖥️  Local mode: ${localModeAvailable ? 'enabled' : 'disabled'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = { app, server, io };

