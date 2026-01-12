/**
 * Solo Game Engine
 * Одиночный режим с лидербордом
 */

const { getRoomManager } = require('../core/rooms');
const { getEventBus, GAME_EVENTS } = require('../core/events');

const roomManager = getRoomManager();
const eventBus = getEventBus();

const questionTimers = new Map();

const SoloGame = {
  name: 'Solo',
  description: 'Одиночный режим с рейтингом',
  roles: ['player'],

  /**
   * Создает комнату для соло-игры
   */
  createRoom(roomCode, settings = {}) {
    const { quizData } = settings;

    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
      throw new Error('Quiz data required with questions');
    }

    const room = roomManager.createRoom(roomCode, 'solo', settings);
    
    room.gameState = {
      quizId: quizData.id,
      quizName: quizData.name,
      questions: quizData.questions,
      currentQuestion: -1,
      answers: [],
      startTime: null,
      questionStartTime: null
    };

    room.phase = 'waiting';
    room.ui = {
      title: quizData.name || 'Solo Quiz',
      quizId: quizData.id
    };

    return room;
  },

  /**
   * Присоединение клиента к комнате
   */
  join(room, client) {
    const { socketId, name } = client;

    // В соло режиме только один игрок
    if (room.players.length > 0) {
      throw new Error('Solo mode: room already occupied');
    }

    room.players.push({
      id: socketId,
      name,
      score: 0,
      isConnected: true,
      correctAnswers: 0,
      totalAnswers: 0
    });

    eventBus.emitGameEvent(GAME_EVENTS.PLAYER_JOINED, {
      roomCode: room.roomCode,
      playerName: name
    });

    // Автостарт
    setTimeout(() => {
      this._start(room);
    }, 1000);
  },

  /**
   * Обработка игровых действий
   */
  handleAction(room, client, action) {
    const { type, payload } = action;

    switch (type) {
      case 'answer':
        this._handleAnswer(room, client, payload);
        break;
      default:
        console.warn(`Unknown solo action type: ${type}`);
    }
  },

  /**
   * Получение состояния для клиента
   */
  getState(room, role) {
    const player = room.players[0] || {};
    
    return {
      roomCode: room.roomCode,
      gameId: room.gameId,
      phase: room.phase,
      phaseEndsAt: room.phaseEndsAt,
      players: [{
        id: player.id,
        name: player.name,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalAnswers: player.totalAnswers
      }],
      ui: { ...room.ui },
      meta: room.meta
    };
  },

  /**
   * Обработка отключения
   */
  leave(room, client) {
    const player = room.players.find(p => p.id === client.socketId);
    if (player) {
      player.isConnected = false;
      // В соло режиме можно удалить комнату сразу
      setTimeout(() => {
        roomManager.deleteRoom(room.roomCode);
      }, 5000);
    }
  },

  // === Приватные методы ===

  _start(room) {
    room.phase = 'playing';
    room.gameState.startTime = Date.now();

    eventBus.emitGameEvent(GAME_EVENTS.GAME_STARTED, {
      roomCode: room.roomCode
    });

    setTimeout(() => {
      this._showNextQuestion(room);
    }, 1000);
  },

  _showNextQuestion(room) {
    const gs = room.gameState;
    gs.currentQuestion++;

    if (gs.currentQuestion >= gs.questions.length) {
      this._endGame(room);
      return;
    }

    const question = gs.questions[gs.currentQuestion];
    const timeLimit = question.time || 30;

    room.phase = 'question';
    room.phaseEndsAt = Date.now() + timeLimit * 1000;
    gs.questionStartTime = Date.now();

    room.ui = {
      title: room.gameState.quizName,
      quizId: gs.quizId,
      question: {
        text: question.question,
        options: question.options,
        questionNumber: gs.currentQuestion + 1,
        totalQuestions: gs.questions.length
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.QUESTION_SHOWN, {
      roomCode: room.roomCode,
      questionNumber: gs.currentQuestion + 1
    });

    // Автоматический переход при timeout
    const timer = setTimeout(() => {
      if (room.phase === 'question') {
        // Пропуск вопроса
        this._handleAnswer(room, { socketId: room.players[0].id }, { answerIndex: -1, timeout: true });
      }
      questionTimers.delete(room.roomCode);
    }, timeLimit * 1000);

    questionTimers.set(room.roomCode, timer);
  },

  _handleAnswer(room, client, payload) {
    const { answerIndex, timeout = false } = payload;
    const player = room.players[0];
    
    if (!player || room.phase !== 'question') {
      return;
    }

    // Останавливаем таймер
    if (questionTimers.has(room.roomCode)) {
      clearTimeout(questionTimers.get(room.roomCode));
      questionTimers.delete(room.roomCode);
    }

    const gs = room.gameState;
    const question = gs.questions[gs.currentQuestion];
    const isCorrect = !timeout && answerIndex === question.correct;
    const answerTime = Date.now() - gs.questionStartTime;

    player.totalAnswers++;
    
    if (isCorrect) {
      player.correctAnswers++;
      const timeBonus = Math.max(0, question.time * 1000 - answerTime);
      const points = 100 + Math.floor(timeBonus / 100);
      player.score += points;

      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_CORRECT, {
        roomCode: room.roomCode,
        playerId: player.id,
        points
      });
    } else if (!timeout) {
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_WRONG, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    gs.answers.push({
      questionIndex: gs.currentQuestion,
      answerIndex,
      isCorrect,
      answerTime,
      timeout
    });

    // Показываем следующий вопрос через задержку
    setTimeout(() => {
      this._showNextQuestion(room);
    }, timeout ? 100 : 1500);
  },

  _endGame(room) {
    room.phase = 'finished';
    room.phaseEndsAt = null;

    const player = room.players[0];
    
    room.ui = {
      title: 'Игра завершена!',
      results: {
        final: true,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalQuestions: room.gameState.questions.length,
        playerName: player.name,
        quizId: room.gameState.quizId
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.GAME_FINISHED, {
      roomCode: room.roomCode,
      playerName: player.name,
      score: player.score
    });

    console.log(`🏁 Solo game finished: ${player.name} scored ${player.score}`);
  }
};

module.exports = SoloGame;

