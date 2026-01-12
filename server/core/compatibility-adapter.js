/**
 * Compatibility Adapter
 * Обеспечивает обратную совместимость со старыми Socket.IO событиями
 * Транслирует старые события в новый протокол
 */

const { getSocketRouter } = require('./socket-router');
const { getRoomManager } = require('./rooms');
const { loadAllQuizzes } = require('../utils/quiz-loader');

class CompatibilityAdapter {
  constructor(io, socketRouter) {
    this.io = io;
    this.socketRouter = socketRouter;
    this.roomManager = getRoomManager();
    this.quizzes = {};
    
    // Загружаем квизы
    try {
      this.quizzes = loadAllQuizzes();
      console.log('✅ Quizzes loaded for compatibility adapter');
    } catch (error) {
      console.error('❌ Failed to load quizzes:', error);
    }
  }

  /**
   * Инициализирует обработчики старых событий
   */
  initialize() {
    this.io.on('connection', (socket) => {
      // Старые события квиза
      socket.on('host-join', (roomCode) => this._handleHostJoin(socket, roomCode));
      socket.on('player-join', (data) => this._handlePlayerJoin(socket, data));
      socket.on('start-game', (roomCode) => this._handleStartGame(socket, roomCode));
      socket.on('answer', (data) => this._handleAnswer(socket, data));
      socket.on('player-ready', (data) => this._handlePlayerReady(socket, data));
      socket.on('next-question', (roomCode) => this._handleNextQuestion(socket, roomCode));

      // Старые события ЧГК
      socket.on('intellectual-host-join', (data) => this._handleIntellectualHostJoin(socket, data));
      socket.on('intellectual-player-join', (data) => this._handleIntellectualPlayerJoin(socket, data));
      socket.on('intellectual-commission-join', (data) => this._handleIntellectualCommissionJoin(socket, data));
      socket.on('intellectual-start-game', (data) => this._handleIntellectualStartGame(socket, data));
      socket.on('intellectual-show-question', (data) => this._handleIntellectualShowQuestion(socket, data));
      socket.on('intellectual-submit-answer', (data) => this._handleIntellectualSubmitAnswer(socket, data));
      socket.on('intellectual-verify-answer', (data) => this._handleIntellectualVerifyAnswer(socket, data));
      socket.on('intellectual-next-question', (data) => this._handleIntellectualNextQuestion(socket, data));
    });

    console.log('✅ Compatibility adapter initialized');
  }

  // === Quiz compatibility handlers ===

  _handleHostJoin(socket, roomCode) {
    // Вызываем метод socket router напрямую
    this.socketRouter.handleRoomJoin(socket, {
      roomCode,
      role: 'host'
    });
  }

  _handlePlayerJoin(socket, data) {
    const { roomCode, playerName, password } = data;
    
    // Проверяем, существует ли комната
    let room = this.roomManager.getRoom(roomCode);
    
    if (!room) {
      // Комната не найдена - отправляем ошибку по старому протоколу
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Вызываем метод socket router напрямую
    this.socketRouter.handleRoomJoin(socket, {
      roomCode,
      role: 'player',
      name: playerName
    });
  }

  _handleStartGame(socket, roomCode) {
    // Вызываем метод socket router напрямую
    this.socketRouter.handleGameAction(socket, {
      roomCode,
      type: 'start',
      payload: {}
    });
  }

  _handleAnswer(socket, data) {
    const { roomCode, answerIndex } = data;
    // Вызываем метод socket router напрямую
    this.socketRouter.handleGameAction(socket, {
      roomCode,
      type: 'answer',
      payload: { answerIndex }
    });
  }

  _handlePlayerReady(socket, data) {
    const { roomCode } = data;
    // Вызываем метод socket router напрямую
    this.socketRouter.handleGameAction(socket, {
      roomCode,
      type: 'ready',
      payload: {}
    });
  }

  _handleNextQuestion(socket, roomCode) {
    // Вызываем метод socket router напрямую
    this.socketRouter.handleGameAction(socket, {
      roomCode,
      type: 'next-question',
      payload: {}
    });
  }

  // === CHGK compatibility handlers ===

  _handleIntellectualHostJoin(socket, data) {
    const { roomCode } = data;
    socket.emit('room:join', {
      roomCode,
      role: 'host',
      gameId: 'chgk'
    });
  }

  _handleIntellectualPlayerJoin(socket, data) {
    const { roomCode, playerName } = data;
    socket.emit('room:join', {
      roomCode,
      role: 'player',
      gameId: 'chgk',
      name: playerName
    });
  }

  _handleIntellectualCommissionJoin(socket, data) {
    const { roomCode } = data;
    socket.emit('room:join', {
      roomCode,
      role: 'commission',
      gameId: 'chgk'
    });
  }

  _handleIntellectualStartGame(socket, data) {
    const { roomCode } = data;
    socket.emit('game:action', {
      roomCode,
      type: 'start',
      payload: {}
    });
  }

  _handleIntellectualShowQuestion(socket, data) {
    const { roomCode } = data;
    socket.emit('game:action', {
      roomCode,
      type: 'show-question',
      payload: {}
    });
  }

  _handleIntellectualSubmitAnswer(socket, data) {
    const { roomCode, answer } = data;
    socket.emit('game:action', {
      roomCode,
      type: 'submit',
      payload: { text: answer }
    });
  }

  _handleIntellectualVerifyAnswer(socket, data) {
    const { roomCode, playerId, isCorrect, score } = data;
    socket.emit('game:action', {
      roomCode,
      type: 'verify',
      payload: { playerId, isCorrect, score }
    });
  }

  _handleIntellectualNextQuestion(socket, data) {
    const { roomCode } = data;
    socket.emit('game:action', {
      roomCode,
      type: 'next-question',
      payload: {}
    });
  }
}

// Singleton
let compatibilityAdapterInstance = null;

function initializeCompatibilityAdapter(io, socketRouter) {
  if (!compatibilityAdapterInstance) {
    compatibilityAdapterInstance = new CompatibilityAdapter(io, socketRouter);
    compatibilityAdapterInstance.initialize();
  }
  return compatibilityAdapterInstance;
}

function getCompatibilityAdapter() {
  return compatibilityAdapterInstance;
}

module.exports = {
  initializeCompatibilityAdapter,
  getCompatibilityAdapter,
  CompatibilityAdapter
};

