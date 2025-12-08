const express = require('express');
const router = express.Router();
const { getDMXController } = require('../dmx/dmx-controller');
const { getDMXEffects } = require('../dmx/dmx-effects');
const { getDMXPresets } = require('../dmx/dmx-presets');
const { getDMXCommands } = require('../dmx/dmx-commands');

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
      console.error('   Проверьте логи сервера для деталей');
      return res.status(503).json({ 
        error: 'DMX контроллер недоступен',
        message: 'Проверьте подключение к ESP32 и логи сервера'
      });
    }
    
    if (!controller.config) {
      console.error('❌ DMX контроллер не имеет конфигурации');
      return res.status(503).json({ 
        error: 'DMX контроллер не инициализирован',
        message: 'Конфигурация не загружена'
      });
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

// ==================== УПРАВЛЕНИЕ КОМАНДАМИ DMX ====================

// Получить все команды
router.get('/commands', (req, res) => {
  try {
    const commands = getDMXCommands();
    const { search, lm70sNumber, sortBy = 'updatedAt', order = 'desc' } = req.query;
    
    let result = commands.getAllCommands();
    
    // Поиск
    if (search) {
      result = commands.searchCommands(search);
    }
    
    // Фильтрация по номеру фонаря
    if (lm70sNumber) {
      result = commands.filterByLM70S(lm70sNumber);
    }
    
    // Сортировка
    result.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'usageCount':
          aVal = a.usageCount || 0;
          bVal = b.usageCount || 0;
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        case 'updatedAt':
        default:
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
    
    res.json({ success: true, commands: result });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения команд',
      message: error.message
    });
  }
});

// Получить команду по ID
router.get('/commands/:id', (req, res) => {
  try {
    const commands = getDMXCommands();
    const command = commands.getCommand(req.params.id);
    
    if (!command) {
      return res.status(404).json({ error: 'Команда не найдена' });
    }
    
    res.json({ success: true, command });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения команды',
      message: error.message
    });
  }
});

// Создать новую команду
router.post('/commands', (req, res) => {
  try {
    const commands = getDMXCommands();
    const command = commands.createCommand(req.body);
    res.json({ success: true, command });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка создания команды',
      message: error.message
    });
  }
});

// Обновить команду
router.put('/commands/:id', (req, res) => {
  try {
    const commands = getDMXCommands();
    const command = commands.updateCommand(req.params.id, req.body);
    res.json({ success: true, command });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка обновления команды',
      message: error.message
    });
  }
});

// Удалить команду
router.delete('/commands/:id', (req, res) => {
  try {
    const commands = getDMXCommands();
    const deleted = commands.deleteCommand(req.params.id);
    res.json({ success: true, command: deleted });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка удаления команды',
      message: error.message
    });
  }
});

// Дублировать команду
router.post('/commands/:id/duplicate', (req, res) => {
  try {
    const commands = getDMXCommands();
    const { newName } = req.body;
    const duplicated = commands.duplicateCommand(req.params.id, newName);
    res.json({ success: true, command: duplicated });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка дублирования команды',
      message: error.message
    });
  }
});

// Применить команду
router.post('/commands/:id/apply', async (req, res) => {
  try {
    const commands = getDMXCommands();
    const { targetLM70SNumber, testMode = false } = req.body;
    
    const applyResult = await commands.applyCommand(req.params.id, targetLM70SNumber);
    
    // Применяем команду к каналам
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    // Отправляем команду на ESP32 или другой интерфейс
    const { channels, targetStartAddress } = applyResult;
    
    // Если это ESP32, отправляем напрямую
    if (controller.config && controller.config.interface.type === 'esp32') {
      const axios = require('axios');
      const esp32Host = controller.config.interface.host || '192.168.0.71';
      const esp32Port = controller.config.interface.port || 80;
      const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
      
      try {
        await axios.post(`${esp32BaseUrl}/api/dmx/channels`, {
          channels: channels,
          startAddress: targetStartAddress
        }, {
          timeout: 2000,
          headers: { 'Content-Type': 'application/json' }
        });
        
        // Если режим теста, через 2 секунды возвращаем предыдущее состояние
        if (testMode) {
          setTimeout(async () => {
            // Здесь можно сохранить предыдущее состояние и восстановить его
            // Пока просто логируем
            console.log('⏱️ Тестовый режим: команда применена на 2 секунды');
          }, 2000);
        }
        
        res.json({ 
          success: true, 
          command: applyResult.command,
          applied: true,
          targetLM70SNumber: applyResult.targetLM70SNumber,
          targetStartAddress
        });
      } catch (error) {
        res.status(503).json({
          error: 'ESP32 недоступен',
          message: error.message
        });
      }
    } else {
      // Для других интерфейсов используем стандартный метод
      const channelUpdates = {};
      Object.keys(channels).forEach(channelOffset => {
        const channelNum = parseInt(channelOffset);
        const value = parseInt(channels[channelOffset]);
        const absoluteChannel = targetStartAddress + channelNum - 1;
        if (absoluteChannel >= 1 && absoluteChannel <= 512) {
          channelUpdates[absoluteChannel] = Math.max(0, Math.min(255, value));
        }
      });
      
      controller.updateChannels(channelUpdates);
      
      res.json({ 
        success: true, 
        command: applyResult.command,
        applied: true,
        targetLM70SNumber: applyResult.targetLM70SNumber,
        targetStartAddress
      });
    }
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка применения команды',
      message: error.message
    });
  }
});

