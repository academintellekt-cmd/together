/**
 * DMX Integration with Unified Event Bus
 * Подключается к event bus и реагирует на игровые события
 */

const { getEventBus, GAME_EVENTS } = require('../core/events');

class UnifiedDMXIntegration {
  constructor() {
    this.eventBus = getEventBus();
    this.controller = null;
    this.effects = null;
    this.initialized = false;
  }

  /**
   * Инициализация DMX с контроллером и эффектами
   */
  initialize(controller, effects) {
    if (this.initialized) {
      console.warn('⚠️ DMX integration already initialized');
      return;
    }

    this.controller = controller;
    this.effects = effects;
    this.initialized = true;

    // Подписываемся на события
    this._subscribeToEvents();

    console.log('✅ Unified DMX Integration initialized');
  }

  /**
   * Подписка на игровые события
   */
  _subscribeToEvents() {
    // Игра началась
    this.eventBus.on(GAME_EVENTS.GAME_STARTED, (data) => {
      this._onGameStarted(data);
    });

    // Игра завершена
    this.eventBus.on(GAME_EVENTS.GAME_FINISHED, (data) => {
      this._onGameFinished(data);
    });

    // Вопрос показан
    this.eventBus.on(GAME_EVENTS.QUESTION_SHOWN, (data) => {
      this._onQuestionShown(data);
    });

    // Игрок присоединился
    this.eventBus.on(GAME_EVENTS.PLAYER_JOINED, (data) => {
      this._onPlayerJoined(data);
    });

    // Игрок ответил
    this.eventBus.on(GAME_EVENTS.PLAYER_ANSWERED, (data) => {
      this._onPlayerAnswered(data);
    });

    // Правильный ответ
    this.eventBus.on(GAME_EVENTS.PLAYER_CORRECT, (data) => {
      this._onPlayerCorrect(data);
    });

    // Неправильный ответ
    this.eventBus.on(GAME_EVENTS.PLAYER_WRONG, (data) => {
      this._onPlayerWrong(data);
    });

    // Игрок готов
    this.eventBus.on(GAME_EVENTS.PLAYER_READY, (data) => {
      this._onPlayerReady(data);
    });

    // Фаза изменилась
    this.eventBus.on(GAME_EVENTS.PHASE_CHANGED, (data) => {
      this._onPhaseChanged(data);
    });

    console.log('✅ DMX subscribed to game events');
  }

  /**
   * Обработчики событий
   */
  _onGameStarted(data) {
    if (!this.effects || !this.effects.gameStarted) return;
    
    console.log('💡 DMX: Game started', data);
    this.effects.gameStarted();
  }

  _onGameFinished(data) {
    if (!this.effects || !this.effects.gameFinished) return;
    
    console.log('💡 DMX: Game finished', data);
    this.effects.gameFinished();
  }

  _onQuestionShown(data) {
    if (!this.effects || !this.effects.questionStarted) return;
    
    console.log('💡 DMX: Question shown', data);
    this.effects.questionStarted();
  }

  _onPlayerJoined(data) {
    if (!this.effects || !this.effects.playerJoined) return;
    
    const { playerIndex } = data;
    if (playerIndex !== undefined && playerIndex !== -1) {
      console.log(`💡 DMX: Player ${playerIndex} joined`);
      this.effects.playerJoined(playerIndex);
    }
  }

  _onPlayerAnswered(data) {
    if (!this.effects || !this.effects.playerAnswered) return;
    
    const { playerIndex, isCorrect } = data;
    if (playerIndex !== undefined && playerIndex !== -1) {
      console.log(`💡 DMX: Player ${playerIndex} answered (correct: ${isCorrect})`);
      this.effects.playerAnswered(playerIndex, isCorrect);
    }
  }

  _onPlayerCorrect(data) {
    if (!this.effects || !this.effects.playerCorrect) return;
    
    const { playerIndex } = data;
    if (playerIndex !== undefined && playerIndex !== -1) {
      console.log(`💡 DMX: Player ${playerIndex} correct answer`);
      this.effects.playerCorrect(playerIndex);
    }
  }

  _onPlayerWrong(data) {
    if (!this.effects || !this.effects.playerWrong) return;
    
    const { playerIndex } = data;
    if (playerIndex !== undefined && playerIndex !== -1) {
      console.log(`💡 DMX: Player ${playerIndex} wrong answer`);
      this.effects.playerWrong(playerIndex);
    }
  }

  _onPlayerReady(data) {
    if (!this.effects || !this.effects.playerReady) return;
    
    const { playerIndex } = data;
    if (playerIndex !== undefined && playerIndex !== -1) {
      console.log(`💡 DMX: Player ${playerIndex} ready`);
      this.effects.playerReady(playerIndex);
    }
  }

  _onPhaseChanged(data) {
    console.log('💡 DMX: Phase changed', data);
    // Можно добавить специфичные эффекты для разных фаз
  }

  /**
   * Отключение от событий
   */
  disconnect() {
    if (!this.initialized) return;

    this.eventBus.removeAllListeners(GAME_EVENTS.GAME_STARTED);
    this.eventBus.removeAllListeners(GAME_EVENTS.GAME_FINISHED);
    this.eventBus.removeAllListeners(GAME_EVENTS.QUESTION_SHOWN);
    this.eventBus.removeAllListeners(GAME_EVENTS.PLAYER_JOINED);
    this.eventBus.removeAllListeners(GAME_EVENTS.PLAYER_ANSWERED);
    this.eventBus.removeAllListeners(GAME_EVENTS.PLAYER_CORRECT);
    this.eventBus.removeAllListeners(GAME_EVENTS.PLAYER_WRONG);
    this.eventBus.removeAllListeners(GAME_EVENTS.PLAYER_READY);
    this.eventBus.removeAllListeners(GAME_EVENTS.PHASE_CHANGED);

    this.initialized = false;
    console.log('✅ DMX integration disconnected');
  }
}

// Singleton
let dmxIntegrationInstance = null;

function getUnifiedDMXIntegration() {
  if (!dmxIntegrationInstance) {
    dmxIntegrationInstance = new UnifiedDMXIntegration();
  }
  return dmxIntegrationInstance;
}

module.exports = {
  getUnifiedDMXIntegration,
  UnifiedDMXIntegration
};

