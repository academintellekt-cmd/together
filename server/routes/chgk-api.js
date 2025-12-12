const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Хранилище комнат для ЧГК (отдельно от обычных квизов)
// Это будет экспортироваться для использования в server.js
const intellectualRooms = new Map();

// Загрузка вопросов из txt файла
function loadIntellectualQuestions(quizId) {
  const questionsPath = path.join(__dirname, '../../data/questions', `${quizId}.txt`);
  
  if (!fs.existsSync(questionsPath)) {
    console.warn(`Файл с вопросами не найден: ${questionsPath}`);
    return [];
  }
  
  const content = fs.readFileSync(questionsPath, 'utf8');
  const questions = [];
  const lines = content.split('\n');
  
  let currentQuestion = null;
  let questionId = 1;
  let previousLineWasEmpty = false;
  let lastQuestionNumber = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Пропускаем пустые строки и комментарии
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      previousLineWasEmpty = true;
      continue;
    }
    
    // Вопрос начинается с Q: или Q1:, Q2: и т.д.
    if (line.match(/^Q\d*:/)) {
      // Извлекаем номер вопроса и текст
      const qMatch = line.match(/^Q(\d*):\s*(.*)/);
      const qNumber = qMatch ? (qMatch[1] || null) : null;
      const questionText = qMatch ? qMatch[2].trim() : line.replace(/^Q\d*:\s*/, '').trim();
      
      // Если у текущего вопроса уже есть ответ, значит это новый вопрос
      // Сохраняем предыдущий вопрос
      if (currentQuestion && currentQuestion.answer) {
        questions.push(currentQuestion);
        currentQuestion = null;
        lastQuestionNumber = null;
      }
      // Если у текущего вопроса нет ответа И это тот же номер вопроса (или оба без номера),
      // значит это продолжение вопроса - добавляем к тексту
      // НО только если предыдущая строка НЕ была пустой (иначе это может быть категория)
      else if (currentQuestion && !currentQuestion.answer && qNumber === lastQuestionNumber && !previousLineWasEmpty) {
        currentQuestion.question += (currentQuestion.question ? ' ' : '') + questionText;
        previousLineWasEmpty = false;
        continue;
      }
      // Если у текущего вопроса нет ответа И это тот же номер, но предыдущая строка была пустой,
      // проверяем: если текст короткий (менее 20 символов), это категория - сбрасываем
      // Если длинный - это продолжение вопроса
      else if (currentQuestion && !currentQuestion.answer && qNumber === lastQuestionNumber && previousLineWasEmpty) {
        if (currentQuestion.question.length < 20) {
          // Короткий текст - это категория, сбрасываем
          currentQuestion = null;
          lastQuestionNumber = null;
        } else {
          // Длинный текст - это продолжение вопроса
          currentQuestion.question += (currentQuestion.question ? ' ' : '') + questionText;
          previousLineWasEmpty = false;
          continue;
        }
      }
      // Если у текущего вопроса нет ответа И это другой номер вопроса (или предыдущая строка была пустой),
      // значит предыдущий был категорией/заголовком - сбрасываем его
      else if (currentQuestion && !currentQuestion.answer) {
        currentQuestion = null;
        lastQuestionNumber = null;
      }
      
      // Создаем новый вопрос
      currentQuestion = {
        id: questionId++,
        question: questionText,
        answer: null,
        time: 60 // Значение по умолчанию - 60 секунд
      };
      lastQuestionNumber = qNumber;
      previousLineWasEmpty = false;
    }
    // Ответ начинается с A: или A1:, A2: и т.д.
    else if (line.match(/^A\d*:/) && currentQuestion) {
      // Извлекаем текст ответа (убираем A: или A1: и т.д.)
      const answerText = line.replace(/^A\d*:\s*/, '').trim();
      currentQuestion.answer = answerText;
    }
    // Время начинается с T:
    else if (line.match(/^T\s*:/) && currentQuestion) {
      // Извлекаем время (убираем T: и берем число)
      const timeMatch = line.match(/^T\s*:\s*(\d+)/);
      if (timeMatch) {
        currentQuestion.time = parseInt(timeMatch[1], 10);
      }
    }
  }
  
  // Сохраняем последний вопрос
  if (currentQuestion && currentQuestion.answer) {
    questions.push(currentQuestion);
  }
  
  console.log(`📚 Загружено ${questions.length} вопросов для интеллектуальной игры`);
  
  // Отладочная информация - показываем первые 3 вопроса
  if (questions.length > 0) {
    console.log('📋 Первые 3 вопроса:');
    questions.slice(0, 3).forEach((q, i) => {
      const preview = q.question.length > 60 ? q.question.substring(0, 60) + '...' : q.question;
      console.log(`  ${i + 1}. [${q.time}с] ${preview}`);
    });
  }
  
  return questions;
}

