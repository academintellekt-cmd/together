const { getDMXController } = require('./dmx-controller');

class DMXEffects {
  constructor() {
    this.controller = getDMXController();
    if (!this.controller) {
      console.warn('⚠️ DMX контроллер недоступен, эффекты отключены');
    }
  }

  // Плавное затухание цвета
  fadeToColor(startAddress, targetR, targetG, targetB, duration = 300) {
    if (!this.controller) return;
    
    const startR = this.controller.getChannel(startAddress) || 0;
    const startG = this.controller.getChannel(startAddress + 1) || 0;
    const startB = this.controller.getChannel(startAddress + 2) || 0;
    
    const steps = Math.max(10, Math.floor(duration / 20)); // минимум 10 шагов
    const stepTime = duration / steps;
    
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      const r = Math.round(startR + (targetR - startR) * progress);
      const g = Math.round(startG + (targetG - startG) * progress);
      const b = Math.round(startB + (targetB - startB) * progress);
      
      this.controller.setRGB(startAddress, r, g, b);
      
      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, stepTime);
    
    return timer;
  }

  // Пульсация цвета
  pulseColor(startAddress, r, g, b, duration = 500, cycles = 3) {
    if (!this.controller) return;
    
    let cycle = 0;
    const halfDuration = duration / 2;
    
    const timer = setInterval(() => {
      const progress = (Date.now() % duration) / halfDuration;
      const intensity = progress <= 1 
        ? Math.sin(progress * Math.PI) 
        : Math.sin((2 - progress) * Math.PI);
      
      const currentR = Math.round(r * intensity);
      const currentG = Math.round(g * intensity);
      const currentB = Math.round(b * intensity);
      
      this.controller.setRGB(startAddress, currentR, currentG, currentB);
      
      if (progress <= 1 && cycle < cycles) {
        cycle++;
        if (cycle >= cycles) {
          clearInterval(timer);
          // Возвращаем к исходному цвету
          this.controller.setRGB(startAddress, r, g, b);
        }
      }
    }, 20);
    
    return timer;
  }

  // Мигание
  flash(startAddress, r, g, b, duration = 200, times = 1) {
    if (!this.controller) return;
    
    let flashCount = 0;
    let isOn = false;
    
    const timer = setInterval(() => {
      if (isOn) {
        this.controller.setRGB(startAddress, 0, 0, 0);
        isOn = false;
        flashCount++;
        if (flashCount >= times) {
          clearInterval(timer);
        }
      } else {
        this.controller.setRGB(startAddress, r, g, b);
        isOn = true;
      }
    }, duration);
    
    return timer;
  }

  // Волна по всем игрокам
  wavePlayers(color, duration = 2000, direction = 'forward') {
    if (!this.controller) return;
    
    const playerCount = this.controller.config.players.count;
    const delayPerPlayer = duration / playerCount;
    const timers = [];
    
    for (let i = 0; i < playerCount; i++) {
      const playerIndex = direction === 'forward' ? i : playerCount - 1 - i;
      const address = this.controller.getPlayerAddress(playerIndex);
      
      const timer = setTimeout(() => {
        this.fadeToColor(address, color[0], color[1], color[2], delayPerPlayer);
      }, i * delayPerPlayer);
      
      timers.push(timer);
    }
    
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }

  // Радужная волна
  rainbowWave(startAddress, duration = 2000) {
    if (!this.controller) return;
    
    let hue = 0;
    const timer = setInterval(() => {
      hue = (hue + 2) % 360;
      const rgb = this.hsvToRgb(hue / 360, 1, 1);
      this.controller.setRGB(startAddress, rgb[0], rgb[1], rgb[2]);
    }, 20);
    
    setTimeout(() => {
      clearInterval(timer);
    }, duration);
    
    return timer;
  }

  // HSV to RGB конвертация
  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // ============ ИГРОВЫЕ ЭФФЕКТЫ ============

  // Игрок подключился
  playerJoined(playerIndex) {
    if (!this.controller) return;
    const color = this.controller.config.colors.playerJoined;
    const address = this.controller.getPlayerAddress(playerIndex);
    this.fadeToColor(address, color[0], color[1], color[2], 500);
  }

  // Игра началась
  gameStarted() {
    if (!this.controller) return;
    const color = this.controller.config.colors.correct; // Зеленый
    const playerCount = this.controller.config.players.count;
    
    // Все фонари игроков: пульсация зеленого
    for (let i = 0; i < playerCount; i++) {
      const address = this.controller.getPlayerAddress(i);
      this.pulseColor(address, color[0], color[1], color[2], 1000, 2);
    }
    
    // Сцена: яркое освещение
    this.stageBright();
  }

  // Вопрос показан
  questionShown() {
    if (!this.controller) return;
    const color = this.controller.config.colors.neutral; // Белый
    const playerCount = this.controller.config.players.count;
    
    // Все фонари игроков: нейтральный белый
    for (let i = 0; i < playerCount; i++) {
      const address = this.controller.getPlayerAddress(i);
      this.fadeToColor(address, color[0], color[1], color[2], 300);
    }
    
    // Сцена: мягкое освещение
    this.stageSoft();
  }

  // Игрок ответил
  playerAnswered(playerIndex) {
    if (!this.controller) return;
    const color = this.controller.config.colors.waiting; // Желтый
    const address = this.controller.getPlayerAddress(playerIndex);
    this.flash(address, color[0], color[1], color[2], 150, 2);
  }

  // Правильный ответ
  correctAnswer(playerIndex) {
    if (!this.controller) return;
    const color = this.controller.config.colors.correct; // Зеленый
    const address = this.controller.getPlayerAddress(playerIndex);
    
    // Пульсация зеленого
    this.pulseColor(address, color[0], color[1], color[2], 500, 3);
    
    // Сцена: вспышка зеленого
    this.stageFlash(color[0], color[1], color[2]);
  }

  // Неправильный ответ
  incorrectAnswer(playerIndex) {
    if (!this.controller) return;
    const color = this.controller.config.colors.incorrect; // Красный
    const address = this.controller.getPlayerAddress(playerIndex);
    
    // Пульсация красного
    this.pulseColor(address, color[0], color[1], color[2], 500, 3);
    
    // Сцена: краткая вспышка красного
    this.stageFlash(color[0], color[1], color[2], 100);
  }

  // Результаты вопроса
  showResults(results) {
    if (!this.controller) return;
    const playerCount = this.controller.config.players.count;
    
    // Подсвечиваем фонари по результатам
    results.forEach((result, index) => {
      const playerIndex = this.findPlayerIndex(result.playerId);
      if (playerIndex !== -1) {
        const address = this.controller.getPlayerAddress(playerIndex);
        const color = result.isCorrect 
          ? this.controller.config.colors.correct
          : this.controller.config.colors.incorrect;
        this.fadeToColor(address, color[0], color[1], color[2], 500);
      }
    });
    
    // Сцена: динамические эффекты
    this.stageDynamic();
  }

  // Игра завершена
  gameFinished(finalResults) {
    if (!this.controller) return;
    
    // Радужная волна по рейтингу
    const sortedPlayers = finalResults.sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((player, index) => {
      const playerIndex = this.findPlayerIndex(player.id);
      if (playerIndex !== -1) {
        setTimeout(() => {
          const address = this.controller.getPlayerAddress(playerIndex);
          const hue = (index * 30) % 360;
          const rgb = this.hsvToRgb(hue / 360, 1, 1);
          this.fadeToColor(address, rgb[0], rgb[1], rgb[2], 500);
        }, index * 200);
      }
    });
    
    // Сцена: финальное шоу
    this.stageFinalShow();
  }

  // ============ СЦЕНИЧЕСКИЕ ЭФФЕКТЫ ============

  stageBright() {
    if (!this.controller) return;
    const config = this.controller.config.stage.spotlights;
    for (let i = 0; i < config.count; i++) {
      const address = config.startAddress + (i * config.channelsPerFixture);
      this.fadeToColor(address, 255, 255, 255, 1000);
    }
  }

  stageSoft() {
    if (!this.controller) return;
    const config = this.controller.config.stage.spotlights;
    for (let i = 0; i < config.count; i++) {
      const address = config.startAddress + (i * config.channelsPerFixture);
      this.fadeToColor(address, 150, 150, 200, 500);
    }
  }

  stageFlash(r, g, b, duration = 200) {
    if (!this.controller) return;
    const config = this.controller.config.stage.spotlights;
    for (let i = 0; i < config.count; i++) {
      const address = config.startAddress + (i * config.channelsPerFixture);
      this.flash(address, r, g, b, duration, 1);
    }
  }

  stageDynamic() {
    if (!this.controller) return;
    const config = this.controller.config.stage.effects;
    for (let i = 0; i < config.count; i++) {
      const address = config.startAddress + (i * config.channelsPerFixture);
      const hue = (i * 90) % 360;
      const rgb = this.hsvToRgb(hue / 360, 1, 0.7);
      this.pulseColor(address, rgb[0], rgb[1], rgb[2], 1000, 5);
    }
  }

  stageFinalShow() {
    if (!this.controller) return;
    const config = this.controller.config.stage.effects;
    
    // Радужная волна по эффектам
    for (let i = 0; i < config.count; i++) {
      const address = config.startAddress + (i * config.channelsPerFixture);
      setTimeout(() => {
        this.rainbowWave(address, 3000);
      }, i * 500);
    }
  }

  // Вспомогательная функция для поиска индекса игрока
  findPlayerIndex(playerId) {
    // Эта функция должна быть реализована с учетом структуры данных игроков
    // Пока возвращаем -1, нужно будет интегрировать с системой комнат
    return -1;
  }

  // Остановить все эффекты
  stopAll() {
    if (!this.controller) return;
    this.controller.stopAllAnimations();
    this.controller.allOff();
  }
}

// Singleton экземпляр
let effectsInstance = null;

function getDMXEffects() {
  if (!effectsInstance) {
    effectsInstance = new DMXEffects();
  }
  return effectsInstance;
}

module.exports = {
  DMXEffects,
  getDMXEffects
};



