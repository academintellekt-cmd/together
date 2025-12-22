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
    
    // Если принудительная установка или это приоритетное состояние (>= 6), всегда применяем
    if (forcePriority || getStatePriority(state) >= 6) {
      playerStateMap.set(playerIndex, state);
      priorityStateMap.set(playerIndex, state);
      this.applyPlayerState(roomCode, playerIndex, state);
      return true;
    }
    
    // Проверяем приоритеты для обычных состояний
    if (priorityStateMap.has(playerIndex)) {
      const currentPriority = priorityStateMap.get(playerIndex);
      if (isStateMoreImportant(currentPriority, state)) {
        // Текущее приоритетное состояние важнее, игнорируем новое
        return false;
      }
      // Новое состояние важнее - очищаем старое приоритетное
      priorityStateMap.delete(playerIndex);
    }
    
    // Устанавливаем состояние
    playerStateMap.set(playerIndex, state);
    
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
    const priorityStateMap = this.priorityStates.get(roomCode);
    const results = [];
    
    playerStateMap.forEach((currentState, playerIndex) => {
      // Если у игрока есть приоритетное состояние и мы не принуждаем, пропускаем
      if (!forcePriority && priorityStateMap.has(playerIndex)) {
        const currentPriority = priorityStateMap.get(playerIndex);
        if (isStateMoreImportant(currentPriority, state)) {
          results.push({ playerIndex, success: false, reason: 'priority' });
          return;
        }
      }
      
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
    if (!this.controller) return;
    if (playerIndex === undefined || playerIndex < 0 || playerIndex >= 14) return;
    
    const commandName = this.stateMapping.getCommandNameForPlayerState(state);
    if (!commandName) {
      if (state === PlayerLightingState.OFF) {
        this.turnOffPlayerFixture(roomCode, playerIndex);
      }
      return;
    }
    
    const command = this.stateMapping.findCommandByNameOrTag(commandName);
    if (!command || !command.channels) return;
    
    let dmxAddress;
    try {
      dmxAddress = this.controller.getPlayerAddress(playerIndex);
    } catch (error) {
      return;
    }
    
    if (!dmxAddress || dmxAddress < 1 || dmxAddress > 512) return;
    
    this.applyCommandToAddress(command, dmxAddress);
  }

  /**
   * Применить команду к DMX адресу
   */
  applyCommandToAddress(command, startAddress) {
    if (!this.controller || !command || !startAddress) return;
    
    const channels = {};
    
    // Если команда содержит несколько фонарей (allFixtures)
    if (command.allFixtures && Array.isArray(command.allFixtures) && command.allFixtures.length > 0) {
      // Применяем первый фонарь из команды (так как мы применяем к одному игроку)
      const firstFixture = command.allFixtures[0];
      
      for (let i = 1; i <= 9; i++) {
        const channelValue = firstFixture.channels && firstFixture.channels[i] !== undefined 
          ? parseInt(firstFixture.channels[i]) 
          : 0;
        const absoluteAddress = startAddress + i - 1;
        if (absoluteAddress >= 1 && absoluteAddress <= 512) {
          channels[absoluteAddress] = Math.max(0, Math.min(255, channelValue));
        }
      }
    } else if (command.channels) {
      // Стандартная команда с каналами
      // Преобразуем относительные каналы (1-9) в абсолютные адреса
      Object.keys(command.channels).forEach(channelOffset => {
        const channelNum = parseInt(channelOffset);
        const value = parseInt(command.channels[channelOffset]);
        
        if (isNaN(channelNum) || isNaN(value)) return;
        
        if (channelNum <= 9) {
          // Относительный канал (1-9) - преобразуем в абсолютный адрес
          const absoluteAddress = startAddress + channelNum - 1;
          if (absoluteAddress >= 1 && absoluteAddress <= 512) {
            channels[absoluteAddress] = Math.max(0, Math.min(255, value));
          }
        } else {
          // Абсолютный адрес в команде - вычисляем смещение относительно startAddress команды
          const commandStart = command.startAddress || 1;
          const offset = channelNum - commandStart;
          if (offset >= 0 && offset < 9) {
            const absoluteAddress = startAddress + offset;
            if (absoluteAddress >= 1 && absoluteAddress <= 512) {
              channels[absoluteAddress] = Math.max(0, Math.min(255, value));
            }
          }
        }
      });
    }
    
    // Отправляем все каналы одним запросом
    if (Object.keys(channels).length > 0) {
      this.controller.updateChannels(channels);
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







