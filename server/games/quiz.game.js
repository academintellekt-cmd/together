/**
 * Quiz Game Engine
 * Игра с вариантами ответов и быстрым ответом
 */

const { getRoomManager } = require('../core/rooms');
const { getEventBus, GAME_EVENTS } = require('../core/events');

const roomManager = getRoomManager();
const eventBus = getEventBus();

// Хранилище таймеров
const questionTimers = new Map();

const QuizGame = {
  name: 'Quiz',
  description: 'Квиз с вариантами ответов',
  roles: ['host', 'player', 'station'],

  /**
   * Создает комнату для квиза
   */
  createRoom(roomCode, settings = {}) {
    const { quizData, mode = 'online', password = null } = settings;

    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
      throw new Error('Quiz data required with questions');
    }

    const room = roomManager.createRoom(roomCode, 'quiz', settings);
    
    // Специфичные для quiz данные
    room.gameState = {
      mode, // 'online' или 'local'
      password,
      quizId: quizData.id,
      quizName: quizData.name,
      questions: quizData.questions,
      currentQuestion: -1,
      answers: new Map(), // socket.id -> answer data
      readyPlayers: new Set(),
      startTime: null,
      questionStartTime: null
    };

    room.phase = 'lobby';
    room.ui = {
      title: quizData.name || 'Квиз',
      quizId: quizData.id
    };

    eventBus.emitGameEvent(GAME_EVENTS.GAME_CREATED, {
      roomCode,
      gameId: 'quiz',
      mode
    });

    return room;
  },

  /**
   * Присоединение клиента к комнате
   */
  join(room, client) {
    const { role, socketId, name, stationId } = client;

    if (role === 'host') {
      room.host = { id: socketId, isConnected: true };
      console.log(`🎮 Host joined room ${room.roomCode}`);
    } else if (role === 'player' || role === 'station') {
      // Проверка на переподключение
      const existingPlayer = room.players.find(p => 
        p.name && name && p.name.toLowerCase() === name.toLowerCase()
      );

      if (existingPlayer) {
        // Переподключение
        if (existingPlayer.isConnected && existingPlayer.id !== socketId) {
          throw new Error('Player with this name is already connected');
        }
        existingPlayer.id = socketId;
        existingPlayer.isConnected = true;
        existingPlayer.stationId = stationId || existingPlayer.stationId;
        console.log(`🔄 Player reconnected: ${name}`);
      } else {
        // Новое подключение
        if (room.phase !== 'lobby') {
          throw new Error('Game already started, cannot join');
        }

        const activePlayerCount = room.players.filter(p => p.isConnected).length;
        if (activePlayerCount >= 14) {
          throw new Error('Room is full (max 14 players)');
        }

        room.players.push({
          id: socketId,
          name,
          score: 0,
          isReady: false,
          isConnected: true,
          stationId: stationId || null
        });

        eventBus.emitGameEvent(GAME_EVENTS.PLAYER_JOINED, {
          roomCode: room.roomCode,
          playerName: name,
          playerId: socketId
        });

        console.log(`✅ Player joined: ${name} (station: ${stationId || 'online'})`);
      }
    }

    roomManager.touchRoom(room.roomCode);
  },

  /**
   * Обработка игровых действий
   */
  handleAction(room, client, action) {
    const { type, payload } = action;

    switch (type) {
      case 'start':
        this._handleStart(room, client);
        break;
      case 'answer':
        this._handleAnswer(room, client, payload);
        break;
      case 'ready':
        this._handleReady(room, client);
        break;
      case 'next-question':
        this._handleNextQuestion(room, client);
        break;
      default:
        console.warn(`Unknown action type: ${type}`);
    }
  },

  /**
   * Получение состояния для клиента
   */
  getState(room, role) {
    const state = {
      roomCode: room.roomCode,
      gameId: room.gameId,
      phase: room.phase,
      phaseEndsAt: room.phaseEndsAt,
      players: room.players.filter(p => p.isConnected).map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isReady: p.isReady,
        stationId: p.stationId
      })),
      host: room.host,
      ui: { ...room.ui },
      meta: room.meta
    };

    // Фильтруем видимость данных по ролям
    if (role === 'player' || role === 'station') {
      // Игроки не видят правильные ответы до показа результатов
      if (state.phase === 'question' && state.ui.question) {
        delete state.ui.question.correct;
      }
    }

    return state;
  },

  /**
   * Обработка отключения
   */
  leave(room, client) {
    const player = room.players.find(p => p.id === client.socketId);
    if (player) {
      player.isConnected = false;
      console.log(`👋 Player left: ${player.name}`);
      
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_LEFT, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    if (room.host && room.host.id === client.socketId) {
      room.host.isConnected = false;
      console.log(`👋 Host left room ${room.roomCode}`);
    }
  },

  // === Приватные методы ===

  _handleStart(room, client) {
    if (room.phase !== 'lobby') {
      throw new Error('Game already started');
    }

    const activePlayers = room.players.filter(p => p.isConnected);
    if (activePlayers.length === 0) {
      throw new Error('No players in room');
    }

    room.phase = 'playing';
    room.gameState.currentQuestion = -1;
    room.gameState.answers.clear();
    room.players.forEach(p => {
      p.score = 0;
      p.isReady = false;
    });

    eventBus.emitGameEvent(GAME_EVENTS.GAME_STARTED, {
      roomCode: room.roomCode,
      playerCount: activePlayers.length
    });

    console.log(`🎮 Quiz started in room ${room.roomCode}`);

    // Показываем первый вопрос через 2 секунды
    setTimeout(() => {
      this._showNextQuestion(room);
    }, 2000);
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
    gs.answers.clear();
    gs.readyPlayers.clear();
    gs.questionStartTime = Date.now();

    room.ui = {
      title: room.gameState.quizName,
      quizId: gs.quizId,
      question: {
        text: question.question,
        options: question.options,
        questionNumber: gs.currentQuestion + 1,
        totalQuestions: gs.questions.length,
        correct: question.correct // Будет удалено для игроков в getState
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.QUESTION_SHOWN, {
      roomCode: room.roomCode,
      questionNumber: gs.currentQuestion + 1
    });

    // Таймер автоматического перехода к результатам
    const timer = setTimeout(() => {
      if (room.phase === 'question') {
        this._showResults(room);
      }
      questionTimers.delete(room.roomCode);
    }, timeLimit * 1000);

    questionTimers.set(room.roomCode, timer);
  },

  _handleAnswer(room, client, payload) {
    if (room.phase !== 'question') {
      throw new Error('Not in question phase');
    }

    const { answerIndex } = payload;
    const player = room.players.find(p => p.id === client.socketId);
    if (!player) {
      throw new Error('Player not found');
    }

    const gs = room.gameState;
    
    // Проверяем, не ответил ли уже
    if (gs.answers.has(player.id)) {
      console.warn(`⚠️ Player ${player.name} already answered`);
      return;
    }

    const question = gs.questions[gs.currentQuestion];
    const isCorrect = answerIndex === question.correct;
    const answerTime = Date.now() - gs.questionStartTime;

    gs.answers.set(player.id, {
      playerId: player.id,
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

      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_CORRECT, {
        roomCode: room.roomCode,
        playerId: player.id,
        points
      });
    } else {
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_WRONG, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    eventBus.emitGameEvent(GAME_EVENTS.PLAYER_ANSWERED, {
      roomCode: room.roomCode,
      playerId: player.id,
      isCorrect
    });

    // Проверяем, все ли ответили
    const activePlayers = room.players.filter(p => p.isConnected);
    if (gs.answers.size === activePlayers.length && activePlayers.length > 0) {
      // Останавливаем таймер
      if (questionTimers.has(room.roomCode)) {
        clearTimeout(questionTimers.get(room.roomCode));
        questionTimers.delete(room.roomCode);
      }
      // Показываем результаты через небольшую задержку
      setTimeout(() => {
        if (room.phase === 'question') {
          this._showResults(room);
        }
      }, 750);
    }
  },

  _showResults(room) {
    // Останавливаем таймер если еще работает
    if (questionTimers.has(room.roomCode)) {
      clearTimeout(questionTimers.get(room.roomCode));
      questionTimers.delete(room.roomCode);
    }

    const gs = room.gameState;
    const question = gs.questions[gs.currentQuestion];

    room.phase = 'results';
    room.phaseEndsAt = null;

    const results = Array.from(gs.answers.values());
    const sortedPlayers = [...room.players]
      .filter(p => p.isConnected)
      .sort((a, b) => b.score - a.score);

    room.ui = {
      title: room.gameState.quizName,
      quizId: gs.quizId,
      results: {
        correct: question.correct,
        correctAnswerText: question.options[question.correct],
        perPlayer: results,
        leaderboard: sortedPlayers.map(p => ({
          name: p.name,
          score: p.score
        }))
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.QUESTION_ANSWERED, {
      roomCode: room.roomCode,
      results
    });
  },

  _handleReady(room, client) {
    if (room.phase !== 'results') {
      throw new Error('Not in results phase');
    }

    const player = room.players.find(p => p.id === client.socketId);
    if (player) {
      player.isReady = true;
      room.gameState.readyPlayers.add(player.id);

      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_READY, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    // Проверяем, все ли готовы
    const activePlayers = room.players.filter(p => p.isConnected);
    if (room.gameState.readyPlayers.size === activePlayers.length && activePlayers.length > 0) {
      setTimeout(() => {
        this._showNextQuestion(room);
      }, 1000);
    }
  },

  _handleNextQuestion(room, client) {
    // Только хост может принудительно перейти к следующему вопросу
    if (!room.host || room.host.id !== client.socketId) {
      throw new Error('Only host can force next question');
    }

    if (room.phase !== 'results') {
      throw new Error('Not in results phase');
    }

    this._showNextQuestion(room);
  },

  _endGame(room) {
    room.phase = 'finished';
    room.phaseEndsAt = null;

    const finalResults = [...room.players]
      .filter(p => p.isConnected)
      .sort((a, b) => b.score - a.score);

    room.ui = {
      title: 'Игра завершена!',
      results: {
        final: true,
        leaderboard: finalResults.map(p => ({
          name: p.name,
          score: p.score
        }))
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.GAME_FINISHED, {
      roomCode: room.roomCode,
      results: finalResults
    });

    console.log(`🏁 Quiz finished in room ${room.roomCode}`);
  }
};

module.exports = QuizGame;

