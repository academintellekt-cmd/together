const { getDMXEffects } = require('./dmx-effects');
const { getDMXController } = require('./dmx-controller');

class DMXIntegration {
  constructor(io, rooms, players) {
    this.io = io;
    this.rooms = rooms;
    this.players = players;
    this.effects = getDMXEffects();
    this.controller = getDMXController();
    
    // Маппинг playerId -> playerIndex для каждой комнаты
    this.playerIndexMap = new Map();
    
    if (!this.controller) {
      console.warn('⚠️ DMX контроллер недоступен, интеграция отключена');
    }
  }

  // Найти индекс игрока в комнате
  findPlayerIndex(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.players) return -1;
    
    const index = room.players.findIndex(p => p.id === playerId);
    return index;
  }

  // Игрок подключился
  onPlayerJoin(roomCode, playerId) {
    if (!this.controller) return;
    
    const playerIndex = this.findPlayerIndex(roomCode, playerId);
    if (playerIndex !== -1) {
      // Сохраняем маппинг
      const mapKey = `${roomCode}:${playerId}`;
      this.playerIndexMap.set(mapKey, playerIndex);
      
      // Запускаем эффект
      setTimeout(() => {
        this.effects.playerJoined(playerIndex);
      }, 100);
    }
  }

  // Игра началась
  onGameStarted(roomCode) {
    if (!this.controller) return;
    
    setTimeout(() => {
      this.effects.gameStarted();
    }, 500);
  }

  // Вопрос показан
  onQuestionShown(roomCode) {
    if (!this.controller) return;
    
    setTimeout(() => {
      this.effects.questionShown();
    }, 200);
  }

  // Игрок ответил
  onPlayerAnswer(roomCode, playerId) {
    if (!this.controller) return;
    
    const playerIndex = this.findPlayerIndex(roomCode, playerId);
    if (playerIndex !== -1) {
      setTimeout(() => {
        this.effects.playerAnswered(playerIndex);
      }, 100);
    }
  }

  // Правильный ответ
  onCorrectAnswer(roomCode, playerId) {
    if (!this.controller) return;
    
    const playerIndex = this.findPlayerIndex(roomCode, playerId);
    if (playerIndex !== -1) {
      setTimeout(() => {
        this.effects.correctAnswer(playerIndex);
      }, 100);
    }
  }

  // Неправильный ответ
  onIncorrectAnswer(roomCode, playerId) {
    if (!this.controller) return;
    
    const playerIndex = this.findPlayerIndex(roomCode, playerId);
    if (playerIndex !== -1) {
      setTimeout(() => {
        this.effects.incorrectAnswer(playerIndex);
      }, 100);
    }
  }

  // Показать результаты
  onShowResults(roomCode, results) {
    if (!this.controller) return;
    
    // Обогащаем результаты индексами игроков
    const enrichedResults = results.map(result => {
      const playerIndex = this.findPlayerIndex(roomCode, result.playerId);
      return {
        ...result,
        playerIndex
      };
    }).filter(r => r.playerIndex !== -1);
    
    setTimeout(() => {
      // Используем обновленную версию эффекта
      this.showResultsWithIndices(enrichedResults);
    }, 300);
  }

  // Показать результаты с индексами
  showResultsWithIndices(results) {
    if (!this.controller) return;
    
    results.forEach((result) => {
      if (result.playerIndex !== undefined && result.playerIndex !== -1) {
        const address = this.controller.getPlayerAddress(result.playerIndex);
        const color = result.isCorrect 
          ? this.controller.config.colors.correct
          : this.controller.config.colors.incorrect;
        this.effects.fadeToColor(address, color[0], color[1], color[2], 500);
      }
    });
    
    // Сцена: динамические эффекты
    this.effects.stageDynamic();
  }

  // Игра завершена
  onGameFinished(roomCode, finalResults) {
    if (!this.controller) return;
    
    // Обогащаем результаты индексами игроков
    const enrichedResults = finalResults.map((player, index) => {
      const playerIndex = this.findPlayerIndex(roomCode, player.id);
      return {
        ...player,
        playerIndex
      };
    }).filter(p => p.playerIndex !== -1);
    
    setTimeout(() => {
      this.gameFinishedWithIndices(enrichedResults);
    }, 500);
  }

  // Завершение игры с индексами
  gameFinishedWithIndices(finalResults) {
    if (!this.controller) return;
    
    // Радужная волна по рейтингу
    finalResults.forEach((player, index) => {
      if (player.playerIndex !== undefined && player.playerIndex !== -1) {
        setTimeout(() => {
          const address = this.controller.getPlayerAddress(player.playerIndex);
          const hue = (index * 30) % 360;
          const rgb = this.effects.hsvToRgb(hue / 360, 1, 1);
          this.effects.fadeToColor(address, rgb[0], rgb[1], rgb[2], 500);
        }, index * 200);
      }
    });
    
    // Сцена: финальное шоу
    this.effects.stageFinalShow();
  }

  // Очистка при удалении комнаты
  cleanupRoom(roomCode) {
    const keysToDelete = [];
    this.playerIndexMap.forEach((value, key) => {
      if (key.startsWith(`${roomCode}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.playerIndexMap.delete(key));
  }
}

module.exports = {
  DMXIntegration
};












