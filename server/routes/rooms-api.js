/**
 * Unified Rooms API
 * REST API для создания и управления комнатами
 */

const express = require('express');
const router = express.Router();
const { getRoomManager } = require('../core/rooms');
const { getGameRegistry } = require('../games/index');
const { loadAllQuizzes } = require('../utils/quiz-loader');

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

