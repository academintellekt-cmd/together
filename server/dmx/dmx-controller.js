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
    this.initialized = false;
    
    try {
      this.loadConfig();
      this.initialize();
      this.initialized = true;
      console.log('✅ DMX контроллер конструктор завершен успешно');
    } catch (error) {
      console.error('❌ Ошибка в конструкторе DMX контроллера:', error);
      this.initialized = false;
      throw error;
    }
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
      } else if (interfaceType === 'esp32') {
        // ESP32 через HTTP
        try {
          const axios = require('axios');
          const esp32Host = this.config.interface.host || '192.168.1.100';
          const esp32Port = this.config.interface.port || 80;
          const esp32BaseUrl = `http://${esp32Host}:${esp32Port}`;
          
          // Проверка доступности ESP32
          axios.get(`${esp32BaseUrl}/api/dmx/status`, { timeout: 3000 })
            .then((response) => {
              if (response.data && response.data.available) {
                console.log(`✅ ESP32 DMX контроллер доступен: ${esp32BaseUrl}`);
                this.isConnected = true;
              } else {
                console.warn(`⚠️ ESP32 недоступен: статус не подтвержден`);
                this.isConnected = false;
              }
            })
            .catch((error) => {
              console.warn(`⚠️ ESP32 недоступен: ${error.message}`);
              console.warn('   Убедитесь, что ESP32 подключен к WiFi и прошит прошивкой');
              this.isConnected = false;
            });
          
          this.universe = {
            update: async (channels) => {
              try {
                // Преобразуем каналы в формат для ESP32
                const channelsObj = {};
                Object.keys(channels).forEach(channel => {
                  channelsObj[channel] = channels[channel];
                });
                
                await axios.post(`${esp32BaseUrl}/api/batch`, {
                  channels: channelsObj
                }, {
                  timeout: 1000,
                  headers: { 'Content-Type': 'application/json' }
                });
                
                this.currentState = { ...this.currentState, ...channels };
              } catch (error) {
                // Не логируем каждую ошибку, чтобы не засорять консоль
                // Только при критических ошибках
                if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                  console.warn(`⚠️ ESP32 недоступен: ${error.message}`);
                }
              }
            },
            updateAll: async (value) => {
              try {
                await axios.post(`${esp32BaseUrl}/api/all`, {
                  action: 'off'
                }, {
                  timeout: 1000,
                  headers: { 'Content-Type': 'application/json' }
                });
                
                for (let i = 1; i <= 512; i++) {
                  this.currentState[i] = value;
                }
              } catch (error) {
                if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                  console.warn(`⚠️ ESP32 недоступен: ${error.message}`);
                }
              }
            }
          };
          
          this.isConnected = true;
          console.log(`✅ DMX ESP32 подключен: ${esp32BaseUrl}`);
          
          // Периодическая проверка статуса ESP32 (каждые 10 секунд)
          setInterval(() => {
            axios.get(`${esp32BaseUrl}/api/dmx/status`, { timeout: 2000 })
              .then((response) => {
                if (response.data && response.data.available) {
                  this.isConnected = true;
                } else {
                  this.isConnected = false;
                }
              })
              .catch(() => {
                this.isConnected = false;
              });
          }, 10000);
        } catch (error) {
          throw new Error(`ESP32 DMX недоступен: ${error.message}`);
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
      this.initialized = true; // Эмуляция тоже считается инициализированной
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
    // Для LM70S RGB каналы находятся на позициях 4, 5, 6 (в offset от startAddress)
    // В абсолютных адресах: startAddress+3 (R), startAddress+4 (G), startAddress+5 (B)
    if (this.config.players.type === 'LM70S' || this.config.players.channelsPerFixture === 9) {
      const channels = {
        [address + 3]: Math.max(0, Math.min(255, r)),  // R канал (4-й в offset)
        [address + 4]: Math.max(0, Math.min(255, g)),  // G канал (5-й в offset)
        [address + 5]: Math.max(0, Math.min(255, b))   // B канал (6-й в offset)
      };
      this.updateChannels(channels);
    } else {
      // Для обычных RGB приборов (3 канала)
      this.setRGB(address, r, g, b);
    }
  }

  // Установить RGB значения начиная с адреса (для обычных RGB приборов)
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
      available: this.isConnected,  // Для совместимости с веб-пультом
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
      console.log('✅ DMX контроллер создан успешно');
    } catch (error) {
      console.error('❌ Не удалось создать DMX контроллер:', error);
      console.error('   Стек ошибки:', error.stack);
      // Возвращаем null, система будет работать без DMX
      return null;
    }
  }
  
  // Дополнительная проверка, что контроллер действительно инициализирован
  if (!dmxControllerInstance) {
    console.warn('⚠️ DMX контроллер не создан');
    return null;
  }
  
  if (!dmxControllerInstance.universe) {
    console.warn('⚠️ DMX контроллер не имеет universe');
    return null;
  }
  
  if (!dmxControllerInstance.config) {
    console.warn('⚠️ DMX контроллер не имеет конфигурации');
    return null;
  }
  
  if (dmxControllerInstance.initialized === false) {
    console.warn('⚠️ DMX контроллер не инициализирован (initialized = false)');
    return null;
  }
  
  return dmxControllerInstance;
}

module.exports = {
  DMXController,
  getDMXController
};

