const express = require('express');

function createLocalRouter({ localModeManager, io, findPlayersForStation }) {
  const router = express.Router();

  // Регистрация станции
  router.post('/register-station', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
      req.headers['x-real-ip'];

    let normalizedClientIp = clientIp;
    if (clientIp && clientIp.startsWith('::ffff:')) {
      normalizedClientIp = clientIp.replace('::ffff:', '');
    }

    let { ip, stationNumber } = req.body;

    if (!ip && normalizedClientIp) {
      ip = normalizedClientIp;
    }

    if (!stationNumber && ip) {
      const ipMatch = ip.match(/192\.168\.1\.(\d+)/);
      if (ipMatch) {
        const lastOctet = parseInt(ipMatch[1]);
        if (lastOctet >= 21 && lastOctet <= 29) {
          stationNumber = lastOctet - 20;
        }
      }
    }

    if (!ip || !stationNumber) {
      return res.status(400).json({
        success: false,
        error: 'Не удалось определить IP или номер станции',
        detectedIp: normalizedClientIp || ip,
        suggestion: normalizedClientIp ? 'Попробуйте указать номер станции вручную' : 'Проверьте подключение к сети'
      });
    }

    const station = localModeManager.registerStation(ip, stationNumber);

    if (station) {
      console.log(`✅ Станция ${stationNumber} зарегистрирована: ${ip} (клиент: ${normalizedClientIp})`);
      io.emit('local-stations-updated', { stations: localModeManager.getStations() });
      res.json({ success: true, station });
    } else {
      res.status(400).json({ success: false, error: 'Станция не найдена. Проверьте, что IP находится в диапазоне 192.168.1.21-29' });
    }
  });

  // Определение IP клиента
  router.get('/detect-ip', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
      req.headers['x-real-ip'];

    let normalizedClientIp = clientIp;
    if (clientIp && clientIp.startsWith('::ffff:')) {
      normalizedClientIp = clientIp.replace('::ffff:', '');
    }

    let stationNumber = null;
    if (normalizedClientIp) {
      const ipMatch = normalizedClientIp.match(/192\.168\.1\.(\d+)/);
      if (ipMatch) {
        const lastOctet = parseInt(ipMatch[1]);
        if (lastOctet >= 21 && lastOctet <= 29) {
          stationNumber = lastOctet - 20;
        }
      }
    }

    res.json({
      ip: normalizedClientIp,
      stationNumber: stationNumber,
      hostname: req.headers.host || 'unknown'
    });
  });

  // Список станций
  router.get('/stations', (req, res) => {
    const stations = localModeManager.getStations();
    res.json({ stations });
  });

  // Универсальная команда станциям
  router.post('/stations/command', (req, res) => {
    try {
      const { stationNumbers, command, params } = req.body;

      if (!command) {
        return res.status(400).json({
          success: false,
          error: 'Команда не указана'
        });
      }

      const stations = localModeManager.getStationsByNumbers(stationNumbers);

      if (stations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Нет подключенных станций для отправки команды'
        });
      }

      console.log(`📤 HTTP API: Универсальная команда "${command}" отправляется на станции: ${stations.map(s => s.stationNumber).join(', ')}`);

      const results = [];
      const commandData = {
        command: command,
        params: params || {},
        timestamp: Date.now()
      };

      stations.forEach(station => {
        localModeManager.enqueueCommand(station.stationNumber, command, params);

        let sentToStation = false;
        let sentToPlayers = 0;

        if (station.connected && station.socketId) {
          io.to(station.socketId).emit('local-station-command', commandData);
          sentToStation = true;
          console.log(`✅ HTTP API: Команда "${command}" отправлена через Socket.io станции ${station.stationNumber} (${station.ip})`);
        } else {
          console.log(`📝 HTTP API: Команда "${command}" добавлена в очередь для станции ${station.stationNumber} (Socket.io не подключен, будет получена через polling)`);
        }

        const playerSockets = findPlayersForStation(station.stationNumber);
        playerSockets.forEach(({ socketId, playerName, roomCode }) => {
          io.to(socketId).emit('local-station-command', commandData);
          sentToPlayers++;
          console.log(`✅ HTTP API: Команда "${command}" отправлена игроку ${playerName} (socketId: ${socketId}, комната: ${roomCode})`);
        });

        if (command === 'navigate' && params && params.page) {
          localModeManager.updateStationState(station.stationNumber, {
            currentPage: params.page,
            pageData: params.data || {}
          });
        } else if (command === 'update-state' && params) {
          const currentState = station.state.customState || {};
          localModeManager.updateStationState(station.stationNumber, {
            customState: {
              ...currentState,
              ...params
            }
          });
        }

        results.push({
          stationNumber: station.stationNumber,
          ip: station.ip,
          success: true,
          sentViaSocket: sentToStation,
          sentToPlayers: sentToPlayers
        });
      });

      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });

      res.json({
        success: true,
        command: command,
        stationsAffected: results.length,
        results: results
      });
    } catch (error) {
      console.error('❌ Ошибка отправки команды станциям:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка отправки команды: ' + error.message
      });
    }
  });

  // Получение состояния конкретной станции
  router.get('/stations/:stationNumber/state', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const station = localModeManager.getStationByNumber(stationNumber);

      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Станция не найдена'
        });
      }

      res.json({
        success: true,
        stationNumber: station.stationNumber,
        state: station.state,
        connected: station.connected,
        lastSeen: station.lastSeen,
        ip: station.ip
      });
    } catch (error) {
      console.error('❌ Ошибка получения состояния станции:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения состояния: ' + error.message
      });
    }
  });

  // Обновление состояния станции напрямую
  router.post('/stations/:stationNumber/state', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const { state } = req.body;

      if (!state) {
        return res.status(400).json({
          success: false,
          error: 'Состояние не указано'
        });
      }

      const station = localModeManager.updateStationState(stationNumber, state);

      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Станция не найдена'
        });
      }

      io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
      });

      res.json({
        success: true,
        stationNumber: station.stationNumber,
        state: station.state
      });
    } catch (error) {
      console.error('❌ Ошибка обновления состояния станции:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка обновления состояния: ' + error.message
      });
    }
  });

  // Получение команд из очереди для станции (HTTP polling)
  router.get('/stations/:stationNumber/commands', (req, res) => {
    try {
      const stationNumber = parseInt(req.params.stationNumber);
      const station = localModeManager.getStationByNumber(stationNumber);

      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Станция не найдена',
          commands: []
        });
      }

      station.lastSeen = Date.now();
      if (!station.connected) {
        station.connected = true;
      }

      const commands = localModeManager.dequeueCommands(stationNumber);

      console.log(`📥 HTTP Polling: Станция ${stationNumber} запросила команды, получено: ${commands.length}`);

      res.json({
        success: true,
        stationNumber: stationNumber,
        commands: commands,
        state: station.state,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Ошибка получения команд для станции:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения команд: ' + error.message,
        commands: []
      });
    }
  });

  // Список всех станций с состояниями
  router.get('/stations/status', (req, res) => {
    try {
      const stations = localModeManager.getStations();
      const stationsStatus = stations.map(station => ({
        stationNumber: station.stationNumber,
        ip: station.ip,
        connected: station.connected,
        socketId: station.socketId,
        state: station.state,
        lastSeen: station.lastSeen
      }));

      res.json({
        success: true,
        stations: stationsStatus,
        total: stationsStatus.length,
        connected: stationsStatus.filter(s => s.connected).length
      });
    } catch (error) {
      console.error('❌ Ошибка получения статуса станций:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения статуса: ' + error.message
      });
    }
  });

  return router;
}

module.exports = {
  createLocalRouter
};

