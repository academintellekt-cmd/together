const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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

// Хранилище комнат и игроков
const rooms = new Map();
const players = new Map();

// Генерация кода комнаты
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Базовые вопросы для MVP
const questions = [
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
];

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
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    host: null,
    players: [],
    gameState: 'lobby', // lobby, playing, question, results, finished
    currentQuestion: 0,
    questions: [...questions],
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
  socket.on('player-join', ({ roomCode, playerName, reconnectPlayerId }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Попытка переподключения
    if (reconnectPlayerId) {
      // Ищем игрока по старому ID или по имени (на случай если ID изменился)
      let existingPlayer = room.players.find(p => p.id === reconnectPlayerId);
      if (!existingPlayer) {
        // Пробуем найти по имени, если игра уже началась
        existingPlayer = room.players.find(p => p.name === playerName);
      }
      
      if (existingPlayer && existingPlayer.name === playerName) {
        reconnectPlayer(socket, existingPlayer, room, roomCode, playerName);
        return;
      }
    }

    if (room.players.length >= 6) {
      socket.emit('error', { message: 'Комната переполнена (максимум 6 игроков)' });
      return;
    }
    if (room.gameState !== 'lobby') {
      // Пробуем найти игрока по имени для переподключения
      const existingPlayer = room.players.find(p => p.name === playerName);
      if (existingPlayer) {
        // Переподключение по имени (общая функция)
        reconnectPlayer(socket, existingPlayer, room, roomCode, playerName);
        return;
      }
      
      socket.emit('error', { message: 'Игра уже началась. Используйте переподключение с тем же именем.' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      roomCode: roomCode
    };
    room.players.push(player);
    players.set(socket.id, player);
    socket.join(roomCode);
    
    socket.emit('player-connected', { playerId: socket.id, roomCode });
    io.to(roomCode).emit('player-list-updated', { players: room.players });
    console.log(`Игрок ${playerName} подключен к комнате ${roomCode}`);
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

  // Функция переподключения игрока
  function reconnectPlayer(socket, existingPlayer, room, roomCode, playerName) {
    const oldId = existingPlayer.id;
    existingPlayer.id = socket.id;
    players.delete(oldId);
    players.set(socket.id, existingPlayer);
    socket.join(roomCode);
    
    // Обновляем ID в ответах если игрок уже ответил
    if (room.answers.has(oldId)) {
      const answer = room.answers.get(oldId);
      room.answers.delete(oldId);
      room.answers.set(socket.id, answer);
    }
    
    // Отправляем текущее состояние игры
    sendGameState(socket, room, roomCode);
    
    // Если игра еще не началась, отправляем подтверждение подключения
    if (room.gameState === 'lobby') {
      socket.emit('player-connected', { playerId: socket.id, roomCode });
    }
    
    io.to(roomCode).emit('player-list-updated', { players: room.players });
    console.log(`Игрок ${playerName} переподключен к комнате ${roomCode}`);
  }

  // Функция отправки текущего состояния игры игроку
  function sendGameState(socket, room, roomCode) {
    if (room.gameState === 'question') {
      const question = room.questions[room.currentQuestion];
      const timeElapsed = Math.floor((Date.now() - room.startTime) / 1000);
      const timeLeft = Math.max(0, question.time - timeElapsed);
      
      socket.emit('question', {
        question: question.question,
        options: question.options,
        questionNumber: room.currentQuestion + 1,
        totalQuestions: room.questions.length,
        time: question.time,
        timeLeft: timeLeft
      });
      
      if (room.answers.has(socket.id)) {
        const answer = room.answers.get(socket.id);
        setTimeout(() => {
          socket.emit('answer-received', { isCorrect: answer.isCorrect });
        }, 500);
      }
      updateAnswerStatus(roomCode);
        } else if (room.gameState === 'results') {
          const question = room.questions[room.currentQuestion];
          socket.emit('results', {
            correctAnswer: question.correct,
            correctAnswerText: question.options[question.correct],
            results: Array.from(room.answers.values()),
            players: room.players.sort((a, b) => b.score - a.score)
          });
          // Отправляем текущий статус готовности
          updateReadyStatus(roomCode);
        } else if (room.gameState === 'finished') {
      socket.emit('game-finished', {
        results: room.players.sort((a, b) => b.score - a.score)
      });
    }
  }

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
    if (isCorrect) {
      const timeBonus = Math.max(0, question.time * 1000 - answerTime);
      const points = 100 + Math.floor(timeBonus / 100);
      player.score += points;
    }

    socket.emit('answer-received', { isCorrect });
    
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
      // Если игрок переподключился, обновляем его ID в readyPlayers
      const oldId = Array.from(room.readyPlayers).find(id => {
        const oldPlayer = players.get(id);
        return oldPlayer && oldPlayer.name === player.name && oldPlayer.roomCode === roomCode;
      });
      if (oldId && oldId !== socket.id) {
        room.readyPlayers.delete(oldId);
      }
      
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
        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(player.roomCode).emit('player-list-updated', { players: room.players });
      }
      players.delete(socket.id);
    }
    console.log('Отключение:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT}/host.html для хоста`);
  console.log(`Откройте http://localhost:${PORT}/player.html для игроков`);
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

