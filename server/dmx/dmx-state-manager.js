const { PlayerLightingState, GamePhase, getStatePriority, isStateMoreImportant } = require('./dmx-lighting-states');
const { getDMXStateMapping } = require('./dmx-state-mapping');
const { getDMXController } = require('./dmx-controller');
const { getDMXCommands } = require('./dmx-commands');

/**
 * Менеджер состояний освещения
 * 
 * Управляет состояниями игроков и фазой игры.
 * При изменении состояний автоматически применяет соответствующие DMX команды.
 */
class DMXStateManager {
  constructor() {
    this.stateMapping = getDMXStateMapping();
    this.controller = getDMXController();
    this.commands = getDMXCommands();
    
    // Хранилище состояний игроков по комнатам
    // Структура: roomCode -> Map<playerIndex, state>
    this.playerStates = new Map();
    
    // Хранилище фаз игры по комнатам
    // Структура: roomCode -> phase
    this.gamePhases = new Map();
    
    // Хранилище приоритетных состояний (для разрешения конфликтов)
    // Структура: roomCode -> Map<playerIndex, state>
    this.priorityStates = new Map();
  }

  /**
   * Инициализировать комнату
   */
  initRoom(roomCode, playerCount = 14) {
    if (!this.playerStates.has(roomCode)) {
      const playerStateMap = new Map();
      // Инициализируем всех игроков состоянием OFF
      for (let i = 0; i < playerCount; i++) {
        playerStateMap.set(i, PlayerLightingState.OFF);
      }
      this.playerStates.set(roomCode, playerStateMap);
      this.priorityStates.set(roomCode, new Map());
      this.gamePhases.set(roomCode, GamePhase.LOBBY);
    }
  }

  /**
   * Установить состояние игрока
   * @param {string} roomCode - Код комнаты
   * @param {number} playerIndex - Индекс игрока (0-based)
   * @param {string} state - Состояние из PlayerLightingState
   * @param {boolean} forcePriority - Принудительно установить приоритетное состояние
   */
  setPlayerState(roomCode, playerIndex, state, forcePriority = false) {
    if (!this.playerStates.has(roomCode)) {
      this.initRoom(roomCode);
    }
    
    const playerStateMap = this.playerStates.get(roomCode);
    const priorityStateMap = this.priorityStates.get(roomCode);
    
    // Проверяем приоритеты, если не принудительная установка
    if (!forcePriority && priorityStateMap.has(playerIndex)) {
      const currentPriority = priorityStateMap.get(playerIndex);
      if (isStateMoreImportant(currentPriority, state)) {
        // Текущее приоритетное состояние важнее, игнорируем новое
        return false;
      }
    }
    
    // Устанавливаем состояние
    playerStateMap.set(playerIndex, state);
    
    // Если это приоритетное состояние, сохраняем его
    if (forcePriority || getStatePriority(state) >= 7) { // CORRECT, INCORRECT, WINNER, LEADER
      priorityStateMap.set(playerIndex, state);
    }
    
    // Применяем DMX команду
    this.applyPlayerState(roomCode, playerIndex, state);
    
    return true;
  }

  /**
   * Установить состояние для всех игроков
   */
  setAllPlayersState(roomCode, state, forcePriority = false) {
    if (!this.playerStates.has(roomCode)) {
      this.initRoom(roomCode);
    }
    
    const playerStateMap = this.playerStates.get(roomCode);
    const results = [];
    
    playerStateMap.forEach((currentState, playerIndex) => {
      const result = this.setPlayerState(roomCode, playerIndex, state, forcePriority);
      results.push({ playerIndex, success: result });
    });
    
    return results;
  }

  /**
   * Установить состояние для нескольких конкретных игроков
   */
  setPlayersState(roomCode, playerIndices, state, forcePriority = false) {
    if (!this.playerStates.has(roomCode)) {
      this.initRoom(roomCode);
    }
    
    const results = [];
    playerIndices.forEach(playerIndex => {
      const result = this.setPlayerState(roomCode, playerIndex, state, forcePriority);
      results.push({ playerIndex, success: result });
    });
    
    return results;
  }

  /**
   * Получить текущее состояние игрока
   */
  getPlayerState(roomCode, playerIndex) {
    if (!this.playerStates.has(roomCode)) {
      return PlayerLightingState.OFF;
    }
    
    const playerStateMap = this.playerStates.get(roomCode);
    return playerStateMap.get(playerIndex) || PlayerLightingState.OFF;
  }

  /**
   * Установить фазу игры
   */
  setGamePhase(roomCode, phase) {
    if (!this.gamePhases.has(roomCode)) {
      this.initRoom(roomCode);
    }
    
    const oldPhase = this.gamePhases.get(roomCode);
    this.gamePhases.set(roomCode, phase);
    
    // Применяем настройки новой фазы
    this.applyGamePhase(roomCode, phase, oldPhase);
    
    return true;
  }

  /**
   * Получить текущую фазу игры
   */
  getGamePhase(roomCode) {
    return this.gamePhases.get(roomCode) || GamePhase.LOBBY;
  }

  /**
   * Сбросить приоритетные состояния (например, после показа результатов)
   */
  clearPriorityStates(roomCode, playerIndices = null) {
    if (!this.priorityStates.has(roomCode)) {
      return;
    }
    
    const priorityStateMap = this.priorityStates.get(roomCode);
    
    if (playerIndices === null) {
      // Сбросить все приоритетные состояния
      priorityStateMap.clear();
    } else {
      // Сбросить только для указанных игроков
      playerIndices.forEach(playerIndex => {
        priorityStateMap.delete(playerIndex);
      });
    }
  }

