/**
 * Единое хранилище комнат
 * Заменяет отдельные хранилища rooms и global.intellectualRooms
 */

const { getEventBus, GAME_EVENTS } = require('./events');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> room
    this.eventBus = getEventBus();
  }

  /**
   * Создает новую комнату
   */
  createRoom(roomCode, gameId, settings = {}) {
    if (this.rooms.has(roomCode)) {
      throw new Error(`Room ${roomCode} already exists`);
    }

    const room = {
      roomCode,
      gameId,
      phase: 'waiting',
      phaseEndsAt: null,
      players: [],
      host: null,
      ui: {},
      settings,
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      // Дополнительные данные игры (специфичные для каждого движка)
      gameState: {}
    };

    this.rooms.set(roomCode, room);
    
    this.eventBus.emitGameEvent(GAME_EVENTS.ROOM_CREATED, {
      roomCode,
      gameId
    });

    return room;
  }

  /**
   * Получает комнату по коду
   */
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  /**
   * Проверяет существование комнаты
   */
  hasRoom(roomCode) {
    return this.rooms.has(roomCode);
  }

  /**
   * Удаляет комнату
   */
  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      this.eventBus.emitGameEvent(GAME_EVENTS.ROOM_CLOSED, {
        roomCode,
        gameId: room.gameId
      });
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Обновляет timestamp комнаты
   */
  touchRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.meta.updatedAt = Date.now();
    }
  }

  /**
   * Получает все комнаты
   */
  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  /**
   * Получает комнаты по gameId
   */
  getRoomsByGameId(gameId) {
    return this.getAllRooms().filter(room => room.gameId === gameId);
  }

  /**
   * Очищает неактивные комнаты
   */
  cleanupInactiveRooms(maxAge = 3600000) { // 1 час по умолчанию
    const now = Date.now();
    const roomsToDelete = [];

    for (const [roomCode, room] of this.rooms) {
      if (now - room.meta.updatedAt > maxAge) {
        roomsToDelete.push(roomCode);
      }
    }

    roomsToDelete.forEach(roomCode => this.deleteRoom(roomCode));
    
    if (roomsToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${roomsToDelete.length} inactive rooms`);
    }
  }
}

// Singleton
let roomManagerInstance = null;

function getRoomManager() {
  if (!roomManagerInstance) {
    roomManagerInstance = new RoomManager();
    
    // Автоматическая очистка каждые 10 минут
    setInterval(() => {
      roomManagerInstance.cleanupInactiveRooms();
    }, 600000);
  }
  return roomManagerInstance;
}

module.exports = {
  getRoomManager,
  RoomManager
};

