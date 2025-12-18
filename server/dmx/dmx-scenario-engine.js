const { GameEvent, PlayerLightingState, GamePhase } = require('./dmx-lighting-states');
const { getDMXStateManager } = require('./dmx-state-manager');

/**
 * Движок сценариев освещения
 * 
 * Обрабатывает события игры и автоматически применяет соответствующие изменения состояний.
 * Это высокоуровневый интерфейс для управления освещением из игрового кода.
 */
class DMXScenarioEngine {
  constructor() {
    this.stateManager = getDMXStateManager();
  }

  /**
   * Обработать событие игры
   * @param {string} roomCode - Код комнаты
   * @param {string} event - Тип события из GameEvent
   * @param {object} data - Данные события (зависят от типа события)
   */
  handleGameEvent(roomCode, event, data = {}) {
    try {
      switch (event) {
        // ========== СОБЫТИЯ ПОДКЛЮЧЕНИЯ И СТАРТА ==========
        case GameEvent.GAME_STARTED:
          this.onGameStarted(roomCode, data);
          break;
        
        case GameEvent.PLAYER_JOINED:
          this.onPlayerJoined(roomCode, data);
          break;

        // ========== СОБЫТИЯ ГОТОВНОСТИ ==========
        case GameEvent.PLAYER_READY:
          this.onPlayerReady(roomCode, data);
          break;
        
        case GameEvent.ALL_PLAYERS_READY:
          this.onAllPlayersReady(roomCode, data);
          break;

        // ========== СОБЫТИЯ ВОПРОСА ==========
        case GameEvent.QUESTION_COUNTDOWN_START:
          this.onQuestionCountdownStart(roomCode, data);
          break;
        
        case GameEvent.QUESTION_COUNTDOWN_TICK:
          this.onQuestionCountdownTick(roomCode, data);
          break;
        
        case GameEvent.QUESTION_STARTED:
          this.onQuestionStarted(roomCode, data);
          break;

        // ========== СОБЫТИЯ ОТВЕТОВ ==========
        case GameEvent.PLAYER_ANSWERED:
          this.onPlayerAnswered(roomCode, data);
          break;
        
        case GameEvent.SHOW_CORRECT_ANSWER:
          this.onShowCorrectAnswer(roomCode, data);
          break;

        // ========== СОБЫТИЯ РЕЗУЛЬТАТОВ ==========
        case GameEvent.SHOW_RESULTS:
          this.onShowResults(roomCode, data);
          break;
        
        case GameEvent.GAME_FINISHED:
          this.onGameFinished(roomCode, data);
          break;

        default:
          console.warn(`⚠️ Неизвестное событие игры: ${event}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка обработки события ${event}:`, error);
    }
  }

  // ========== РЕАЛИЗАЦИЯ ОБРАБОТЧИКОВ СОБЫТИЙ ==========

  /**
   * Игра началась
   * data: { playerCount? }
   */
  onGameStarted(roomCode, data) {
    this.stateManager.initRoom(roomCode, data.playerCount || 14);
    this.stateManager.setGamePhase(roomCode, GamePhase.LOBBY);
    // Все игроки выключены или в состоянии ожидания
    this.stateManager.setAllPlayersState(roomCode, PlayerLightingState.OFF);
  }

  /**
   * Игрок подключился
   * data: { playerIndex }
   */
  onPlayerJoined(roomCode, data) {
    const { playerIndex } = data;
    if (playerIndex === undefined) return;
    
    // Игрок получает состояние ожидания готовности
    this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.WAITING_FOR_READY);
  }

