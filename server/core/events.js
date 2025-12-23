/**
 * Event Bus для системы событий
 * Используется для интеграции DMX и других модулей
 */

const EventEmitter = require('events');

class GameEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Увеличиваем лимит для множественных подписчиков
  }

  /**
   * События игры
   */
  static EVENTS = {
    // Игровой процесс
    GAME_CREATED: 'game:created',
    GAME_STARTED: 'game:started',
    GAME_FINISHED: 'game:finished',
    GAME_PAUSED: 'game:paused',
    GAME_RESUMED: 'game:resumed',
    
    // Раунды
    ROUND_STARTED: 'round:started',
    ROUND_ENDED: 'round:ended',
    
    // Вопросы
    QUESTION_SHOWN: 'question:shown',
    QUESTION_ANSWERED: 'question:answered',
    QUESTION_TIMEOUT: 'question:timeout',
    
    // Игроки
    PLAYER_JOINED: 'player:joined',
    PLAYER_LEFT: 'player:left',
    PLAYER_READY: 'player:ready',
    PLAYER_ANSWERED: 'player:answered',
    PLAYER_CORRECT: 'player:correct',
    PLAYER_WRONG: 'player:wrong',
    PLAYER_SCORED: 'player:scored',
    
    // Фазы
    PHASE_CHANGED: 'phase:changed',
    
    // Система
    ROOM_CREATED: 'room:created',
    ROOM_CLOSED: 'room:closed',
  };

  /**
   * Эмитит событие игры
   */
  emitGameEvent(eventName, data) {
    this.emit(eventName, {
      timestamp: Date.now(),
      ...data
    });
  }
}

// Singleton
let eventBusInstance = null;

function getEventBus() {
  if (!eventBusInstance) {
    eventBusInstance = new GameEventBus();
  }
  return eventBusInstance;
}

module.exports = {
  getEventBus,
  GameEventBus,
  GAME_EVENTS: GameEventBus.EVENTS
};

