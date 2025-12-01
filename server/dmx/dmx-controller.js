const fs = require('fs');
const path = require('path');

class DMXController {
  constructor() {
    this.dmx = null;
    this.universe = null;
    this.config = null;
    this.isConnected = false;
    this.currentState = {};
    this.animationTimers = new Map();
    
    this.loadConfig();
    this.initialize();
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, 'dmx-config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      console.log('✅ DMX конфигурация загружена');
    } catch (error) {
      console.error('❌ Ошибка загрузки DMX конфигурации:', error);
      throw error;
    }
  }

  initialize() {
    try {
      // Подключение к интерфейсу
      const interfaceType = this.config.interface.type || 'artnet';
      
      if (interfaceType === 'artnet') {
        // Art-Net через сеть
        try {
          const Artnet = require('artnet');
          const artnet = Artnet({
            host: this.config.interface.host || '127.0.0.1',
            port: this.config.interface.port || 6454,
            refresh: 1000 / 44 // 44 обновления в секунду (стандарт DMX)
          });
          
          this.universe = {
            update: (channels) => {
              // Отправка через Art-Net
              Object.keys(channels).forEach(channel => {
                const channelNum = parseInt(channel);
                const value = channels[channel];
                artnet.set(channelNum, value);
              });
              this.currentState = { ...this.currentState, ...channels };
            },
            updateAll: (value) => {
              for (let i = 1; i <= 512; i++) {
                artnet.set(i, value);
                this.currentState[i] = value;
              }
            }
          };
          
          this.isConnected = true;
          console.log(`✅ DMX Art-Net подключен: ${this.config.interface.host}:${this.config.interface.port}`);
        } catch (error) {
          throw new Error(`Art-Net недоступен: ${error.message}`);
        }
      } else if (interfaceType === 'usb') {
        // USB DMX интерфейс (например, Enttec Open DMX)
        try {
          const dmx = require('dmx');
          this.dmx = new dmx();
          
          const serialport = require('serialport');
          const serialPort = new serialport.SerialPort({
            path: this.config.interface.path || '/dev/ttyUSB0',
            baudRate: 250000
          });
          
          this.universe = this.dmx.addUniverse('main', 'enttec-open-dmx-usb', serialPort);
          this.isConnected = true;
          console.log(`✅ DMX USB подключен: ${this.config.interface.path}`);
        } catch (error) {
          throw new Error(`USB DMX недоступен: ${error.message}`);
        }
      } else {
        throw new Error(`Неизвестный тип интерфейса: ${interfaceType}`);
      }
      
      // Инициализация всех каналов в 0
      this.allOff();
      
      console.log('✅ DMX контроллер инициализирован');
    } catch (error) {
      console.warn('⚠️ DMX работает в режиме эмуляции (без реального оборудования)');
      console.warn(`   Причина: ${error.message}`);
      
      // Режим эмуляции для разработки
      this.isConnected = false;
      this.universe = {
        update: (channels) => {
          // Логируем только первые несколько каналов для читаемости
          const channelKeys = Object.keys(channels).slice(0, 5);
          const preview = channelKeys.reduce((acc, key) => {
            acc[key] = channels[key];
            return acc;
          }, {});
          if (Object.keys(channels).length > 5) {
            console.log(`🎭 DMX Эмуляция: ${Object.keys(channels).length} каналов (показаны первые 5):`, preview);
          } else {
            console.log('🎭 DMX Эмуляция:', channels);
          }
          this.currentState = { ...this.currentState, ...channels };
        },
        updateAll: (value) => {
          console.log(`🎭 DMX Эмуляция: все 512 каналов = ${value}`);
          for (let i = 1; i <= 512; i++) {
            this.currentState[i] = value;
          }
        }
      };
    }
  }

  // Получить адрес канала для игрока
  getPlayerAddress(playerIndex) {
    if (playerIndex < 0 || playerIndex >= this.config.players.count) {
      throw new Error(`Неверный индекс игрока: ${playerIndex}`);
    }
    return this.config.players.startAddress + (playerIndex * this.config.players.channelsPerFixture);
  }

  // Установить цвет для игрока
  setPlayerColor(playerIndex, r, g, b) {
    const address = this.getPlayerAddress(playerIndex);
    this.setRGB(address, r, g, b);
  }

  // Установить RGB значения начиная с адреса
  setRGB(startAddress, r, g, b) {
    const channels = {
      [startAddress]: Math.max(0, Math.min(255, r)),
      [startAddress + 1]: Math.max(0, Math.min(255, g)),
      [startAddress + 2]: Math.max(0, Math.min(255, b))
    };
    this.updateChannels(channels);
  }

  // Обновить каналы
  updateChannels(channels) {
    if (!this.universe) return;
    
    try {
      this.universe.update(channels);
      this.currentState = { ...this.currentState, ...channels };
    } catch (error) {
      console.error('❌ Ошибка обновления DMX каналов:', error);
    }
  }

  // Установить все каналы в значение
  allOff() {
    if (!this.universe) return;
    
    try {
      // Устанавливаем все каналы в 0
      const channels = {};
      for (let i = 1; i <= 512; i++) {
        channels[i] = 0;
      }
      this.universe.updateAll(0);
      this.currentState = {};
      console.log('✅ Все DMX каналы выключены');
    } catch (error) {
      console.error('❌ Ошибка выключения всех каналов:', error);
    }
  }

  // Остановить все анимации
  stopAllAnimations() {
    this.animationTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.animationTimers.clear();
  }

  // Получить текущее состояние канала
  getChannel(channel) {
    return this.currentState[channel] || 0;
  }

  // Получить статус системы
  getStatus() {
    return {
      connected: this.isConnected,
      universe: this.config.universe,
      interface: this.config.interface.type,
      players: {
        count: this.config.players.count,
        startAddress: this.config.players.startAddress
      },
      stage: {
        spotlights: this.config.stage.spotlights,
        scanners: this.config.stage.scanners,
        effects: this.config.stage.effects
      }
    };
  }
}

// Экспорт singleton экземпляра
let dmxControllerInstance = null;

function getDMXController() {
  if (!dmxControllerInstance) {
    try {
      dmxControllerInstance = new DMXController();
    } catch (error) {
      console.error('❌ Не удалось создать DMX контроллер:', error);
      // Возвращаем null, система будет работать без DMX
      return null;
    }
  }
  return dmxControllerInstance;
}

module.exports = {
  DMXController,
  getDMXController
};

