const fs = require('fs');
const path = require('path');
const { PlayerLightingState, GamePhase } = require('./dmx-lighting-states');
const { getDMXCommands } = require('./dmx-commands');

/**
 * Маппинг логических состояний на DMX команды
 * 
 * Этот файл хранит соответствие между:
 * - Состояниями игроков (READY, CORRECT, etc.) -> ID DMX команд
 * - Фазами игры -> глобальные эффекты/команды
 * 
 * Маппинг можно редактировать через веб-интерфейс или напрямую в файле
 */

class DMXStateMapping {
  constructor() {
    this.mappingFile = path.join(__dirname, 'dmx-state-mapping.json');
    this.mapping = this.loadMapping();
  }

  /**
   * Загрузить маппинг из файла или создать дефолтный
   */
  loadMapping() {
    try {
      if (fs.existsSync(this.mappingFile)) {
        const data = fs.readFileSync(this.mappingFile, 'utf8');
        const loaded = JSON.parse(data);
        // Проверяем, что все нужные ключи есть
        return this.mergeWithDefaults(loaded);
      } else {
        return this.getDefaultMapping();
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки маппинга состояний:', error);
      return this.getDefaultMapping();
    }
  }

  /**
   * Сохранить маппинг в файл
   */
  saveMapping() {
    try {
      fs.writeFileSync(this.mappingFile, JSON.stringify(this.mapping, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения маппинга:', error);
      return false;
    }
  }

  /**
   * Объединить загруженный маппинг с дефолтным (на случай, если добавились новые состояния)
   */
  mergeWithDefaults(loaded) {
    const defaults = this.getDefaultMapping();
    return {
      playerStates: { ...defaults.playerStates, ...loaded.playerStates },
      gamePhases: { ...defaults.gamePhases, ...loaded.gamePhases },
      globalEffects: { ...defaults.globalEffects, ...loaded.globalEffects },
    };
  }

  /**
   * Дефолтный маппинг состояний на команды
   * 
   * ВАЖНО: Здесь указаны ИМЕНА команд, которые должны существовать в системе команд.
   * Если команды с таким именем нет, система попытается найти команду по тегам или создаст дефолтную.
   */
  getDefaultMapping() {
    return {
      // Маппинг состояний игроков на имена DMX команд
      playerStates: {
        [PlayerLightingState.OFF]: null, // null = выключить прожектор
        [PlayerLightingState.WAITING_FOR_READY]: 'player-waiting',
        [PlayerLightingState.READY]: 'player-ready',
        [PlayerLightingState.ANSWERING]: 'player-answering',
        [PlayerLightingState.COUNTDOWN]: 'player-countdown',
        [PlayerLightingState.LOCKED_IN]: 'player-locked-in',
        [PlayerLightingState.CORRECT]: 'player-correct',
        [PlayerLightingState.INCORRECT]: 'player-incorrect',
        [PlayerLightingState.WINNER]: 'player-winner',
        [PlayerLightingState.LEADER]: 'player-leader',
      },
      
      // Маппинг фаз игры на глобальные эффекты/команды
      gamePhases: {
        [GamePhase.LOBBY]: {
          defaultPlayerState: PlayerLightingState.OFF,
          globalEffect: null,
        },
        [GamePhase.WAITING_ALL_READY]: {
          defaultPlayerState: PlayerLightingState.WAITING_FOR_READY,
          globalEffect: null,
        },
        [GamePhase.QUESTION_COUNTDOWN]: {
          defaultPlayerState: PlayerLightingState.COUNTDOWN,
          globalEffect: 'countdown-effect',
        },
        [GamePhase.QUESTION_ACTIVE]: {
          defaultPlayerState: PlayerLightingState.ANSWERING,
          globalEffect: null,
        },
        [GamePhase.SHOW_CORRECT_ANSWER]: {
          defaultPlayerState: null, // Состояния игроков устанавливаются индивидуально
          globalEffect: 'show-correct-flash',
        },
        [GamePhase.SHOW_RESULTS]: {
          defaultPlayerState: null, // Состояния игроков устанавливаются индивидуально
          globalEffect: 'results-effect',
        },
        [GamePhase.GAME_FINISHED]: {
          defaultPlayerState: PlayerLightingState.OFF,
          globalEffect: 'final-show',
        },
      },
      
      // Глобальные эффекты (для сцены, LED BAR, тумана в будущем)
      globalEffects: {
        'countdown-effect': {
          type: 'stage',
          action: 'dim',
        },
        'show-correct-flash': {
          type: 'stage',
          action: 'flash',
          color: [0, 255, 0], // Зелёный
        },
        'results-effect': {
          type: 'stage',
          action: 'dynamic',
        },
        'final-show': {
          type: 'stage',
          action: 'final',
        },
      },
    };
  }

  /**
   * Получить имя DMX команды для состояния игрока
   */
  getCommandNameForPlayerState(state) {
    return this.mapping.playerStates[state] || null;
  }

  /**
   * Получить настройки фазы игры
   */
  getGamePhaseConfig(phase) {
    return this.mapping.gamePhases[phase] || {
      defaultPlayerState: null,
      globalEffect: null,
    };
  }

  /**
   * Получить конфигурацию глобального эффекта
   */
  getGlobalEffectConfig(effectName) {
    return this.mapping.globalEffects[effectName] || null;
  }

  /**
   * Найти DMX команду по имени или тегу
   */
  findCommandByNameOrTag(commandName) {
    if (!commandName) return null;
    
    const commands = getDMXCommands();
    const allCommands = commands.getAllCommands();
    
    // Сначала ищем по точному имени
    let command = allCommands.find(cmd => 
      cmd.name.toLowerCase() === commandName.toLowerCase() ||
      cmd.id === commandName
    );
    
    if (command) return command;
    
    // Если не нашли, ищем по тегам
    command = allCommands.find(cmd => 
      Array.isArray(cmd.tags) && 
      cmd.tags.some(tag => tag.toLowerCase() === commandName.toLowerCase())
    );
    
    return command || null;
  }

  /**
   * Обновить маппинг состояния игрока
   */
  updatePlayerStateMapping(state, commandName) {
    if (!this.mapping.playerStates.hasOwnProperty(state)) {
      console.warn(`⚠️ Попытка обновить неизвестное состояние: ${state}`);
      return false;
    }
    
    this.mapping.playerStates[state] = commandName;
    return this.saveMapping();
  }

  /**
   * Обновить маппинг фазы игры
   */
  updateGamePhaseMapping(phase, config) {
    if (!this.mapping.gamePhases.hasOwnProperty(phase)) {
      console.warn(`⚠️ Попытка обновить неизвестную фазу: ${phase}`);
      return false;
    }
    
    this.mapping.gamePhases[phase] = { ...this.mapping.gamePhases[phase], ...config };
    return this.saveMapping();
  }

  /**
   * Получить весь маппинг (для API)
   */
  getFullMapping() {
    return { ...this.mapping };
  }
}

// Singleton instance
let stateMappingInstance = null;

function getDMXStateMapping() {
  if (!stateMappingInstance) {
    stateMappingInstance = new DMXStateMapping();
  }
  return stateMappingInstance;
}

module.exports = {
  DMXStateMapping,
  getDMXStateMapping,
};

