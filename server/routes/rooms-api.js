/**
 * Unified Rooms API
 * REST API для создания и управления комнатами
 */

const express = require('express');
const router = express.Router();
const { getRoomManager } = require('../core/rooms');
const { getGameRegistry } = require('../games/index');
const { loadAllQuizzes } = require('../utils/quiz-loader');
const fs = require('fs');
const path = require('path');

const roomManager = getRoomManager();
const gameRegistry = getGameRegistry();

// Загружаем квизы
let quizzes = {};
try {
  quizzes = loadAllQuizzes();
  console.log('✅ Quizzes loaded for rooms API');
} catch (error) {
  console.error('❌ Failed to load quizzes:', error);
}

/**
 * Генерация кода комнаты
 */
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Загрузка вопросов для ЧГК
 */
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
    
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      continue;
    }
    
    if (line.match(/^Q\d*:/)) {
      if (currentQuestion && currentQuestion.answer) {
        if (currentQuestion.time === null || currentQuestion.time === undefined) {
          currentQuestion.time = currentQuestion.id <= 4 ? 30 : 60;
        }
        questions.push(currentQuestion);
      }
      
      const questionText = line.replace(/^Q\d*:\s*/, '').trim();
      currentQuestion = {
        id: questionId++,
        question: questionText,
        answer: null,
        time: null
      };
    } else if (line.match(/^A\d*:/) && currentQuestion) {
      const answerText = line.replace(/^A\d*:\s*/, '').trim();
      currentQuestion.answer = answerText;
    } else if ((line.match(/^T\s*:/) || line.match(/^TIME\s*:/)) && currentQuestion) {
      const timeMatch = line.match(/^(?:T|TIME)\s*:\s*(\d+)/);
      if (timeMatch) {
        currentQuestion.time = parseInt(timeMatch[1], 10);
      }
    }
  }
  
  if (currentQuestion && currentQuestion.answer) {
    if (currentQuestion.time === null || currentQuestion.time === undefined) {
      currentQuestion.time = currentQuestion.id <= 4 ? 30 : 60;
    }
    questions.push(currentQuestion);
  }
  
  return questions;
}

/**
 * POST /api/rooms
 * Создание новой комнаты
 */
router.post('/', (req, res) => {
  try {
    const { gameId, quizId, password, mode } = req.body;

    if (!gameId) {
      return res.status(400).json({ error: 'Game ID required' });
    }

    const gameEngine = gameRegistry.getGame(gameId);
    if (!gameEngine) {
      return res.status(400).json({ error: `Unknown game: ${gameId}` });
    }

    const roomCode = generateRoomCode();
    let room;

    if (gameId === 'quiz') {
      // Quiz mode
      if (!quizId || !quizzes[quizId]) {
        return res.status(400).json({ error: 'Quiz not found' });
      }

      const quizData = quizzes[quizId];
      room = gameEngine.createRoom(roomCode, {
        quizData,
        mode: mode || 'online',
        password
      });

    } else if (gameId === 'chgk') {
      // CHGK mode
      const questions = loadIntellectualQuestions(quizId || 'chgk');
      
      if (questions.length === 0) {
        return res.status(400).json({ error: 'Questions not found' });
      }

      room = gameEngine.createRoom(roomCode, {
        questions,
        quizId: quizId || 'chgk',
        quizName: 'ЧГК',
        password
      });

    } else if (gameId === 'solo') {
      // Solo mode
      if (!quizId || !quizzes[quizId]) {
        return res.status(400).json({ error: 'Quiz not found' });
      }

      const quizData = quizzes[quizId];
      room = gameEngine.createRoom(roomCode, {
        quizData
      });

    } else {
      return res.status(400).json({ error: 'Game type not supported yet' });
    }

    console.log(`✅ Room created: ${roomCode} (game: ${gameId})`);

    res.json({ 
      roomCode,
      gameId,
      quizId: quizId || null
    });

  } catch (error) {
    console.error('❌ Error creating room:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rooms/:roomCode
 * Получение информации о комнате
 */
router.get('/:roomCode', (req, res) => {
  try {
    const { roomCode } = req.params;
    const room = roomManager.getRoom(roomCode);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const gameEngine = gameRegistry.getGame(room.gameId);
    const state = gameEngine ? gameEngine.getState(room, 'host') : null;

    res.json(state || {
      roomCode: room.roomCode,
      gameId: room.gameId,
      phase: room.phase,
      players: room.players.length
    });

  } catch (error) {
    console.error('❌ Error getting room:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/games
 * Получение списка доступных игр
 */
router.get('/games/list', (req, res) => {
  try {
    const games = gameRegistry.getAllGames();
    res.json({ games });
  } catch (error) {
    console.error('❌ Error getting games:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

