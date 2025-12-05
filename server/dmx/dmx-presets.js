const { getDMXEffects } = require('./dmx-effects');
const { getDMXController } = require('./dmx-controller');

class DMXPresets {
  constructor() {
    this.effects = getDMXEffects();
    this.controller = getDMXController();
  }

  // Предустановленные сцены
  getPresets() {
    return {
      'all-off': {
        name: 'Все выключено',
        description: 'Выключить все DMX приборы',
        execute: () => {
          if (this.controller) {
            this.controller.allOff();
            this.controller.stopAllAnimations();
          }
        }
      },
      'all-white': {
        name: 'Все белое',
        description: 'Все фонари белого цвета',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 255, 255, 255, 500);
          }
        }
      },
      'rainbow': {
        name: 'Радуга',
        description: 'Радужная волна по всем игрокам',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            const hue = (i * 360 / playerCount) % 360;
            const rgb = this.effects.hsvToRgb(hue / 360, 1, 1);
            this.effects.fadeToColor(address, rgb[0], rgb[1], rgb[2], 500);
          }
        }
      },
      'pulse-green': {
        name: 'Пульсация зеленого',
        description: 'Все фонари пульсируют зеленым',
        execute: () => {
          if (!this.controller) return;
          const color = this.controller.config.colors.correct;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.pulseColor(address, color[0], color[1], color[2], 1000, 10);
          }
        }
      },
      'pulse-red': {
        name: 'Пульсация красного',
        description: 'Все фонари пульсируют красным',
        execute: () => {
          if (!this.controller) return;
          const color = this.controller.config.colors.incorrect;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.pulseColor(address, color[0], color[1], color[2], 1000, 10);
          }
        }
      },
      'wave-forward': {
        name: 'Волна вперед',
        description: 'Цветовая волна от первого к последнему игроку',
        execute: () => {
          if (!this.controller) return;
          const color = this.controller.config.colors.correct;
          this.effects.wavePlayers(color, 2000, 'forward');
        }
      },
      'wave-backward': {
        name: 'Волна назад',
        description: 'Цветовая волна от последнего к первому игроку',
        execute: () => {
          if (!this.controller) return;
          const color = this.controller.config.colors.correct;
          this.effects.wavePlayers(color, 2000, 'backward');
        }
      },
      'stage-bright': {
        name: 'Сцена яркая',
        description: 'Яркое освещение сцены',
        execute: () => {
          this.effects.stageBright();
        }
      },
      'stage-soft': {
        name: 'Сцена мягкая',
        description: 'Мягкое освещение сцены',
        execute: () => {
          this.effects.stageSoft();
        }
      },
      'stage-dynamic': {
        name: 'Сцена динамическая',
        description: 'Динамические эффекты на сцене',
        execute: () => {
          this.effects.stageDynamic();
        }
      },
      'final-show': {
        name: 'Финальное шоу',
        description: 'Финальное шоу с радужными эффектами',
        execute: () => {
          this.effects.stageFinalShow();
        }
      }
    };
  }

  // Выполнить предустановку
  executePreset(presetName) {
    const presets = this.getPresets();
    const preset = presets[presetName];
    
    if (!preset) {
      throw new Error(`Предустановка "${presetName}" не найдена`);
    }
    
    preset.execute();
    return { success: true, preset: presetName };
  }

  // Получить список всех предустановок
  listPresets() {
    const presets = this.getPresets();
    return Object.keys(presets).map(key => ({
      id: key,
      name: presets[key].name,
      description: presets[key].description
    }));
  }
}

// Singleton экземпляр
let presetsInstance = null;

function getDMXPresets() {
  if (!presetsInstance) {
    presetsInstance = new DMXPresets();
  }
  return presetsInstance;
}

module.exports = {
  DMXPresets,
  getDMXPresets
};





