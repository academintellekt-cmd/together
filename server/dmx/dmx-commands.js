const fs = require('fs');
const path = require('path');

// Простая генерация уникального ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

class DMXCommands {
  constructor() {
    this.commandsFile = path.join(__dirname, 'dmx-commands.json');
    this.commands = [];
    this.loadCommands();
  }

  // Загрузить команды из файла
  loadCommands() {
    try {
      if (fs.existsSync(this.commandsFile)) {
        const data = fs.readFileSync(this.commandsFile, 'utf8');
        this.commands = JSON.parse(data);
        console.log(`✅ Загружено ${this.commands.length} команд DMX`);
      } else {
        this.commands = [];
        this.saveCommands();
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки команд:', error);
      this.commands = [];
    }
  }

  // Сохранить команды в файл
  saveCommands() {
    try {
      fs.writeFileSync(this.commandsFile, JSON.stringify(this.commands, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения команд:', error);
      return false;
    }
  }

  // Получить все команды
  getAllCommands() {
    return this.commands;
  }

  // Получить команду по ID
  getCommand(id) {
    return this.commands.find(cmd => cmd.id === id);
  }

  // Создать новую команду
  createCommand(commandData) {
    const {
      name,
      lm70sNumber,
      startAddress,
      channels,
      tags = [],
      description = ''
    } = commandData;

    if (!name || !lm70sNumber || !channels) {
      throw new Error('Не указаны обязательные поля: name, lm70sNumber, channels');
    }

    const command = {
      id: generateId(),
      name: name.trim(),
      lm70sNumber: parseInt(lm70sNumber),
      startAddress: parseInt(startAddress) || (1 + (parseInt(lm70sNumber) - 1) * 9),
      channels: { ...channels },
      tags: Array.isArray(tags) ? tags : [],
      description: description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
      lastUsedAt: null,
      history: []
    };

    // Сохраняем текущее состояние как первую версию в истории
    command.history.push({
      version: 1,
      timestamp: command.createdAt,
      channels: { ...channels }
    });

    this.commands.push(command);
    this.saveCommands();
    
    return command;
  }

  // Обновить команду
  updateCommand(id, updates) {
    const command = this.commands.find(cmd => cmd.id === id);
    if (!command) {
      throw new Error('Команда не найдена');
    }

    const oldChannels = { ...command.channels };
    
    // Обновляем поля
    if (updates.name !== undefined) command.name = updates.name.trim();
    if (updates.lm70sNumber !== undefined) {
      command.lm70sNumber = parseInt(updates.lm70sNumber);
      command.startAddress = 1 + (command.lm70sNumber - 1) * 9;
    }
    if (updates.channels !== undefined) {
      command.channels = { ...updates.channels };
    }
    if (updates.tags !== undefined) command.tags = Array.isArray(updates.tags) ? updates.tags : [];
    if (updates.description !== undefined) command.description = updates.description;

    command.updatedAt = new Date().toISOString();

    // Добавляем в историю, если каналы изменились
    if (JSON.stringify(oldChannels) !== JSON.stringify(command.channels)) {
      const newVersion = command.history.length + 1;
      command.history.push({
        version: newVersion,
        timestamp: command.updatedAt,
        channels: { ...command.channels }
      });
    }

    this.saveCommands();
    return command;
  }

  // Удалить команду
  deleteCommand(id) {
    const index = this.commands.findIndex(cmd => cmd.id === id);
    if (index === -1) {
      throw new Error('Команда не найдена');
    }
    
    const deleted = this.commands.splice(index, 1)[0];
    this.saveCommands();
    return deleted;
  }

  // Дублировать команду
  duplicateCommand(id, newName) {
    const original = this.getCommand(id);
    if (!original) {
      throw new Error('Команда не найдена');
    }

    const duplicated = {
      ...original,
      id: generateId(),
      name: newName || `${original.name} (копия)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
      lastUsedAt: null,
      history: [{
        version: 1,
        timestamp: new Date().toISOString(),
        channels: { ...original.channels }
      }]
    };

    this.commands.push(duplicated);
    this.saveCommands();
    return duplicated;
  }

  // Увеличить счетчик использования
  incrementUsage(id) {
    const command = this.commands.find(cmd => cmd.id === id);
    if (command) {
      command.usageCount = (command.usageCount || 0) + 1;
      command.lastUsedAt = new Date().toISOString();
      this.saveCommands();
    }
    return command;
  }

  // Поиск команд
  searchCommands(query) {
    if (!query) return this.commands;
    
    const lowerQuery = query.toLowerCase();
    return this.commands.filter(cmd => 
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // Фильтрация по номеру фонаря
  filterByLM70S(lm70sNumber) {
    if (!lm70sNumber) return this.commands;
    return this.commands.filter(cmd => cmd.lm70sNumber === parseInt(lm70sNumber));
  }

  // Получить самые популярные команды
  getPopularCommands(limit = 10) {
    return [...this.commands]
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit);
  }

  // Экспорт команд
  exportCommands() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      commands: this.commands
    };
  }

  // Импорт команд
  importCommands(importData, merge = false) {
    try {
      let commandsToImport = [];
      
      if (importData.commands && Array.isArray(importData.commands)) {
        commandsToImport = importData.commands;
      } else if (Array.isArray(importData)) {
        commandsToImport = importData;
      } else {
        throw new Error('Неверный формат данных для импорта');
      }

      if (merge) {
        // Объединяем с существующими командами
        commandsToImport.forEach(cmd => {
          // Генерируем новый ID для избежания конфликтов
          cmd.id = generateId();
          cmd.createdAt = cmd.createdAt || new Date().toISOString();
          cmd.updatedAt = new Date().toISOString();
        });
        this.commands.push(...commandsToImport);
      } else {
        // Заменяем все команды
        this.commands = commandsToImport.map(cmd => ({
          ...cmd,
          id: cmd.id || generateId(),
          createdAt: cmd.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      }

      this.saveCommands();
      return { success: true, imported: commandsToImport.length };
    } catch (error) {
      throw new Error(`Ошибка импорта: ${error.message}`);
    }
  }

  // Применить команду к фонарю
  async applyCommand(id, targetLM70SNumber = null) {
    const command = this.getCommand(id);
    if (!command) {
      throw new Error('Команда не найдена');
    }

    const targetNumber = targetLM70SNumber || command.lm70sNumber;
    const targetStartAddress = 1 + (targetNumber - 1) * 9;

    // Увеличиваем счетчик использования
    this.incrementUsage(id);

    return {
      command,
      targetLM70SNumber: targetNumber,
      targetStartAddress,
      channels: command.channels
    };
  }

  // Применить команду к нескольким фонарям
  async applyCommandToMultiple(id, lm70sNumbers) {
    const command = this.getCommand(id);
    if (!command) {
      throw new Error('Команда не найдена');
    }

    if (!Array.isArray(lm70sNumbers) || lm70sNumbers.length === 0) {
      throw new Error('Не указаны номера фонарей');
    }

    // Увеличиваем счетчик использования
    this.incrementUsage(id);

    return lm70sNumbers.map(lm70sNumber => ({
      lm70sNumber: parseInt(lm70sNumber),
      startAddress: 1 + (parseInt(lm70sNumber) - 1) * 9,
      channels: command.channels
    }));
  }
}

// Singleton экземпляр
let commandsInstance = null;

function getDMXCommands() {
  if (!commandsInstance) {
    commandsInstance = new DMXCommands();
  }
  return commandsInstance;
}

module.exports = {
  DMXCommands,
  getDMXCommands
};

