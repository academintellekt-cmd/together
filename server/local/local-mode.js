/**
 * Модуль локального режима игры
 * Управляет станциями игроков в локальной сети
 */

class LocalModeManager {
    constructor() {
        this.stations = new Map(); // IP -> station info
        this.rooms = new Map(); // roomCode -> local room data
        this.commandQueues = new Map(); // stationNumber -> command queue
        this.initializeStations();
    }

    /**
     * Инициализация станций по IP-адресам
     */
    initializeStations() {
        // Станции игроков: 192.168.1.21 - 192.168.1.29 (до 9 станций)
        const stationIPs = [
            '192.168.1.21', '192.168.1.22', '192.168.1.23', '192.168.1.24',
            '192.168.1.25', '192.168.1.26', '192.168.1.27', '192.168.1.28', '192.168.1.29'
        ];

        stationIPs.forEach((ip, index) => {
            const stationNumber = index + 1;
            this.stations.set(ip, {
                stationNumber: stationNumber,
                playerName: `Игрок ${stationNumber}`,
                ip: ip,
                connected: false,
                socketId: null,
                lastSeen: null,
                joystick: {
                    config: null, // Конфигурация джойстика для этой станции
                    status: 'not_tested', // not_tested, ok, error
                    lastTested: null,
                    error: null
                },
                state: {
                    currentPage: 'waiting', // waiting, quiz, results, custom
                    pageData: {},
                    customState: {},
                    lastUpdate: null
                }
            });
            // Инициализируем очередь команд для каждой станции
            this.commandQueues.set(stationNumber, []);
        });

        console.log(`✅ Инициализировано ${this.stations.size} станций для локального режима`);
    }

    /**
     * Регистрация станции
     */
    registerStation(ip, stationNumber = null) {
        if (stationNumber) {
            // Если указан номер станции, используем его
            const station = Array.from(this.stations.values()).find(s => s.stationNumber === stationNumber);
            if (station) {
                station.ip = ip;
                station.connected = true;
                station.lastSeen = Date.now();
                return station;
            }
        }

        // Ищем станцию по IP
        const station = this.stations.get(ip);
        if (station) {
            station.connected = true;
            station.lastSeen = Date.now();
            return station;
        }

        return null;
    }

    /**
     * Инициализация комнаты в локальном режиме
     */
    initializeRoom(roomCode) {
        this.rooms.set(roomCode, {
            roomCode: roomCode,
            stations: new Map(),
            quizId: null,
            started: false
        });
        console.log(`✅ Локальная комната ${roomCode} инициализирована`);
    }

    /**
     * Получение списка всех станций
     */
    getStations() {
        return Array.from(this.stations.values());
    }

    /**
     * Получение информации о станции по IP
     */
    getStationByIP(ip) {
        return this.stations.get(ip);
    }

    /**
     * Получение информации о станции по номеру
     */
    getStationByNumber(stationNumber) {
        return Array.from(this.stations.values()).find(s => s.stationNumber === stationNumber);
    }

    /**
     * Обновление состояния станции
     */
    updateStationState(stationNumber, stateUpdate) {
        const station = this.getStationByNumber(stationNumber);
        if (station) {
            station.state = {
                ...station.state,
                ...stateUpdate,
                lastUpdate: Date.now()
            };
            return station;
        }
        return null;
    }

    /**
     * Обновление состояния станции по IP
     */
    updateStationStateByIP(ip, stateUpdate) {
        const station = this.stations.get(ip);
        if (station) {
            station.state = {
                ...station.state,
                ...stateUpdate,
                lastUpdate: Date.now()
            };
            return station;
        }
        return null;
    }

    /**
     * Получение станций по номерам
     */
    getStationsByNumbers(stationNumbers) {
        if (!stationNumbers || stationNumbers.length === 0) {
            return this.getStations().filter(s => s.connected);
        }
        return this.getStations().filter(s => 
            s.connected && stationNumbers.includes(s.stationNumber)
        );
    }