  /**
   * Игрок нажал "готов"
   * data: { playerIndex }
   */
  onPlayerReady(roomCode, data) {
    const { playerIndex } = data;
    if (playerIndex === undefined) return;
    
    // Устанавливаем состояние READY для этого игрока
    this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.READY);
  }

  /**
   * Все игроки готовы
   * data: { readyPlayers: [playerIndex, ...] }
   */
  onAllPlayersReady(roomCode, data) {
    // Переходим к фазе обратного отсчёта
    this.stateManager.setGamePhase(roomCode, GamePhase.QUESTION_COUNTDOWN);
  }

  /**
   * Начался обратный отсчёт перед вопросом
   * data: { duration? }
   */
  onQuestionCountdownStart(roomCode, data) {
    this.stateManager.setGamePhase(roomCode, GamePhase.QUESTION_COUNTDOWN);
    // Все игроки переходят в состояние COUNTDOWN
    this.stateManager.setAllPlayersState(roomCode, PlayerLightingState.COUNTDOWN);
  }

  /**
   * Тик обратного отсчёта
   * data: { secondsLeft }
   */
  onQuestionCountdownTick(roomCode, data) {
    const { secondsLeft } = data;
    
    // Опционально: можно менять эффект в зависимости от оставшегося времени
    // Например, при secondsLeft <= 3 усилить эффект
    if (secondsLeft <= 3 && secondsLeft > 0) {
      // Можно добавить дополнительный эффект (например, пульсацию)
      // Пока оставляем как есть
    }
  }

  /**
   * Вопрос начался (показан на экране)
   * data: { questionId? }
   */
  onQuestionStarted(roomCode, data) {
    this.stateManager.setGamePhase(roomCode, GamePhase.QUESTION_ACTIVE);
    // Все игроки переходят в состояние "думает/отвечает"
    this.stateManager.setAllPlayersState(roomCode, PlayerLightingState.ANSWERING);
  }

  /**
   * Игрок ответил (но результат ещё неизвестен)
   * data: { playerIndex, isCorrect? }
   */
  onPlayerAnswered(roomCode, data) {
    const { playerIndex } = data;
    if (playerIndex === undefined) return;
    
    // Если результат уже известен, устанавливаем соответствующее состояние
    if (data.isCorrect !== undefined) {
      if (data.isCorrect) {
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.CORRECT, true);
      } else {
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.INCORRECT, true);
      }
    } else {
      // Результат неизвестен - показываем, что ответ зафиксирован
      this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.LOCKED_IN);
    }
  }

  /**
   * Показать правильный ответ
   * data: { results: [{ playerIndex, isCorrect }, ...] }
   */
  onShowCorrectAnswer(roomCode, data) {
    this.stateManager.setGamePhase(roomCode, GamePhase.SHOW_CORRECT_ANSWER);
    
    const { results } = data;
    if (!Array.isArray(results)) return;
    
    // Устанавливаем состояния для каждого игрока в зависимости от результата
    results.forEach(result => {
      const { playerIndex, isCorrect } = result;
      if (playerIndex === undefined || isCorrect === undefined) return;
      
      if (isCorrect) {
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.CORRECT, true);
      } else {
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.INCORRECT, true);
      }
    });
  }

  /**
   * Показать результаты вопроса
   * data: { scoreboard: [{ playerIndex, score, isLeader? }, ...] }
   */
  onShowResults(roomCode, data) {
    this.stateManager.setGamePhase(roomCode, GamePhase.SHOW_RESULTS);
    
    const { scoreboard } = data;
    if (!Array.isArray(scoreboard)) return;
    
    // Находим лидера(ов)
    const maxScore = Math.max(...scoreboard.map(p => p.score || 0));
    const leaders = scoreboard.filter(p => (p.score || 0) === maxScore);
    
    // Устанавливаем состояния
    scoreboard.forEach(player => {
      const { playerIndex } = player;
      if (playerIndex === undefined) return;
      
      if (player.isLeader || leaders.some(l => l.playerIndex === playerIndex)) {
        // Лидер получает состояние WINNER
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.WINNER, true);
      } else {
        // Остальные возвращаются в состояние ожидания готовности
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.WAITING_FOR_READY);
      }
    });
    
    // Сбрасываем приоритетные состояния через некоторое время (например, 5 секунд)
    setTimeout(() => {
      const allPlayerIndices = scoreboard.map(p => p.playerIndex).filter(i => i !== undefined);
      this.stateManager.clearPriorityStates(roomCode, allPlayerIndices);
    }, 5000);
  }

  /**
   * Игра завершена
   * data: { finalResults: [{ playerIndex, score, rank }, ...] }
   */
  onGameFinished(roomCode, data) {
    this.stateManager.setGamePhase(roomCode, GamePhase.GAME_FINISHED);
    
    const { finalResults } = data;
    if (!Array.isArray(finalResults)) return;
    
    // Находим победителя (ранг 1)
    const winner = finalResults.find(p => p.rank === 1);
    
    // Устанавливаем состояния
    finalResults.forEach(player => {
      const { playerIndex } = player;
      if (playerIndex === undefined) return;
      
      if (winner && winner.playerIndex === playerIndex) {
        // Победитель получает состояние WINNER
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.WINNER, true);
      } else {
        // Остальные выключаются
        this.stateManager.setPlayerState(roomCode, playerIndex, PlayerLightingState.OFF);
      }
    });
  }

  /**
   * Ручное управление состоянием игрока (для отладки или специальных случаев)
   */
  setPlayerState(roomCode, playerIndex, state, forcePriority = false) {
    return this.stateManager.setPlayerState(roomCode, playerIndex, state, forcePriority);
  }

  /**
   * Ручное управление фазой игры
   */
  setGamePhase(roomCode, phase) {
    return this.stateManager.setGamePhase(roomCode, phase);
  }

  /**
   * Получить текущее состояние игрока
   */
  getPlayerState(roomCode, playerIndex) {
    return this.stateManager.getPlayerState(roomCode, playerIndex);
  }

  /**
   * Получить текущую фазу игры
   */
  getGamePhase(roomCode) {
    return this.stateManager.getGamePhase(roomCode);
  }

  /**
   * Очистить комнату (при удалении комнаты)
   */
  cleanupRoom(roomCode) {
    this.stateManager.cleanupRoom(roomCode);
  }

  /**
   * Получить статистику комнаты (для отладки)
   */
  getRoomStats(roomCode) {
    return this.stateManager.getRoomStats(roomCode);
  }
}

// Singleton instance
let scenarioEngineInstance = null;

function getDMXScenarioEngine() {
  if (!scenarioEngineInstance) {
    scenarioEngineInstance = new DMXScenarioEngine();
  }
  return scenarioEngineInstance;
}

module.exports = {
  DMXScenarioEngine,
  getDMXScenarioEngine,
};





