/**
 * Socket.IO роутер для единого протокола
 * Обрабатывает room:join, room:leave, game:action
 */

const { getRoomManager } = require('./rooms');
const { getGameRegistry } = require('../games/index');
const { getEventBus, GAME_EVENTS } = require('./events');

class SocketRouter {
  constructor(io) {
    this.io = io;
    this.roomManager = getRoomManager();
    this.gameRegistry = getGameRegistry();
    this.eventBus = getEventBus();
    this.clients = new Map(); // socket.id -> { roomCode, role, clientId }
  }

  /**
   * Инициализирует обработчики Socket.IO
   */
  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // room:join - подключение к комнате
      socket.on('room:join', (data) => this.handleRoomJoin(socket, data));

      // room:leave - отключение от комнаты
      socket.on('room:leave', (data) => this.handleRoomLeave(socket, data));

      // game:action - игровое действие
      socket.on('game:action', (data) => this.handleGameAction(socket, data));

      // disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });

    // Подписываемся на события игры для автоматической отправки состояния
    this.eventBus.on(GAME_EVENTS.QUESTION_SHOWN, (data) => {
      if (data.roomCode) {
        // Добавляем небольшую задержку, чтобы убедиться, что состояние обновлено
        setTimeout(() => {
          this.broadcastRoomState(data.roomCode);
        }, 50);
      }
    });

    this.eventBus.on(GAME_EVENTS.GAME_STARTED, (data) => {
      if (data.roomCode) {
        // Игра началась, состояние уже обновлено в handleAction
        // но отправляем еще раз на случай асинхронных изменений
        setTimeout(() => {
          this.broadcastRoomState(data.roomCode);
        }, 100);
      }
    });

    this.eventBus.on(GAME_EVENTS.QUESTION_ANSWERED, (data) => {
      if (data.roomCode) {
        this.broadcastRoomState(data.roomCode);
        // Также отправляем ready-status сразу после показа результатов
        setTimeout(() => {
          this._sendReadyStatus(data.roomCode);
        }, 100);
      }
    });

    this.eventBus.on(GAME_EVENTS.GAME_FINISHED, (data) => {
      if (data.roomCode) {
        this.broadcastRoomState(data.roomCode);
      }
    });

    this.eventBus.on(GAME_EVENTS.PLAYER_READY, (data) => {
      if (data.roomCode) {
        // Отправляем ready-status хосту при изменении готовности игрока
        this._sendReadyStatus(data.roomCode);
      }
    });