    /**
     * Установка socketId для станции
     */
    setStationSocketId(stationNumber, socketId) {
        const station = this.getStationByNumber(stationNumber);
        if (station) {
            station.socketId = socketId;
            station.connected = true;
            station.lastSeen = Date.now();
            return station;
        }
        return null;
    }

    /**
     * Удаление socketId при отключении
     */
    removeStationSocketId(socketId) {
        const stations = this.getStations();
        const station = stations.find(s => s.socketId === socketId);
        if (station) {
            station.socketId = null;
            station.connected = false;
            return station;
        }
        return null;
    }

    /**
     * Добавление команды в очередь для станции
     * Команды будут доставлены через Socket.io или HTTP polling
     */
    enqueueCommand(stationNumber, command, params = {}) {
        const station = this.getStationByNumber(stationNumber);
        if (!station) {
            console.warn(`⚠️ Станция ${stationNumber} не найдена для добавления команды`);
            return false;
        }

        const queue = this.commandQueues.get(stationNumber) || [];
        const commandData = {
            id: Date.now() + Math.random(), // Уникальный ID команды
            command: command,
            params: params || {},
            timestamp: Date.now()
        };
        
        queue.push(commandData);
        this.commandQueues.set(stationNumber, queue);
        
        console.log(`📝 Команда "${command}" добавлена в очередь для станции ${stationNumber} (всего в очереди: ${queue.length})`);
        return true;
    }

    /**
     * Получение всех команд из очереди для станции (для HTTP polling)
     */
    dequeueCommands(stationNumber) {
        const queue = this.commandQueues.get(stationNumber);
        if (!queue || queue.length === 0) {
            return [];
        }

        // Возвращаем все команды и очищаем очередь
        const commands = [...queue];
        this.commandQueues.set(stationNumber, []);
        
        console.log(`📤 Возвращено ${commands.length} команд из очереди для станции ${stationNumber}`);
        return commands;
    }

    /**
     * Получение одной команды из очереди (для Socket.io)
     * Возвращает null если очередь пуста
     */
    dequeueCommand(stationNumber) {
        const queue = this.commandQueues.get(stationNumber);
        if (!queue || queue.length === 0) {
            return null;
        }

        const command = queue.shift();
        this.commandQueues.set(stationNumber, queue);
        
        console.log(`📤 Команда "${command.command}" извлечена из очереди для станции ${stationNumber} (осталось: ${queue.length})`);
        return command;
    }

    /**
     * Получение количества команд в очереди для станции
     */
    getQueueSize(stationNumber) {
        const queue = this.commandQueues.get(stationNumber);
        return queue ? queue.length : 0;
    }

    /**
     * Очистка очереди команд для станции
     */
    clearQueue(stationNumber) {
        this.commandQueues.set(stationNumber, []);
        console.log(`🗑️ Очередь команд для станции ${stationNumber} очищена`);
    }

    /**
     * Обновление конфигурации джойстика для станции
     */
    updateJoystickConfig(stationNumber, config) {
        const station = this.getStationByNumber(stationNumber);
        if (station) {
            station.joystick.config = config;
            station.joystick.lastTested = Date.now();
            return station;
        }
        return null;
    }

    /**
     * Обновление статуса джойстика для станции
     */
    updateJoystickStatus(stationNumber, status, error = null) {
        const station = this.getStationByNumber(stationNumber);
        if (station) {
            station.joystick.status = status;
            station.joystick.lastTested = Date.now();
            station.joystick.error = error;
            return station;
        }
        return null;
    }

    /**
     * Получение конфигурации джойстика для станции
     */
    getJoystickConfig(stationNumber) {
        const station = this.getStationByNumber(stationNumber);
        return station ? station.joystick : null;
    }
}

// Singleton instance
let localModeManagerInstance = null;

function getLocalModeManager() {
    if (!localModeManagerInstance) {
        localModeManagerInstance = new LocalModeManager();
    }
    return localModeManagerInstance;
}

module.exports = {
    getLocalModeManager,
    LocalModeManager
};

