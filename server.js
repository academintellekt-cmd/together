const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// URL Google Apps Script Web App для записи результатов
// Можно переопределить через переменную окружения GOOGLE_APPS_SCRIPT_URL
if (!process.env.GOOGLE_APPS_SCRIPT_URL) {
  process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxesMEtekXqo7tsB0vGSsAUx1WPrQ0CFw3wjJmg22phlNXRhG5oqn_w7-15gRBKQhFG0w/exec';
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Geometria', express.static(path.join(__dirname, 'Geometria')));

// Хранилище комнат и игроков
const rooms = new Map();
const players = new Map();

// Хранилище рейтинга для соло-режима
const leaderboard = [];

// Функция загрузки вопросов из TXT файла
function loadQuestionsFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`Файл ${filePath} не найден. Вопросы будут пустыми.`);
      return [];
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').map(line => line.trim());
    
    const questions = [];
    let currentQuestion = null;
    let questionId = 1;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Пропускаем пустые строки
      if (!line || line.length === 0) {
        continue;
      }
      
      // Пропускаем комментарии
      if (line.startsWith('//') || line.startsWith('#')) {
        continue;
      }

      // Пропускаем строки "Вопрос N"
      if (line.match(/^Вопрос\s+\d+$/i)) {
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
          // Убираем префикс и проверяем на звездочку в конце
          let answer = line.substring(1).trim();
          const isCorrect = answer.endsWith('★') || answer.endsWith('*');
          
          // Убираем звездочку из текста
          answer = answer.replace(/[★*]$/, '').trim();
          
          currentQuestion.options.push(answer);
          
          // Если это правильный ответ (была звездочка), запоминаем индекс
          if (isCorrect && currentQuestion.correct === -1) {
            currentQuestion.correct = currentQuestion.options.length - 1;
          }
        }
      }
      // Если строка начинается с "-", это неправильный ответ
      else if (line.startsWith('-')) {
        if (currentQuestion) {
          const answer = line.substring(1).trim().replace(/[★*]$/, '').trim();
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
      // Иначе это может быть вариант ответа без префикса (проверяем на звездочку)
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

    console.log(`Загружено ${shuffled.length} вопросов из файла ${filePath} (перемешано)`);
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

// Загрузка вопросов для квиза друзей из файла
// Сначала пробуем загрузить из Quiz/GNU.txt, если нет - из questions.txt
const gnuQuestionsPath = path.join(__dirname, 'Quiz', 'GNU.txt');
const defaultQuestionsPath = path.join(__dirname, 'questions.txt');

let questionsFilePath = gnuQuestionsPath;
if (!fs.existsSync(gnuQuestionsPath)) {
  questionsFilePath = defaultQuestionsPath;
}

quizzes['friends-quiz'].questions = loadQuestionsFromFile(questionsFilePath);

// Получение списка квизов
app.get('/api/quizzes', (req, res) => {
  const quizzesList = Object.values(quizzes).map(quiz => {
    const avgTime = quiz.questions.length > 0
      ? Math.round(quiz.questions.reduce((sum, q) => sum + q.time, 0) / quiz.questions.length)
      : 0;
    
    // Для квиза друзей показываем, что будет выбрано 15 вопросов из базы
    let questionCount = quiz.questions.length;
    let questionInfo = `${questionCount} вопросов`;
    
    if (quiz.id === 'friends-quiz' && questionCount > 15) {
      questionInfo = `15 из ${questionCount} вопросов`;
      questionCount = 15; // Показываем количество вопросов в игре
    }
    
    return {
      id: quiz.id,
      name: quiz.name,
      description: quiz.description,
      icon: quiz.icon,
      questionCount: questionCount,
      questionInfo: questionInfo, // Дополнительная информация
      totalQuestionsInBase: quiz.questions.length, // Общее количество в базе
      avgTime: avgTime,
      comingSoon: false,
      soloMode: quiz.soloMode || false
    };
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
  
  let questionsToReturn = quiz.questions;
  
  // Для квиза друзей выбираем случайные 15 вопросов из базы
  if (quizId === 'friends-quiz' && quiz.questions.length > 15) {
    // Создаем копию массива и перемешиваем
    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    // Берем первые 15
    questionsToReturn = shuffled.slice(0, 15);
    
    // Перемешиваем варианты ответов для каждого вопроса
    questionsToReturn = questionsToReturn.map((q, index) => {
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
      
      return questionCopy;
    });
  }
  
  res.json({
    id: quiz.id,
    name: quiz.name,
    description: quiz.description,
    questions: questionsToReturn,
    soloMode: quiz.soloMode || false,
    totalQuestionsInBase: quiz.questions.length // Информация о размере базы
  });
});

// Функция записи результата в Google Sheets через API
async function writeToGoogleSheetsAPI(result) {
  try {
    // ID таблицы из переменной окружения или конфига
    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';
    
    if (!SPREADSHEET_ID) {
      return false; // Пробуем альтернативный способ
    }
    
    // Проверяем наличие credentials файла
    const credentialsPath = path.join(__dirname, 'google-credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      return false; // Пробуем альтернативный способ
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    // Настройка аутентификации
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Форматируем данные
    const date = new Date(result.date);
    const formattedDate = date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const minutes = Math.floor(result.timeSpent / 60);
    const seconds = result.timeSpent % 60;
    const formattedTime = `${minutes}м ${seconds}с`;

    const percentage = result.totalQuestions > 0 
      ? Math.round((result.correctAnswers / result.totalQuestions) * 100) 
      : 0;

    const values = [[
      formattedDate,
      result.playerName,
      result.score,
      result.correctAnswers,
      result.totalQuestions,
      percentage + '%',
      formattedTime,
      result.quizId === 'friends-quiz' ? 'Чемпионат ГНУ' : result.quizId
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Лист1!A:H',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: values },
    });

    console.log('Данные успешно записаны в Google Sheets через API');
    return true;
  } catch (error) {
    console.error('Ошибка при записи в Google Sheets через API:', error.message);
    return false;
  }
}

// Функция записи результата в Google Sheets через Apps Script Web App
async function writeToGoogleSheetsWebApp(result) {
  try {
    const WEB_APP_URL = process.env.GOOGLE_APPS_SCRIPT_URL || '';
    
    if (!WEB_APP_URL) {
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
    const url = require('url');
    
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
      }
    };

    return new Promise((resolve) => {
      const req = client.request(options, (res) => {
        if (res.statusCode === 200) {
          console.log('Данные успешно записаны в Google Sheets через Web App');
          resolve(true);
        } else {
          console.error('Ошибка записи в Google Sheets Web App:', res.statusCode);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        console.error('Ошибка при запросе к Google Sheets Web App:', error.message);
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

// Основная функция записи в Google Sheets (пробует оба способа)
async function writeToGoogleSheets(result) {
  // Сначала пробуем через API
  const apiSuccess = await writeToGoogleSheetsAPI(result);
  if (apiSuccess) return;

  // Если не получилось, пробуем через Web App
  await writeToGoogleSheetsWebApp(result);
}

// Сохранение результата в рейтинг
app.post('/api/leaderboard', async (req, res) => {
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
    const key = result.playerName.toLowerCase();
    if (!playerBestScores[key] || playerBestScores[key].score < result.score) {
      playerBestScores[key] = result;
    }
  });
  
  // Сортируем по очкам
  const sortedResults = Object.values(playerBestScores).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp;
  });
  
  res.json(sortedResults);
});

// Перезагрузка вопросов из файла (для обновления без перезапуска сервера)
app.post('/api/reload-questions', (req, res) => {
  const { quizId } = req.body;
  
  if (quizId === 'friends-quiz') {
    // Сначала пробуем загрузить из Quiz/GNU.txt, если нет - из questions.txt
    const gnuQuestionsPath = path.join(__dirname, 'Quiz', 'GNU.txt');
    const defaultQuestionsPath = path.join(__dirname, 'questions.txt');
    
    let questionsFilePath = gnuQuestionsPath;
    if (!fs.existsSync(gnuQuestionsPath)) {
      questionsFilePath = defaultQuestionsPath;
    }
    
    const loadedQuestions = loadQuestionsFromFile(questionsFilePath);
    quizzes['friends-quiz'].questions = loadedQuestions;
    
    res.json({ 
      success: true, 
      message: `Вопросы перезагружены. Загружено ${loadedQuestions.length} вопросов (перемешано).`,
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
  server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT}/index.html для выбора квиза`);
    console.log(`Или http://localhost:${PORT}/player.html для игроков`);
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

