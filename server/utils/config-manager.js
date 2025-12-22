/**
 * Менеджер централизованных конфигураций
 * Управляет загрузкой и доступом к конфигурационным файлам
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '../../config');
        this.systemConfig = null;
        this.versionInfo = null;
        this.loadConfigs();
    }

    /**
     * Загрузка всех конфигураций
     */
    loadConfigs() {
        try {
            // Загружаем системную конфигурацию
            const systemConfigPath = path.join(this.configPath, 'system.json');
            if (fs.existsSync(systemConfigPath)) {
                const systemData = fs.readFileSync(systemConfigPath, 'utf8');
                this.systemConfig = JSON.parse(systemData);
                console.log('✅ Системная конфигурация загружена');
            } else {
                console.warn('⚠️ Файл system.json не найден, используются значения по умолчанию');
                this.systemConfig = this.getDefaultConfig();
            }

            // Загружаем информацию о версии
            const versionPath = path.join(this.configPath, 'version.json');
            if (fs.existsSync(versionPath)) {
                const versionData = fs.readFileSync(versionPath, 'utf8');
                this.versionInfo = JSON.parse(versionData);
                console.log(`✅ Информация о версии загружена: ${this.versionInfo.version}`);
            } else {
                console.warn('⚠️ Файл version.json не найден');
                this.versionInfo = { version: '1.0.0', build: 'unknown' };
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигураций:', error);
            this.systemConfig = this.getDefaultConfig();
            this.versionInfo = { version: '1.0.0', build: 'unknown' };
        }
    }

    /**
     * Получение системной конфигурации
     */
    getSystemConfig() {
        return this.systemConfig;
    }

    /**
     * Получение информации о версии
     */
    getVersionInfo() {
        return this.versionInfo;
    }

    /**
     * Получение конфигурации станции
     */
    getStationConfig(stationNumber) {
        if (!this.systemConfig || !this.systemConfig.joystick.perStationConfig) {
            return null;
        }

        const stationsConfigPath = path.join(
            __dirname,
            '../../data/stations',
            `station-${stationNumber}.json`
        );

        if (fs.existsSync(stationsConfigPath)) {
            try {
                const configData = fs.readFileSync(stationsConfigPath, 'utf8');
                return JSON.parse(configData);
            } catch (error) {
                console.error(`❌ Ошибка загрузки конфигурации станции ${stationNumber}:`, error);
                return null;
            }
        }

        return null;
    }

    /**
     * Сохранение конфигурации станции
     */
    saveStationConfig(stationNumber, config) {
        if (!this.systemConfig || !this.systemConfig.joystick.perStationConfig) {
            return false;
        }

        const stationsConfigPath = path.join(
            __dirname,
            '../../data/stations'
        );

        // Создаем директорию если не существует
        if (!fs.existsSync(stationsConfigPath)) {
            fs.mkdirSync(stationsConfigPath, { recursive: true });
        }

        const configFile = path.join(stationsConfigPath, `station-${stationNumber}.json`);

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
            console.log(`✅ Конфигурация станции ${stationNumber} сохранена`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка сохранения конфигурации станции ${stationNumber}:`, error);
            return false;
        }
    }

    /**
     * Получение сетевых настроек
     */
    getNetworkConfig() {
        return this.systemConfig?.network || null;
    }

    /**
     * Получение настроек станций
     */
    getStationsConfig() {
        return this.systemConfig?.stations || null;
    }

    /**
     * Получение настроек джойстика
     */
    getJoystickConfig() {
        return this.systemConfig?.joystick || null;
    }

    /**
     * Получение настроек развертывания
     */
    getDeploymentConfig() {
        return this.systemConfig?.deployment || null;
    }

    /**
     * Конфигурация по умолчанию
     */
    getDefaultConfig() {
        return {
            version: "1.0.0",
            network: {
                stationIPRange: "192.168.1.21-29",
                serverIP: "192.168.1.20"
            },
            stations: {
                count: 9,
                basePath: "/home/pi/together",
                startIP: 21,
                endIP: 29
            },
            joystick: {
                defaultConfigPath: "/together/data/joystick-config.json",
                perStationConfig: true
            },
            server: {
                port: 3000,
                host: "0.0.0.0"
            }
        };
    }

    /**
     * Перезагрузка конфигураций
     */
    reload() {
        this.loadConfigs();
    }
}

// Singleton instance
let configManagerInstance = null;

function getConfigManager() {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager();
    }
    return configManagerInstance;
}

module.exports = {
    ConfigManager,
    getConfigManager
};


