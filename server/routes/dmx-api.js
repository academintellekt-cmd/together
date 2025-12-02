const express = require('express');
const router = express.Router();
const { getDMXController } = require('../dmx/dmx-controller');
const { getDMXEffects } = require('../dmx/dmx-effects');
const { getDMXPresets } = require('../dmx/dmx-presets');

// Получить статус DMX системы
router.get('/status', (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.json({
        available: false,
        message: 'DMX контроллер недоступен'
      });
    }
    
    const status = controller.getStatus();
    res.json({
      available: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения статуса DMX',
      message: error.message
    });
  }
});

// Управление фонарем игрока
router.post('/player/:index', (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const playerIndex = parseInt(req.params.index);
    const { r, g, b, effect } = req.body;
    
    if (playerIndex < 0 || playerIndex >= controller.config.players.count) {
      return res.status(400).json({ error: 'Неверный индекс игрока' });
    }
    
    const address = controller.getPlayerAddress(playerIndex);
    const effects = getDMXEffects();
    
    if (effect) {
      // Применить эффект
      switch (effect) {
        case 'fade':
          if (r !== undefined && g !== undefined && b !== undefined) {
            effects.fadeToColor(address, r, g, b, req.body.duration || 300);
          }
          break;
        case 'pulse':
          if (r !== undefined && g !== undefined && b !== undefined) {
            effects.pulseColor(address, r, g, b, req.body.duration || 500, req.body.cycles || 3);
          }
          break;
        case 'flash':
          if (r !== undefined && g !== undefined && b !== undefined) {
            effects.flash(address, r, g, b, req.body.duration || 200, req.body.times || 1);
          }
          break;
        default:
          return res.status(400).json({ error: 'Неизвестный эффект' });
      }
    } else {
      // Просто установить цвет
      if (r !== undefined && g !== undefined && b !== undefined) {
        controller.setPlayerColor(playerIndex, r, g, b);
      } else {
        return res.status(400).json({ error: 'Не указаны значения RGB' });
      }
    }
    
    res.json({ success: true, playerIndex, address });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления фонарем игрока',
      message: error.message
    });
  }
});

// Управление сценой
router.post('/stage', (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const { action, r, g, b } = req.body;
    const effects = getDMXEffects();
    
    switch (action) {
      case 'bright':
        effects.stageBright();
        break;
      case 'soft':
        effects.stageSoft();
        break;
      case 'flash':
        if (r !== undefined && g !== undefined && b !== undefined) {
          effects.stageFlash(r, g, b, req.body.duration || 200);
        } else {
          return res.status(400).json({ error: 'Не указаны значения RGB' });
        }
        break;
      case 'dynamic':
        effects.stageDynamic();
        break;
      case 'final':
        effects.stageFinalShow();
        break;
      default:
        return res.status(400).json({ error: 'Неизвестное действие' });
    }
    
    res.json({ success: true, action });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления сценой',
      message: error.message
    });
  }
});

// Применить предустановку
router.post('/preset/:name', (req, res) => {
  try {
    const presets = getDMXPresets();
    const presetName = req.params.name;
    
    const result = presets.executePreset(presetName);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка применения предустановки',
      message: error.message
    });
  }
});

// Список предустановок
router.get('/presets', (req, res) => {
  try {
    const presets = getDMXPresets();
    const list = presets.listPresets();
    res.json({ presets: list });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения списка предустановок',
      message: error.message
    });
  }
});

// Запустить эффект
router.post('/effect/:name', (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const effectName = req.params.name;
    const effects = getDMXEffects();
    const { params } = req.body;
    
    switch (effectName) {
      case 'wave-players':
        const color = params?.color || controller.config.colors.correct;
        const direction = params?.direction || 'forward';
        const duration = params?.duration || 2000;
        effects.wavePlayers(color, duration, direction);
        break;
      case 'rainbow':
        const address = params?.address || controller.config.players.startAddress;
        const rainbowDuration = params?.duration || 2000;
        effects.rainbowWave(address, rainbowDuration);
        break;
      default:
        return res.status(400).json({ error: 'Неизвестный эффект' });
    }
    
    res.json({ success: true, effect: effectName });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка запуска эффекта',
      message: error.message
    });
  }
});

// Управление всеми приборами
router.post('/all', (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const { action, r, g, b } = req.body;
    
    switch (action) {
      case 'off':
        controller.allOff();
        controller.stopAllAnimations();
        break;
      case 'set':
        if (r !== undefined && g !== undefined && b !== undefined) {
          const playerCount = controller.config.players.count;
          for (let i = 0; i < playerCount; i++) {
            controller.setPlayerColor(i, r, g, b);
          }
        } else {
          return res.status(400).json({ error: 'Не указаны значения RGB' });
        }
        break;
      default:
        return res.status(400).json({ error: 'Неизвестное действие' });
    }
    
    res.json({ success: true, action });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления всеми приборами',
      message: error.message
    });
  }
});

module.exports = router;