// Применить команду к нескольким фонарям
router.post('/commands/:id/apply-multiple', async (req, res) => {
  try {
    const commands = getDMXCommands();
    const { lm70sNumbers } = req.body;
    
    if (!Array.isArray(lm70sNumbers) || lm70sNumbers.length === 0) {
      return res.status(400).json({ error: 'Не указаны номера фонарей' });
    }
    
    const applyResults = await commands.applyCommandToMultiple(req.params.id, lm70sNumbers);
    
    const controller = getDMXController();
    if (!controller) {
      return res.status(503).json({ error: 'DMX контроллер недоступен' });
    }
    
    // Применяем команду к каждому фонарю
    const results = [];
    
    for (const result of applyResults) {
      const { channels, startAddress } = result;
      
      if (controller.config && controller.config.interface.type === 'esp32') {
        const axios = require('axios');
        const esp32Host = controller.config.interface.host || '192.168.0.71';
        const esp32Port = controller.config.interface.port || 80;
        const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
        
        try {
          await axios.post(`${esp32BaseUrl}/api/dmx/channels`, {
            channels: channels,
            startAddress: startAddress
          }, {
            timeout: 2000,
            headers: { 'Content-Type': 'application/json' }
          });
          
          results.push({ 
            lm70SNumber: result.lm70sNumber, 
            startAddress, 
            success: true 
          });
        } catch (error) {
          results.push({ 
            lm70SNumber: result.lm70sNumber, 
            startAddress, 
            success: false, 
            error: error.message 
          });
        }
      } else {
        const channelUpdates = {};
        Object.keys(channels).forEach(channelOffset => {
          const channelNum = parseInt(channelOffset);
          const value = parseInt(channels[channelOffset]);
          const absoluteChannel = startAddress + channelNum - 1;
          if (absoluteChannel >= 1 && absoluteChannel <= 512) {
            channelUpdates[absoluteChannel] = Math.max(0, Math.min(255, value));
          }
        });
        
        controller.updateChannels(channelUpdates);
        results.push({ 
          lm70SNumber: result.lm70sNumber, 
          startAddress, 
          success: true 
        });
      }
    }
    
    res.json({ 
      success: true, 
      command: commands.getCommand(req.params.id),
      results 
    });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка применения команды к нескольким фонарям',
      message: error.message
    });
  }
});

// Получить популярные команды
router.get('/commands/popular/:limit?', (req, res) => {
  try {
    const commands = getDMXCommands();
    const limit = parseInt(req.params.limit) || 10;
    const popular = commands.getPopularCommands(limit);
    res.json({ success: true, commands: popular });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка получения популярных команд',
      message: error.message
    });
  }
});

// Экспорт команд
router.get('/commands/export', (req, res) => {
  try {
    const commands = getDMXCommands();
    const exportData = commands.exportCommands();
    res.json(exportData);
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка экспорта команд',
      message: error.message
    });
  }
});

// Импорт команд
router.post('/commands/import', (req, res) => {
  try {
    const commands = getDMXCommands();
    const { merge = false } = req.query;
    const result = commands.importCommands(req.body, merge === 'true');
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      error: 'Ошибка импорта команд',
      message: error.message
    });
  }
});

module.exports = router;





