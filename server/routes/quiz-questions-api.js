const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Хранилище комнат для quiz-questions (отдельно от обычных квизов)
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
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Пропускаем пустые строки и комментарии
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      continue;
    }
    
    // Вопрос начинается с Q:
    if (line.startsWith('Q:')) {
      // Сохраняем предыдущий вопрос, если есть
      if (currentQuestion && currentQuestion.answer) {
        questions.push(currentQuestion);
      }
      
      currentQuestion = {
        id: questionId++,
        question: line.substring(2).trim(),
        answer: null
      };
    }
    // Ответ начинается с A:
    else if (line.startsWith('A:') && currentQuestion) {
      currentQuestion.answer = line.substring(2).trim();
    }
  }
  
  // Сохраняем последний вопрос
  if (currentQuestion && currentQuestion.answer) {
    questions.push(currentQuestion);
  }
  
  console.log(`📚 Загружено ${questions.length} вопросов для интеллектуальной игры`);
  return questions;
}

// Создание комнаты для интеллектуальной игры
router.post('/create-room', (req, res) => {
  const { quizId } = req.body;
  
  // Генерируем код комнаты
  const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  // Загружаем вопросы (30 вопросов)
  const questions = loadIntellectualQuestions(quizId || 'quiz-questions');
  
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
    quizId: quizId || 'quiz-questions',
    quizName: 'Квиз-Questions',
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
  
  console.log(`📋 Комната ${roomCode} создана для интеллектуальной игры: ${questions.length} вопросов`);
  
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