  /**
   * Применить состояние игрока (найти команду и отправить на DMX)
   */
  applyPlayerState(roomCode, playerIndex, state) {
    if (!this.controller) {
      console.warn('⚠️ DMX контроллер недоступен');
      return;
    }
    
    // Получаем имя команды для состояния
    const commandName = this.stateMapping.getCommandNameForPlayerState(state);
    
    if (!commandName) {
      // Если команда не найдена, выключаем прожектор
      if (state === PlayerLightingState.OFF) {
        this.turnOffPlayerFixture(roomCode, playerIndex);
      }
      return;
    }
    
    // Находим команду
    const command = this.stateMapping.findCommandByNameOrTag(commandName);
    
    if (!command) {
      console.warn(`⚠️ Команда "${commandName}" для состояния "${state}" не найдена`);
      return;
    }
    
    // Вычисляем DMX адрес для игрока
    const dmxAddress = this.controller.getPlayerAddress(playerIndex);
    
    // Применяем команду
    this.applyCommandToAddress(command, dmxAddress);
  }

  /**
   * Применить команду к DMX адресу
   */
  applyCommandToAddress(command, startAddress) {
    if (!this.controller) return;
    
    // Если команда содержит несколько фонарей (allFixtures)
    if (command.allFixtures && Array.isArray(command.allFixtures) && command.allFixtures.length > 0) {
      // Применяем первый фонарь из команды (так как мы применяем к одному игроку)
      const firstFixture = command.allFixtures[0];
      const channels = {};
      
      for (let i = 1; i <= 9; i++) {
        const channelValue = firstFixture.channels[i] !== undefined ? firstFixture.channels[i] : 0;
        channels[i] = channelValue;
      }
      
      this.controller.updateChannelsForAddress(startAddress, channels);
    } else {
      // Стандартная команда с каналами
      const channels = {};
      
      // Преобразуем относительные каналы (1-9) в абсолютные адреса
      Object.keys(command.channels).forEach(channelOffset => {
        const channelNum = parseInt(channelOffset);
        const value = parseInt(command.channels[channelOffset]);
        
        if (channelNum <= 9) {
          // Относительный канал - используем его как есть
          channels[channelNum] = value;
        } else {
          // Абсолютный адрес - вычисляем смещение
          const offset = channelNum - command.startAddress;
          if (offset >= 1 && offset <= 9) {
            channels[offset] = value;
          }
        }
      });
      
      this.controller.updateChannelsForAddress(startAddress, channels);
    }
  }

  /**
   * Выключить прожектор игрока
   */
  turnOffPlayerFixture(roomCode, playerIndex) {
    if (!this.controller) return;
    
    const dmxAddress = this.controller.getPlayerAddress(playerIndex);
    const channels = {};
    
    // Устанавливаем все каналы в 0
    for (let i = 1; i <= 9; i++) {
      channels[i] = 0;
    }
    
    this.controller.updateChannelsForAddress(dmxAddress, channels);
  }

  /**
   * Применить настройки фазы игры
   */
  applyGamePhase(roomCode, phase, oldPhase = null) {
    const phaseConfig = this.stateMapping.getGamePhaseConfig(phase);
    
    // Устанавливаем дефолтное состояние для всех игроков (если указано)
    if (phaseConfig.defaultPlayerState) {
      this.setAllPlayersState(roomCode, phaseConfig.defaultPlayerState, false);
    }
    
    // Применяем глобальный эффект (если указан)
    if (phaseConfig.globalEffect) {
      this.applyGlobalEffect(phaseConfig.globalEffect);
    }
  }

  /**
   * Применить глобальный эффект (для сцены, LED BAR и т.д.)
   */
  applyGlobalEffect(effectName) {
    const effectConfig = this.stateMapping.getGlobalEffectConfig(effectName);
    
    if (!effectConfig) {
      console.warn(`⚠️ Глобальный эффект "${effectName}" не найден`);
      return;
    }
    
    // Пока поддерживаем только эффекты сцены
    if (effectConfig.type === 'stage' && this.controller) {
      const { getDMXEffects } = require('./dmx-effects');
      const effects = getDMXEffects();
      
      switch (effectConfig.action) {
        case 'dim':
          effects.stageSoft();
          break;
        case 'flash':
          if (effectConfig.color) {
            effects.stageFlash(effectConfig.color[0], effectConfig.color[1], effectConfig.color[2], 200);
          }
          break;
        case 'dynamic':
          effects.stageDynamic();
          break;
        case 'final':
          effects.stageFinalShow();
          break;
        case 'bright':
          effects.stageBright();
          break;
      }
    }
  }

  /**
   * Очистить комнату (при завершении игры)
   */
  cleanupRoom(roomCode) {
    // Выключаем всех игроков
    this.setAllPlayersState(roomCode, PlayerLightingState.OFF, true);
    
    // Очищаем хранилища
    this.playerStates.delete(roomCode);
    this.gamePhases.delete(roomCode);
    this.priorityStates.delete(roomCode);
  }

  /**
   * Получить статистику состояний комнаты (для отладки)
   */
  getRoomStats(roomCode) {
    if (!this.playerStates.has(roomCode)) {
      return null;
    }
    
    const playerStateMap = this.playerStates.get(roomCode);
    const stats = {
      phase: this.getGamePhase(roomCode),
      playerStates: {},
      stateCounts: {},
    };
    
    playerStateMap.forEach((state, playerIndex) => {
      stats.playerStates[playerIndex] = state;
      stats.stateCounts[state] = (stats.stateCounts[state] || 0) + 1;
    });
    
    return stats;
  }
}

// Singleton instance
let stateManagerInstance = null;

function getDMXStateManager() {
  if (!stateManagerInstance) {
    stateManagerInstance = new DMXStateManager();
  }
  return stateManagerInstance;
}

module.exports = {
  DMXStateManager,
  getDMXStateManager,
};

