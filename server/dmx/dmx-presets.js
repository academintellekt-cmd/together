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
      },
      'warm-white': {
        name: 'Теплый белый',
        description: 'Теплое белое освещение для всех игроков',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 255, 200, 150, 500);
          }
        }
      },
      'cool-white': {
        name: 'Холодный белый',
        description: 'Холодное белое освещение для всех игроков',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 200, 220, 255, 500);
          }
        }
      },
      'blue-ambient': {
        name: 'Синяя атмосфера',
        description: 'Мягкое синее освещение для атмосферы',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 50, 100, 255, 500);
          }
        }
      },
      'red-alert': {
        name: 'Красная тревога',
        description: 'Интенсивное красное освещение',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.pulseColor(address, 255, 0, 0, 500, 20);
          }
        }
      },
      'green-success': {
        name: 'Зеленый успех',
        description: 'Яркое зеленое освещение для успеха',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 0, 255, 0, 500);
          }
        }
      },
      'purple-magic': {
        name: 'Фиолетовая магия',
        description: 'Мистическое фиолетовое освещение',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 150, 0, 255, 500);
          }
        }
      },
      'orange-energy': {
        name: 'Оранжевая энергия',
        description: 'Энергичное оранжевое освещение',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 255, 100, 0, 500);
          }
        }
      },
      'chase-rainbow': {
        name: 'Погоня радуга',
        description: 'Радужная погоня по всем игрокам',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          const delay = 200;
          for (let i = 0; i < playerCount; i++) {
            setTimeout(() => {
              const address = this.controller.getPlayerAddress(i);
              const hue = (i * 360 / playerCount) % 360;
              const rgb = this.effects.hsvToRgb(hue / 360, 1, 1);
              this.effects.fadeToColor(address, rgb[0], rgb[1], rgb[2], 300);
            }, i * delay);
          }
        }
      },
      'alternating': {
        name: 'Чередование',
        description: 'Чередование цветов между игроками',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            if (i % 2 === 0) {
              this.effects.fadeToColor(address, 255, 0, 0, 500); // Красный
            } else {
              this.effects.fadeToColor(address, 0, 0, 255, 500); // Синий
            }
          }
        }
      },
      'dim-ambient': {
        name: 'Приглушенная атмосфера',
        description: 'Приглушенное освещение для фона',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            this.effects.fadeToColor(address, 30, 30, 50, 500);
          }
        }
      },
      'party-mode': {
        name: 'Режим вечеринки',
        description: 'Яркие цвета для вечеринки',
        execute: () => {
          if (!this.controller) return;
          const playerCount = this.controller.config.players.count;
          const colors = [
            [255, 0, 0],   // Красный
            [0, 255, 0],   // Зеленый
            [0, 0, 255],   // Синий
            [255, 255, 0], // Желтый
            [255, 0, 255], // Пурпурный
            [0, 255, 255]  // Голубой
          ];
          for (let i = 0; i < playerCount; i++) {
            const address = this.controller.getPlayerAddress(i);
            const color = colors[i % colors.length];
            this.effects.pulseColor(address, color[0], color[1], color[2], 800, 15);
          }
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






