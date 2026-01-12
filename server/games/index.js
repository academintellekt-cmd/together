/**
 * Реестр игровых движков
 * Центральный регистр всех доступных игр
 */

const { getRoomManager } = require('../core/rooms');

class GameRegistry {
  constructor() {
    this.games = new Map(); // gameId -> game engine
    this.roomManager = getRoomManager();
  }

  /**
   * Регистрирует игру
   */
  registerGame(gameId, gameEngine) {
    if (this.games.has(gameId)) {
      console.warn(`⚠️ Game ${gameId} already registered, replacing...`);
    }

    // Проверяем наличие обязательных методов
    const requiredMethods = ['createRoom', 'join', 'handleAction', 'getState'];
    for (const method of requiredMethods) {
      if (typeof gameEngine[method] !== 'function') {
        throw new Error(`Game engine ${gameId} missing required method: ${method}`);
      }
    }

    this.games.set(gameId, gameEngine);
    console.log(`✅ Game registered: ${gameId}`);
  }

  /**
   * Получает движок игры
   */
  getGame(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Проверяет существование игры
   */
  hasGame(gameId) {
    return this.games.has(gameId);
  }

  /**
   * Получает список всех игр
   */
  getAllGames() {
    return Array.from(this.games.keys()).map(gameId => {
      const engine = this.games.get(gameId);
      return {
        id: gameId,
        name: engine.name || gameId,
        description: engine.description || '',
        roles: engine.roles || ['host', 'player']
      };
    });
  }
}

// Singleton
let gameRegistryInstance = null;

function getGameRegistry() {
  if (!gameRegistryInstance) {
    gameRegistryInstance = new GameRegistry();
    
    // Регистрируем игры
    try {
      const quizGame = require('./quiz.game');
      gameRegistryInstance.registerGame('quiz', quizGame);
    } catch (error) {
      console.error('❌ Failed to load quiz game:', error.message);
    }

    try {
      const chgkGame = require('./chgk.game');
      gameRegistryInstance.registerGame('chgk', chgkGame);
    } catch (error) {
      console.error('❌ Failed to load chgk game:', error.message);
    }

    try {
      const soloGame = require('./solo.game');
      gameRegistryInstance.registerGame('solo', soloGame);
    } catch (error) {
      console.warn('⚠️ Solo game not loaded:', error.message);
    }
  }
  return gameRegistryInstance;
}

module.exports = {
  getGameRegistry,
  GameRegistry
};

