/**
 * CHGK (ЧГК) Game Engine
 * Интеллектуальная игра с текстовыми ответами и проверкой жюри
 */

const { getRoomManager } = require('../core/rooms');
const { getEventBus, GAME_EVENTS } = require('../core/events');

const roomManager = getRoomManager();
const eventBus = getEventBus();

// Хранилище таймеров
const questionTimers = new Map();

const CHGKGame = {
  name: 'ЧГК',
  description: 'Что? Где? Когда? - интеллектуальная игра',
  roles: ['host', 'player', 'commission'],

  /**
   * Создает комнату для ЧГК
   */
  createRoom(roomCode, settings = {}) {
    const { questions, quizId = 'chgk', quizName = 'ЧГК', password = null } = settings;

    if (!questions || questions.length === 0) {
      throw new Error('Questions required for CHGK');
    }

    const room = roomManager.createRoom(roomCode, 'chgk', settings);
    
    // Специфичные для chgk данные
    room.gameState = {
      password,
      quizId,
      quizName,
      questions,
      currentQuestion: -1,
      answers: new Map(), // playerId -> { text, time, submittedAt }
      verifiedAnswers: new Map(), // playerId -> { isCorrect, score, verifiedAt }
      verificationHistory: [],
      startTime: null,
      questionStartTime: null
    };

    room.phase = 'lobby';
    room.ui = {
      title: quizName || 'ЧГК',
      quizId
    };

    eventBus.emitGameEvent(GAME_EVENTS.GAME_CREATED, {
      roomCode,
      gameId: 'chgk'
    });

    return room;
  },

  /**
   * Присоединение клиента к комнате
   */
  join(room, client) {
    const { role, socketId, name } = client;

    if (role === 'host') {
      room.host = { id: socketId, isConnected: true };
      console.log(`🎮 Host joined CHGK room ${room.roomCode}`);
    } else if (role === 'commission') {
      // Комиссия (жюри)
      if (!room.commission) {
        room.commission = [];
      }
      if (!room.commission.find(c => c.id === socketId)) {
        room.commission.push({ id: socketId, isConnected: true });
      }
      console.log(`👨‍⚖️ Commission member joined room ${room.roomCode}`);
    } else if (role === 'player') {
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
        console.log(`🔄 Player reconnected: ${name}`);
      } else {
        // Новое подключение
        if (room.phase !== 'lobby') {
          throw new Error('Game already started, cannot join');
        }

        room.players.push({
          id: socketId,
          name,
          score: 0,
          isConnected: true,
          answers: [] // История ответов игрока
        });

        eventBus.emitGameEvent(GAME_EVENTS.PLAYER_JOINED, {
          roomCode: room.roomCode,
          playerName: name,
          playerId: socketId
        });

        console.log(`✅ Player joined CHGK: ${name}`);
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
      case 'submit':
        this._handleSubmit(room, client, payload);
        break;
      case 'verify':
        this._handleVerify(room, client, payload);
        break;
      case 'next-question':
        this._handleNextQuestion(room, client);
        break;
      case 'show-question':
        this._handleShowQuestion(room, client);
        break;
      default:
        console.warn(`Unknown CHGK action type: ${type}`);
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
        score: p.score
      })),
      host: room.host,
      ui: { ...room.ui },
      meta: room.meta
    };

    // Разная видимость для разных ролей
    if (role === 'commission') {
      // Жюри видит все ответы и может проверять
      const gs = room.gameState;
      if (state.phase === 'answering' || state.phase === 'verification') {
        const answers = [];
        gs.answers.forEach((answerData, playerId) => {
          const player = room.players.find(p => p.id === playerId);
          const verification = gs.verifiedAnswers.get(playerId);
          
          if (player) {
            answers.push({
              playerId,
              playerName: player.name,
              answer: answerData.text,
              time: answerData.time,
              submittedAt: answerData.submittedAt,
              verified: !!verification,
              verification: verification || null
            });
          }
        });
        
        state.ui.answers = answers;
      }
    } else if (role === 'player') {
      // Игроки видят только свои ответы до проверки
      if (state.phase === 'answering' && state.ui.question) {
        delete state.ui.question.answer; // Скрываем правильный ответ
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
      console.log(`👋 Player left CHGK: ${player.name}`);
      
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_LEFT, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    if (room.host && room.host.id === client.socketId) {
      room.host.isConnected = false;
      console.log(`👋 Host left CHGK room ${room.roomCode}`);
    }

    if (room.commission) {
      const commissionMember = room.commission.find(c => c.id === client.socketId);
      if (commissionMember) {
        commissionMember.isConnected = false;
        console.log(`👋 Commission member left room ${room.roomCode}`);
      }
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
    room.players.forEach(p => p.score = 0);

    eventBus.emitGameEvent(GAME_EVENTS.GAME_STARTED, {
      roomCode: room.roomCode,
      playerCount: activePlayers.length
    });

    console.log(`🎮 CHGK started in room ${room.roomCode}`);

    // Хост показывает первый вопрос вручную
    room.ui = {
      title: room.gameState.quizName,
      message: 'Ожидание начала вопроса...'
    };
  },

  _handleShowQuestion(room, client) {
    // Только хост может показать вопрос
    if (!room.host || room.host.id !== client.socketId) {
      throw new Error('Only host can show question');
    }

    const gs = room.gameState;
    gs.currentQuestion++;

    if (gs.currentQuestion >= gs.questions.length) {
      this._endGame(room);
      return;
    }

    const question = gs.questions[gs.currentQuestion];
    const timeLimit = question.time || 60;

    room.phase = 'answering';
    room.phaseEndsAt = Date.now() + timeLimit * 1000;
    gs.answers.clear();
    gs.verifiedAnswers.clear();
    gs.questionStartTime = Date.now();

    room.ui = {
      title: room.gameState.quizName,
      quizId: gs.quizId,
      question: {
        text: question.question,
        answer: question.answer, // Будет скрыто для игроков
        questionNumber: gs.currentQuestion + 1,
        totalQuestions: gs.questions.length,
        comment: question.comment || null
      }
    };

    eventBus.emitGameEvent(GAME_EVENTS.QUESTION_SHOWN, {
      roomCode: room.roomCode,
      questionNumber: gs.currentQuestion + 1
    });

    // Таймер автоматического перехода к проверке
    const timer = setTimeout(() => {
      if (room.phase === 'answering') {
        this._startVerification(room);
      }
      questionTimers.delete(room.roomCode);
    }, timeLimit * 1000);

    questionTimers.set(room.roomCode, timer);
  },

  _handleSubmit(room, client, payload) {
    if (room.phase !== 'answering') {
      throw new Error('Not in answering phase');
    }

    const { text } = payload;
    const player = room.players.find(p => p.id === client.socketId);
    
    if (!player) {
      throw new Error('Player not found');
    }

    const gs = room.gameState;
    const answerTime = Date.now() - gs.questionStartTime;

    // Сохраняем ответ (можно перезаписать до окончания времени)
    gs.answers.set(player.id, {
      text: text.trim(),
      time: answerTime,
      submittedAt: Date.now()
    });

    eventBus.emitGameEvent(GAME_EVENTS.PLAYER_ANSWERED, {
      roomCode: room.roomCode,
      playerId: player.id
    });

    console.log(`📝 ${player.name} submitted answer in CHGK`);
  },

  _startVerification(room) {
    // Останавливаем таймер если еще работает
    if (questionTimers.has(room.roomCode)) {
      clearTimeout(questionTimers.get(room.roomCode));
      questionTimers.delete(room.roomCode);
    }

    room.phase = 'verification';
    room.phaseEndsAt = null;

    const gs = room.gameState;
    const question = gs.questions[gs.currentQuestion];

    room.ui = {
      title: room.gameState.quizName,
      quizId: gs.quizId,
      question: {
        text: question.question,
        answer: question.answer,
        questionNumber: gs.currentQuestion + 1,
        totalQuestions: gs.questions.length
      },
      message: 'Проверка ответов жюри...'
    };

    console.log(`👨‍⚖️ Verification started for question ${gs.currentQuestion + 1}`);
  },

  _handleVerify(room, client, payload) {
    if (room.phase !== 'verification') {
      throw new Error('Not in verification phase');
    }

    // Проверяем, что это комиссия
    const isCommission = room.commission && room.commission.some(c => c.id === client.socketId);
    if (!isCommission) {
      throw new Error('Only commission can verify answers');
    }

    const { playerId, isCorrect, score } = payload;
    const player = room.players.find(p => p.id === playerId);
    
    if (!player) {
      throw new Error('Player not found');
    }

    const gs = room.gameState;
    
    // Сохраняем проверку
    const verification = {
      isCorrect: Boolean(isCorrect),
      score: parseInt(score) || 0,
      verifiedAt: Date.now(),
      verifiedBy: client.socketId
    };

    gs.verifiedAnswers.set(playerId, verification);
    gs.verificationHistory.push({
      questionIndex: gs.currentQuestion,
      playerId,
      playerName: player.name,
      ...verification
    });

    // Обновляем счет игрока
    if (isCorrect) {
      player.score += verification.score;
      
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_CORRECT, {
        roomCode: room.roomCode,
        playerId: player.id,
        points: verification.score
      });
    } else {
      eventBus.emitGameEvent(GAME_EVENTS.PLAYER_WRONG, {
        roomCode: room.roomCode,
        playerId: player.id
      });
    }

    console.log(`✅ Answer verified for ${player.name}: ${isCorrect ? 'correct' : 'wrong'}`);
  },

  _handleNextQuestion(room, client) {
    // Только хост может перейти к следующему вопросу
    if (!room.host || room.host.id !== client.socketId) {
      throw new Error('Only host can proceed to next question');
    }

    if (room.phase !== 'verification') {
      throw new Error('Not in verification phase');
    }

    const gs = room.gameState;
    
    // Проверяем, есть ли еще вопросы
    if (gs.currentQuestion + 1 >= gs.questions.length) {
      this._endGame(room);
    } else {
      // Возвращаемся в режим playing, хост покажет следующий вопрос
      room.phase = 'playing';
      room.ui = {
        title: room.gameState.quizName,
        message: 'Ожидание следующего вопроса...'
      };
    }
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

    console.log(`🏁 CHGK finished in room ${room.roomCode}`);
  }
};

module.exports = CHGKGame;

