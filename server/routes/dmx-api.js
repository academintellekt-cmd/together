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

// Прямое управление каналами
router.post('/channels', async (req, res) => {
  try {
    console.log('📨 POST /api/dmx/channels - получен запрос');
    
    const controller = getDMXController();
    if (!controller) {
      console.error('❌ DMX контроллер недоступен');
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const { channels, startAddress } = req.body;
    console.log('📦 Данные запроса:', { channels, startAddress });
    
    if (!channels || typeof channels !== 'object') {
      console.error('❌ Не указаны каналы');
      return res.status(400).json({ error: 'Не указаны каналы' });
    }
    
    const baseAddress = startAddress || 1;
    
    // Если это ESP32, отправляем напрямую на ESP32 через правильный endpoint
    if (controller.config && controller.config.interface.type === 'esp32') {
      const axios = require('axios');
      const esp32Host = controller.config.interface.host || '192.168.0.71';
      const esp32Port = controller.config.interface.port || 80;
      const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
      
      console.log(`🔗 Отправка на ESP32: ${esp32BaseUrl}/api/dmx/channels`);
      
      try {
        const response = await axios.post(`${esp32BaseUrl}/api/dmx/channels`, {
          channels: channels,
          startAddress: baseAddress
        }, {
          timeout: 2000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: function (status) {
            return status < 500; // Разрешаем статусы < 500
          }
        });
        
        console.log('✅ ESP32 ответил:', {
          status: response.status,
          contentType: response.headers['content-type'],
          data: response.data
        });
        
        // Проверяем, что ответ действительно JSON
        if (response.headers['content-type'] && response.headers['content-type'].includes('application/json')) {
          return res.json(response.data);
        } else {
          console.error('❌ ESP32 вернул не JSON:', {
            contentType: response.headers['content-type'],
            data: typeof response.data === 'string' ? response.data.substring(0, 200) : response.data
          });
          return res.status(503).json({
            error: 'ESP32 вернул неверный формат ответа',
            message: 'Ожидался JSON, получен другой формат'
          });
        }
      } catch (error) {
        console.error('❌ Ошибка отправки на ESP32:', error.message);
        if (error.response) {
          console.error('   Статус:', error.response.status);
          console.error('   Заголовки:', error.response.headers);
          console.error('   Данные:', typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 200) 
            : error.response.data);
        } else if (error.request) {
          console.error('   Запрос отправлен, но ответа нет');
        }
        return res.status(503).json({
          error: 'ESP32 недоступен',
          message: error.message,
          details: error.response ? `Статус: ${error.response.status}` : 'Нет ответа от ESP32'
        });
      }
    }
    
    // Для других типов интерфейсов используем стандартный метод
    const channelUpdates = {};
    
    Object.keys(channels).forEach(channelOffset => {
      const channelNum = parseInt(channelOffset);
      const value = parseInt(channels[channelOffset]);
      
      if (isNaN(channelNum) || isNaN(value)) {
        return;
      }
      
      const absoluteChannel = baseAddress + channelNum - 1;
      if (absoluteChannel >= 1 && absoluteChannel <= 512) {
        channelUpdates[absoluteChannel] = Math.max(0, Math.min(255, value));
      }
    });
    
    controller.updateChannels(channelUpdates);
    
    res.json({ 
      success: true, 
      channels: channelUpdates,
      startAddress: baseAddress
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления каналами',
      message: error.message
    });
  }
});

// Получить текущие значения каналов
router.get('/channels', async (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const { startAddress, count } = req.query;
    const baseAddress = parseInt(startAddress) || 1;
    const channelCount = parseInt(count) || 9;
    
    // Если это ESP32, запрашиваем напрямую с ESP32
    if (controller.config && controller.config.interface.type === 'esp32') {
      const axios = require('axios');
      const esp32Host = controller.config.interface.host || '192.168.0.71';
      const esp32Port = controller.config.interface.port || 80;
      const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
      
      try {
        const response = await axios.get(`${esp32BaseUrl}/api/dmx/channels`, {
          params: {
            startAddress: baseAddress,
            count: channelCount
          },
          timeout: 2000
        });
        
        return res.json(response.data);
      } catch (error) {
        console.error('❌ Ошибка запроса к ESP32:', error.message);
        // Возвращаем пустые каналы в случае ошибки
        const channels = {};
        for (let i = 1; i <= channelCount; i++) {
          channels[i] = 0;
        }
        return res.json({
          success: true,
          startAddress: baseAddress,
          channels
        });
      }
    }
    
    // Для других типов интерфейсов используем стандартный метод
    const channels = {};
    for (let i = 0; i < channelCount; i++) {
      const channelNum = baseAddress + i;
      channels[i + 1] = controller.getChannel(channelNum);
    }
    
    res.json({ 
      success: true,
      startAddress: baseAddress,
      channels 
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения значений каналов',
      message: error.message
    });
  }
});

// Управление LED BAR
router.post('/ledbar/:number', async (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const barNumber = parseInt(req.params.number);
    const { r, g, b, pixel } = req.body;
    
    if (barNumber < 1 || barNumber > 10) {
      return res.status(400).json({ error: 'Неверный номер LED BAR (1-10)' });
    }
    
    // Отправляем команду напрямую на ESP32
    const axios = require('axios');
    const esp32Host = controller.config.interface.host || '192.168.0.71';
    const esp32Port = controller.config.interface.port || 80;
    const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
    
    try {
      const response = await axios.post(`${esp32BaseUrl}/api/dmx/ledbar/${barNumber}`, {
        r, g, b, pixel
      }, {
        timeout: 2000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      res.json(response.data);
    } catch (error) {
      res.status(503).json({
        error: 'ESP32 недоступен',
        message: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления LED BAR',
      message: error.message
    });
  }
});

// Управление туман-машиной
router.post('/fog', async (req, res) => {
  try {
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    const { level } = req.body;
    
    if (level === undefined || level < 0 || level > 255) {
      return res.status(400).json({ error: 'Неверный уровень тумана (0-255)' });
    }
    
    // Отправляем команду напрямую на ESP32
    const axios = require('axios');
    const esp32Host = controller.config.interface.host || '192.168.0.71';
    const esp32Port = controller.config.interface.port || 80;
    const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
    
    try {
      const response = await axios.post(`${esp32BaseUrl}/api/dmx/fog`, {
        level
      }, {
        timeout: 2000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      res.json(response.data);
    } catch (error) {
      res.status(503).json({
        error: 'ESP32 недоступен',
        message: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка управления туман-машиной',
      message: error.message
    });
  }
});

module.exports = router;