    console.log('✅ Socket router initialized with unified protocol');
  }

  /**
   * Обрабатывает room:join
   */
  handleRoomJoin(socket, data) {
    try {
      const { roomCode, role, gameId, settings, ...clientData } = data;

      if (!roomCode) {
        return socket.emit('system:error', { message: 'Room code required' });
      }

      // Создаем или получаем комнату
      let room = this.roomManager.getRoom(roomCode);
      
      if (!room) {
        // Создаем новую комнату
        if (!gameId) {
          return socket.emit('system:error', { message: 'Game ID required for new room' });
        }
        
        const gameEngine = this.gameRegistry.getGame(gameId);
        if (!gameEngine) {
          return socket.emit('system:error', { message: `Unknown game: ${gameId}` });
        }

        room = gameEngine.createRoom(roomCode, settings || {});
      }

      // Получаем движок игры
      const gameEngine = this.gameRegistry.getGame(room.gameId);
      if (!gameEngine) {
        return socket.emit('system:error', { message: `Game engine not found: ${room.gameId}` });
      }

      // Присоединяем клиента к комнате
      const client = {
        socketId: socket.id,
        role: role || 'player',
        ...clientData
      };

      gameEngine.join(room, client);
      
      // Сохраняем связь клиента с комнатой
      this.clients.set(socket.id, {
        roomCode,
        role: client.role,
        clientId: client.id || socket.id
      });

      // Присоединяем сокет к комнате Socket.IO
      socket.join(roomCode);

      // Отправляем состояние
      this.broadcastRoomState(roomCode);

      console.log(`✅ ${client.role} joined room ${roomCode} (game: ${room.gameId})`);

    } catch (error) {
      console.error('❌ Error in room:join:', error);
      socket.emit('system:error', { message: error.message });
    }
  }

  /**
   * Обрабатывает room:leave
   */
  handleRoomLeave(socket, data) {
    try {
      const clientInfo = this.clients.get(socket.id);
      if (!clientInfo) return;

      const { roomCode } = clientInfo;
      const room = this.roomManager.getRoom(roomCode);
      if (!room) return;

      const gameEngine = this.gameRegistry.getGame(room.gameId);
      if (gameEngine && gameEngine.leave) {
        gameEngine.leave(room, { socketId: socket.id });
      }

      socket.leave(roomCode);
      this.clients.delete(socket.id);

      this.broadcastRoomState(roomCode);

      console.log(`👋 Client left room ${roomCode}`);

    } catch (error) {
      console.error('❌ Error in room:leave:', error);
    }
  }

  /**
   * Обрабатывает game:action
   */
  handleGameAction(socket, data) {
    try {
      const { roomCode, type, payload } = data;
      
      if (!roomCode || !type) {
        return socket.emit('system:error', { message: 'Invalid action format' });
      }

      const clientInfo = this.clients.get(socket.id);
      const room = this.roomManager.getRoom(roomCode);

      if (!room) {
        return socket.emit('system:error', { message: 'Room not found' });
      }

      const gameEngine = this.gameRegistry.getGame(room.gameId);
      if (!gameEngine) {
        return socket.emit('system:error', { message: 'Game engine not found' });
      }

      // Передаем действие в движок игры
      const client = {
        socketId: socket.id,
        role: clientInfo?.role,
        ...clientInfo
      };

      const action = { type, payload };
      
      // Для answer actions отправляем answer-received игроку
      if (type === 'answer' && room.gameId === 'quiz') {
        try {
          const gs = room.gameState;
          const question = gs?.questions?.[gs.currentQuestion];
          const player = room.players.find(p => p.id === socket.id);
          
          if (question && player) {
            const isCorrect = payload.answerIndex === question.correct;
            const points = isCorrect ? (100 + Math.max(0, Math.floor((question.time * 1000 - (Date.now() - (gs.questionStartTime || Date.now()))) / 100))) : 0;
            
            // Отправляем answer-received перед обработкой
            socket.emit('answer-received', {
              isCorrect,
              correctAnswer: question.options[question.correct],
              points: points,
              newScore: player.score + points
            });
          }
        } catch (err) {
          console.error('Error preparing answer-received:', err);
        }
      }
      
      gameEngine.handleAction(room, client, action);
      
      // Обновляем состояние сразу
      this.broadcastRoomState(roomCode);
      
      // Также обновляем состояние через небольшую задержку,
      // чтобы захватить изменения, которые могут произойти асинхронно (например, setTimeout в _showNextQuestion)
      setTimeout(() => {
        this.broadcastRoomState(roomCode);
      }, 100);

    } catch (error) {
      console.error('❌ Error in game:action:', error);
      socket.emit('system:error', { message: error.message });
    }
  }

  /**
   * Обрабатывает disconnect
   */
  handleDisconnect(socket) {
    try {
      const clientInfo = this.clients.get(socket.id);
      if (clientInfo) {
        this.handleRoomLeave(socket, {});
      }
      console.log(`🔌 Client disconnected: ${socket.id}`);
    } catch (error) {
      console.error('❌ Error in disconnect:', error);
    }
  }

  /**
   * Отправляет состояние комнаты всем клиентам
   */
  broadcastRoomState(roomCode) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const gameEngine = this.gameRegistry.getGame(room.gameId);
    if (!gameEngine) return;

    // Получаем клиентов в комнате
    const socketsInRoom = this.io.sockets.adapter.rooms.get(roomCode);
    if (!socketsInRoom) return;

    // Отправляем каждому клиенту его версию состояния
    for (const socketId of socketsInRoom) {
      const clientInfo = this.clients.get(socketId);
      const role = clientInfo?.role || 'player';
      
      const state = gameEngine.getState(room, role);
      
      // Отправляем новое событие
      this.io.to(socketId).emit('room:state', state);
      
      // Также отправляем старые события для обратной совместимости
      this._emitLegacyEvents(socketId, room, state, role);
    }
    
    // Отправляем player-list-updated ВСЕМ в комнате (независимо от фазы)
    // Это нужно для того, чтобы хост видел новых игроков
    if (room.gameId === 'quiz') {
      const activePlayers = room.players.filter(p => p.isConnected).map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        disconnected: false
      }));
      this.io.to(roomCode).emit('player-list-updated', { players: activePlayers });
    }

    this.roomManager.touchRoom(roomCode);
  }

  /**
   * Отправляет старые события для обратной совместимости
   */
  _emitLegacyEvents(socketId, room, state, role) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;

    // Определяем, подключился ли клиент через старый протокол
    // (проверяем, есть ли у сокета подписки на старые события)
    // Для простоты отправляем старые события всегда, если это quiz
    if (room.gameId !== 'quiz') return;

    const gs = room.gameState || {};
    const ui = state.ui || {};

    switch (state.phase) {
      case 'lobby':
        // Отправляем host-connected для хоста (только при первом подключении)
        if (role === 'host' && room.host && room.host.id === socketId) {
          socket.emit('host-connected', { 
            roomCode: room.roomCode, 
            players: room.players.filter(p => p.isConnected).map(p => ({
              id: p.id,
              name: p.name,
              score: p.score,
              disconnected: false
            }))
          });
        }
        
        // Отправляем player-connected для игроков
        if (role === 'player' && room.players.some(p => p.id === socketId && p.isConnected)) {
          const player = room.players.find(p => p.id === socketId);
          socket.emit('player-connected', {
            playerId: socketId,
            roomCode: room.roomCode,
            quizId: gs.quizId,
            isReconnection: false,
            playerScore: player?.score || 0
          });
        }
        break;

      case 'playing':
        // Отправляем game-started
        socket.emit('game-started');
        break;

      case 'question':
        // Отправляем question
        if (ui.question) {
          socket.emit('question', {
            question: ui.question.text,
            options: ui.question.options,
            questionNumber: ui.question.questionNumber,
            totalQuestions: ui.question.totalQuestions,
            time: ui.question.time || 30,
            quizId: gs.quizId
          });
        }
        break;

      case 'results':
        // Отправляем results
        if (ui.results) {
          socket.emit('results', {
            correctAnswer: ui.results.correct,
            correctAnswerText: ui.results.correctAnswerText,
            results: ui.results.perPlayer || [],
            players: (ui.results.leaderboard || []).map(p => ({
              id: p.id || '',
              name: p.name,
              score: p.score
            }))
          });
          
          // Отправляем ready-status хосту сразу после показа результатов
          if (role === 'host') {
            // Отправляем ready-status с небольшой задержкой, чтобы убедиться, что results уже отправлено
            setTimeout(() => {
              this._sendReadyStatus(room.roomCode);
            }, 150);
          }
        }
        break;

      case 'finished':
        // Отправляем game-finished
        socket.emit('game-finished', {
          results: (ui.results?.leaderboard || []).map(p => ({
            id: p.id || '',
            name: p.name,
            score: p.score
          }))
        });
        break;
    }
  }

  /**
   * Отправляет ready-status хосту
   */
  _sendReadyStatus(roomCode) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room || room.gameId !== 'quiz') return;

    const gs = room.gameState || {};
    const readyPlayers = gs.readyPlayers || new Set();
    const activePlayers = room.players.filter(p => p.isConnected);
    const readyCount = Array.from(readyPlayers).filter(id => 
      activePlayers.some(p => p.id === id)
    ).length;

    // Отправляем только хосту
    if (room.host && room.host.isConnected) {
      const hostSocket = this.io.sockets.sockets.get(room.host.id);
      if (hostSocket) {
        const allReady = readyCount === activePlayers.length && activePlayers.length > 0;
        
        hostSocket.emit('ready-status', {
          players: activePlayers.map(p => ({
            id: p.id,
            name: p.name,
            ready: readyPlayers.has(p.id)
          })),
          readyCount,
          totalPlayers: activePlayers.length,
          allReady: allReady
        });
        
        console.log(`📤 Sent ready-status to host: readyCount=${readyCount}, totalPlayers=${activePlayers.length}, allReady=${allReady}`);
      }
    }
  }

  /**
   * Получает Socket роутер для использования в других модулях
   */
  getRouter() {
    return {
      broadcastRoomState: (roomCode) => this.broadcastRoomState(roomCode)
    };
  }
}

// Singleton
let socketRouterInstance = null;

function initializeSocketRouter(io) {
  if (!socketRouterInstance) {
    socketRouterInstance = new SocketRouter(io);
    socketRouterInstance.initialize();
  }
  return socketRouterInstance;
}

function getSocketRouter() {
  return socketRouterInstance;
}

module.exports = {
  initializeSocketRouter,
  getSocketRouter,
  SocketRouter
};