// Создание комнаты для интеллектуальной игры
router.post('/create-room', (req, res) => {
  const { quizId } = req.body;
  
  // Генерируем код комнаты
  const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  // Загружаем вопросы (30 вопросов)
  const questions = loadIntellectualQuestions(quizId || 'chgk');
  
  if (questions.length === 0) {
    return res.status(400).json({ error: 'Вопросы не найдены' });
  }
  
  const room = {
    code: roomCode,
    host: null,
    commission: null,
    players: [],
    gameState: 'lobby',
    currentQuestion: 0,
    questions: questions,
    quizId: quizId || 'chgk',
    quizName: 'ЧГК',
    startTime: null,
    questionStartTime: null,
    answers: new Map(),
    verifiedAnswers: new Map(),
    verificationHistory: [],
    password: null,
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  
  intellectualRooms.set(roomCode, room);
  
  // Убеждаемся, что global.intellectualRooms тоже обновлен (если он установлен)
  if (global.intellectualRooms && global.intellectualRooms !== intellectualRooms) {
    global.intellectualRooms.set(roomCode, room);
    console.log(`⚠️ global.intellectualRooms был другим объектом, синхронизировано`);
  }
  
  console.log(`📋 Комната ${roomCode} создана для интеллектуальной игры: ${questions.length} вопросов`);
  console.log(`📋 Всего комнат в intellectualRooms: ${intellectualRooms.size}`);
  console.log(`📋 Коды комнат:`, Array.from(intellectualRooms.keys()));
  if (global.intellectualRooms) {
    console.log(`📋 Всего комнат в global.intellectualRooms: ${global.intellectualRooms.size}`);
    console.log(`📋 Коды комнат в global:`, Array.from(global.intellectualRooms.keys()));
  }
  
  res.json({ roomCode });
});

// Получение информации о комнате
router.get('/room/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const room = intellectualRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }
  
  res.json({
    code: room.code,
    quizName: room.quizName,
    players: room.players,
    gameState: room.gameState,
    currentQuestion: room.currentQuestion,
    totalQuestions: room.questions.length
  });
});

// Получение ответов для проверки
router.get('/answers/:roomCode/:questionIndex', (req, res) => {
  const { roomCode, questionIndex } = req.params;
  const room = intellectualRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }
  
  const questionIdx = parseInt(questionIndex);
  if (questionIdx < 0 || questionIdx >= room.questions.length) {
    return res.status(400).json({ error: 'Неверный индекс вопроса' });
  }
  
  const answers = [];
  
  room.answers.forEach((answerData, playerId) => {
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      const verification = room.verifiedAnswers.get(playerId);
      answers.push({
        playerId,
        playerName: player.name,
        answer: answerData.text,
        time: answerData.time,
        submittedAt: answerData.submittedAt,
        verified: !!verification,
        verification: verification ? {
          isCorrect: verification.isCorrect,
          score: verification.score,
          verifiedAt: verification.verifiedAt
        } : null
      });
    }
  });
  
  res.json({ 
    question: room.questions[questionIdx],
    answers,
    questionIndex: questionIdx
  });
});

// Проверка ответа комиссией
router.post('/verify-answer', (req, res) => {
  const { roomCode, questionIndex, playerId, isCorrect, score } = req.body;
  const room = intellectualRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }
  
  // Сохраняем проверку
  const verification = {
    isCorrect: Boolean(isCorrect),
    score: parseInt(score) || 0,
    verifiedAt: Date.now(),
    verifiedBy: req.commissionSocketId || 'unknown',
    history: []
  };
  
  // Если уже была проверка, добавляем в историю
  const existingVerification = room.verifiedAnswers.get(playerId);
  if (existingVerification) {
    verification.history = existingVerification.history || [];
    verification.history.push({
      ...existingVerification,
      action: 'revoke',
      revokedAt: Date.now()
    });
  }
  
  verification.history.push({
    isCorrect: verification.isCorrect,
    score: verification.score,
    verifiedAt: verification.verifiedAt,
    verifiedBy: verification.verifiedBy,
    action: 'verify'
  });
  
  // Сохраняем playerId в объекте verification для правильного сопоставления
  verification.playerId = playerId;
  
  // Находим правильный ключ для хранения (может быть socket.id или playerId)
  // Проверяем, есть ли ответ с таким playerId
  let storageKey = playerId;
  for (const [socketId, answer] of room.answers.entries()) {
    if (answer.playerId === playerId || socketId === playerId) {
      storageKey = socketId; // Используем socket.id как ключ
      break;
    }
  }
  
  room.verifiedAnswers.set(storageKey, verification);
  
  // Добавляем в историю изменений
  room.verificationHistory.push({
    playerId,
    questionIndex: parseInt(questionIndex),
    action: existingVerification ? 'revoke-and-verify' : 'verify',
    timestamp: Date.now(),
    data: verification
  });
  
  // Обновляем счет игрока
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    // Отнимаем старый счет, если была предыдущая проверка
    if (existingVerification) {
      player.score -= existingVerification.score;
    }
    // Добавляем новый счет
    player.score += verification.score;
  }
  
  room.lastActivity = Date.now();
  
  console.log(`✅ Ответ игрока ${playerId} проверен: ${isCorrect ? 'правильно' : 'неправильно'}, баллов: ${verification.score}`);
  
  res.json({ success: true, verification });
});

// Отмена решения комиссии
router.post('/revoke-verification', (req, res) => {
  const { roomCode, questionIndex, playerId } = req.body;
  const room = intellectualRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }
  
  const verification = room.verifiedAnswers.get(playerId);
  if (!verification) {
    return res.status(404).json({ error: 'Проверка не найдена' });
  }
  
  // Отнимаем счет игрока
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.score -= verification.score;
  }
  
  // Добавляем в историю отмены
  if (verification.history) {
    verification.history.push({
      ...verification,
      action: 'revoke',
      revokedAt: Date.now()
    });
  }
  
  // Удаляем проверку
  room.verifiedAnswers.delete(playerId);
  
  // Добавляем в историю изменений
  room.verificationHistory.push({
    playerId,
    questionIndex: parseInt(questionIndex),
    action: 'revoke',
    timestamp: Date.now(),
    data: { ...verification, revoked: true }
  });
  
  room.lastActivity = Date.now();
  
  console.log(`🔄 Проверка ответа игрока ${playerId} отменена`);
  
  res.json({ success: true });
});

// Получение истории проверок для конкретного игрока
router.get('/verification-history/:roomCode/:playerId/:questionIndex', (req, res) => {
  const { roomCode, playerId, questionIndex } = req.params;
  const room = intellectualRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }
  
  const history = room.verificationHistory.filter(
    entry => entry.playerId === playerId && 
             entry.questionIndex === parseInt(questionIndex)
  );
  
  res.json({ history });
});

// Экспортируем хранилище комнат для использования в server.js
module.exports = { router, intellectualRooms };

