# Алгоритм подключения станций к серверу в локальной сети

## Обзор

Этот документ описывает базовый алгоритм подключения игровых станций к центральному серверу в локальной сети. Алгоритм универсален и работает для всех типов квизов и игровых механик.

## Архитектура подключения

```
┌─────────────────┐
│  Центральный    │
│     Сервер      │
│  (192.168.1.10) │
└────────┬────────┘
         │
         │ HTTP API + Socket.io
         │
    ┌────┴──────────────────────────────┐
    │                                    │
┌───▼────┐  ┌───▼────┐  ┌───▼────┐  ┌───▼────┐
│Станция │  │Станция │  │Станция │  │Станция │
│   1    │  │   2    │  │   3    │  │   N    │
│192.168.│  │192.168.│  │192.168.│  │192.168.│
│1.21    │  │1.22    │  │1.23    │  │1.2X    │
└────────┘  └────────┘  └────────┘  └────────┘
```

## Этапы подключения

### Этап 1: Определение номера станции

Станция должна определить свой номер (1-9) одним из следующих методов (в порядке приоритета):

#### Метод 1: URL параметр (наивысший приоритет)
```
http://192.168.1.10:3000/station.html?station=1
```
- Используется для ручной настройки или тестирования
- Приоритет выше всех остальных методов

#### Метод 2: API сервера
```javascript
GET /api/local/detect-ip
```
- Сервер определяет IP клиента из заголовков запроса
- Сопоставляет IP с номером станции по правилу: `stationNumber = lastOctet - 20`
- Пример: IP `192.168.1.21` → станция `1`, IP `192.168.1.22` → станция `2`

#### Метод 3: Hostname
```javascript
// Если открыто напрямую по IP
const hostname = window.location.hostname; // 192.168.1.21
const match = hostname.match(/192\.168\.1\.(\d+)/);
if (match) {
    const lastOctet = parseInt(match[1]);
    if (lastOctet >= 21 && lastOctet <= 29) {
        const stationNumber = lastOctet - 20;
    }
}
```

#### Метод 4: WebRTC (fallback)
```javascript
// Определение локального IP через WebRTC
const pc = new RTCPeerConnection({ iceServers: [] });
pc.createDataChannel('');
pc.onicecandidate = (event) => {
    if (event.candidate) {
        const ip = extractIPFromCandidate(event.candidate);
        // Используем IP для определения номера станции
    }
};
```

**Реализация:** `public/station.html` → `StationDetector.detect()`

---

### Этап 2: Регистрация через HTTP API

После определения номера станция регистрируется через HTTP API:

```javascript
POST /api/local/register-station
Content-Type: application/json

{
    "stationNumber": 1,
    "ip": "192.168.1.21"  // опционально
}
```

**Ответ:**
```json
{
    "success": true,
    "station": {
        "stationNumber": 1,
        "ip": "192.168.1.21",
        "connected": true
    }
}
```

**Реализация:** 
- Клиент: `public/station.html` → `station.connect()`
- Сервер: `server.js` → `/api/local/register-station`

---

### Этап 3: Подключение через Socket.io

После HTTP регистрации станция подключается через Socket.io:

```javascript
const socket = io();

socket.on('connect', () => {
    socket.emit('local-station-connect', {
        stationNumber: 1,
        ip: '192.168.1.21'  // опционально
    });
});
```

**Сервер обрабатывает событие:**
```javascript
socket.on('local-station-connect', (data) => {
    const { ip, stationNumber } = data;
    
    // Регистрация станции в LocalModeManager
    const station = localModeManager.registerStation(ip, stationNumber);
    
    // Сохранение socket.id для отправки команд
    localModeManager.setStationSocketId(stationNumber, socket.id);
    
    // Отправка подтверждения
    socket.emit('local-station-connected', {
        success: true,
        stationNumber: stationNumber,
        ip: ip,
        state: station.state
    });
    
    // Уведомление всех хостов об обновлении
    io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
    });
});
```

**Реализация:**
- Клиент: `public/station.html` → `station.connect()`
- Сервер: `server.js` → обработчик `local-station-connect`

---

### Этап 4: Heartbeat (поддержание соединения)

Станция отправляет heartbeat каждые 2 секунды для подтверждения активности:

```javascript
// Запуск heartbeat
startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
        if (this.socket && this.socket.connected && this.stationNumber) {
            this.socket.emit('local-station-heartbeat', {
                stationNumber: this.stationNumber
            });
        }
    }, 2000);
}
```

**Сервер обрабатывает heartbeat:**
```javascript
socket.on('local-station-heartbeat', (data) => {
    const { stationNumber } = data;
    
    // Обновление времени последнего heartbeat
    localModeManager.updateStationHeartbeat(stationNumber, socket.id);
    
    // Уведомление хостов об обновлении статуса
    io.emit('local-stations-updated', {
        stations: localModeManager.getStations()
    });
});
```

**Таймаут:** Если heartbeat не приходит более 5 секунд, станция помечается как отключенная.

**Реализация:**
- Клиент: `public/station.html` → `station.startHeartbeat()`
- Сервер: `server.js` → обработчик `local-station-heartbeat`
- Сервер: `server/local/local-mode.js` → `cleanupStaleHeartbeats()`

---

### Этап 5: Получение команд от сервера

Сервер отправляет команды станциям через Socket.io:

```javascript
// Сервер отправляет команду
io.to(station.socketId).emit('local-station-command', {
    command: 'navigate',
    params: {
        page: 'quiz',
        roomCode: 'ABC123',
        quizId: 'akadem'
    },
    timestamp: Date.now()
});
```

**Станция обрабатывает команду:**
```javascript
socket.on('local-station-command', (commandData) => {
    const { command, params } = commandData;
    
    // Отправка подтверждения получения
    socket.emit('local-station-command-received', {
        stationNumber: this.stationNumber,
        command: command,
        timestamp: commandData.timestamp
    });
    
    // Обработка команды
    switch(command) {
        case 'navigate':
            handleNavigateCommand(params);
            break;
        case 'update':
            updateStatus(params.status, params.info);
            break;
        // ... другие команды
    }
});
```

**Реализация:**
- Клиент: `public/station.html` → `station.handleCommand()`
- Сервер: `server.js` → различные места отправки `local-station-command`

---

## Типы команд

### 1. Команда навигации

Переход на другую страницу:

```javascript
{
    command: 'navigate',
    params: {
        page: 'quiz',           // или 'chgk-quiz', 'waiting', 'custom'
        roomCode: 'ABC123',
        quizId: 'akadem',        // опционально
        customUrl: '/custom.html' // для page: 'custom'
    }
}
```

**Обработка:**
```javascript
handleNavigateCommand(params) {
    if (params.page === 'waiting') {
        window.location.replace('/station.html');
    } else if (params.page === 'quiz' && params.roomCode) {
        const url = `/player.html?room=${params.roomCode}&station=${this.stationNumber}&auto=true`;
        window.location.href = url;
    } else if (params.page === 'chgk-quiz' && params.roomCode) {
        const url = `/chgk-player.html?room=${params.roomCode}&station=${this.stationNumber}&auto=true`;
        window.location.href = url;
    } else if (params.page === 'custom' && params.customUrl) {
        window.location.href = params.customUrl;
    }
}
```

### 2. Команда обновления статуса

Обновление текста на экране станции:

```javascript
{
    command: 'update',
    params: {
        status: 'Ожидание начала игры...',
        info: 'Комната: ABC123'
    }
}
```

### 3. Команда проверки джойстика

Проверка подключения джойстика:

```javascript
{
    command: 'check-joystick-status'
}
```

---

## Запуск игры на станциях

### Обычный квиз

1. **Хост выбирает квиз и станции** на `local-host.html`
2. **Создается комната:**
   ```javascript
   POST /api/create-room
   {
       "quizId": "akadem",
       "mode": "local"
   }
   ```

3. **Хост подключается к комнате:**
   ```javascript
   socket.emit('host-join', roomCode);
   ```

4. **Сервер отправляет команду выбранным станциям:**
   ```javascript
   socket.emit('local-start-quiz', {
       roomCode: 'ABC123',
       quizId: 'akadem',
       stationNumbers: [1, 2, 3, 4]
   });
   ```

5. **Сервер обрабатывает и отправляет команды станциям:**
   ```javascript
   socket.on('local-start-quiz', (data) => {
       const { roomCode, quizId, stationNumbers } = data;
       
       stationNumbers.forEach(stationNumber => {
           const station = localModeManager.getStationByNumber(stationNumber);
           
           io.to(station.socketId).emit('local-station-command', {
               command: 'navigate',
               params: {
                   page: 'quiz',
                   roomCode: roomCode,
                   quizId: quizId
               }
           });
       });
   });
   ```

6. **Станции получают команду и переходят на `player.html`**

### ЧГК (Что? Где? Когда?)

Аналогично обычному квизу, но:
- Используется `local-start-chgk` вместо `local-start-quiz`
- Команда навигации: `page: 'chgk-quiz'`
- Станции переходят на `chgk-player.html`

---

## Защита от race conditions

При одновременной отправке команд `waiting` и `quiz` используется защита:

```javascript
lastWaitingCommandTime: 0,

handleNavigateCommand(params) {
    if (params.page === 'waiting') {
        this.lastWaitingCommandTime = Date.now();
        window.location.replace('/station.html');
    } else if (params.page === 'quiz' && params.roomCode) {
        // Проверяем, не получили ли мы команду waiting недавно
        const timeSinceWaiting = Date.now() - this.lastWaitingCommandTime;
        if (timeSinceWaiting < 2000) {
            // Игнорируем команду quiz - станция не выбрана для игры
            return;
        }
        
        // Переход на player.html
        const url = `/player.html?room=${params.roomCode}&station=${this.stationNumber}&auto=true`;
        window.location.href = url;
    }
}
```

---

## Очередь команд

Сервер поддерживает очередь команд для каждой станции:

```javascript
// Добавление команды в очередь
localModeManager.enqueueCommand(stationNumber, 'navigate', {
    page: 'quiz',
    roomCode: 'ABC123'
});

// Получение команд из очереди (при переподключении)
const queuedCommands = localModeManager.dequeueCommands(stationNumber);
queuedCommands.forEach(cmd => {
    socket.emit('local-station-command', cmd);
});
```

**Использование:**
- Команды добавляются в очередь, если станция не подключена
- При подключении все команды из очереди отправляются сразу
- Очередь очищается после отправки

---

## Определение IP станции на сервере

Сервер определяет IP клиента из заголовков запроса:

```javascript
function getSocketIp(socket) {
    const req = socket.request;
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    if (realIp) {
        return realIp;
    }
    return req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           socket.handshake.address;
}
```

**Важно:** Для правильного определения IP необходимо:
```javascript
app.set('trust proxy', true);
```

---

## Состояние станции

Каждая станция имеет состояние:

```javascript
{
    stationNumber: 1,
    ip: '192.168.1.21',
    connected: true,
    socketId: 'socket-id-123',
    lastSeen: 1234567890,
    lastHeartbeat: 1234567890,
    joystick: {
        config: null,
        status: 'not_tested',
        lastTested: null,
        error: null
    },
    state: {
        currentPage: 'waiting',  // waiting, quiz, results, custom
        pageData: {},
        customState: {},
        lastUpdate: 1234567890
    }
}
```

---

## Уведомление хостов об изменениях

При любом изменении состояния станции все подключенные хосты получают обновление:

```javascript
io.emit('local-stations-updated', {
    stations: localModeManager.getStations()
});
```

**Хост подписывается на обновления:**
```javascript
socket.on('local-stations-updated', (data) => {
    stations = data.stations || [];
    updateStationsDisplay(); // Обновление UI с иконками станций
});
```

---

## Завершение игры и возврат в режим ожидания

После завершения игры станции возвращаются в режим ожидания:

```javascript
socket.emit('local-end-quiz-and-reset', {
    stationNumbers: null,  // null = все станции
    roomCode: currentRoomCode,
    clearRoom: true,
    returnToWaiting: true
});
```

**Сервер обрабатывает:**
```javascript
socket.on('local-end-quiz-and-reset', (data) => {
    const { stationNumbers, roomCode, clearRoom, returnToWaiting } = data;
    
    // Определяем станции для перезапуска
    const stationsToReset = stationNumbers 
        ? stationNumbers.map(n => localModeManager.getStationByNumber(n))
        : localModeManager.getStations().filter(s => s.connected);
    
    // Отправляем команду waiting всем станциям
    stationsToReset.forEach(station => {
        if (station.socketId) {
            io.to(station.socketId).emit('local-station-command', {
                command: 'navigate',
                params: { page: 'waiting' }
            });
        }
        
        // Также отправляем на все соединения с IP станции
        const stationIp = station.ip;
        if (stationIp) {
            io.sockets.sockets.forEach((socket) => {
                const socketIp = getSocketIp(socket);
                if (socketIp === stationIp) {
                    io.to(socket.id).emit('local-station-command', {
                        command: 'navigate',
                        params: { page: 'waiting' }
                    });
                }
            });
        }
    });
    
    // Очистка комнаты
    if (clearRoom && roomCode) {
        // Удаление комнаты и игроков
    }
});
```

---

## Шаблон для новых механик

При создании новой игровой механики используйте следующий шаблон:

### 1. Создание комнаты

```javascript
POST /api/new-mechanic/create-room
{
    "quizId": "new-mechanic",
    "settings": {}
}
```

### 2. Запуск на станциях

```javascript
socket.emit('local-start-new-mechanic', {
    roomCode: 'ABC123',
    stationNumbers: [1, 2, 3, 4],
    settings: {}
});
```

### 3. Обработка на сервере

```javascript
socket.on('local-start-new-mechanic', (data) => {
    const { roomCode, stationNumbers, settings } = data;
    
    stationNumbers.forEach(stationNumber => {
        const station = localModeManager.getStationByNumber(stationNumber);
        
        if (station && station.socketId) {
            io.to(station.socketId).emit('local-station-command', {
                command: 'navigate',
                params: {
                    page: 'new-mechanic',
                    roomCode: roomCode,
                    settings: settings
                }
            });
        }
    });
});
```

### 4. Обработка на клиенте (station.html)

```javascript
handleNavigateCommand(params) {
    if (params.page === 'new-mechanic' && params.roomCode) {
        const url = `/new-mechanic-player.html?room=${params.roomCode}&station=${this.stationNumber}&auto=true`;
        window.location.href = url;
    }
}
```

---

## Ключевые принципы

1. **Универсальность:** Базовый алгоритм подключения одинаков для всех механик
2. **Надежность:** Heartbeat подтверждает активность станции
3. **Очередь команд:** Команды не теряются при временном отключении
4. **Определение IP:** Сервер всегда знает IP станции для отправки команд
5. **Защита от race conditions:** Проверка времени последней команды `waiting`
6. **Уведомления:** Хосты всегда видят актуальное состояние станций

---

## Файлы реализации

- **Клиент (станция):** `public/station.html`
- **Сервер (менеджер):** `server/local/local-mode.js`
- **Сервер (обработчики):** `server.js` (строки 4077-4179)
- **Хост (управление):** `public/local-host.html`

---

## Отладка

### Проверка подключения станции

```javascript
// В консоли браузера на станции
console.log('Station number:', station.stationNumber);
console.log('Socket connected:', station.socket?.connected);
console.log('Heartbeat interval:', station.heartbeatInterval);
```

### Проверка на сервере

```javascript
// В консоли сервера
const station = localModeManager.getStationByNumber(1);
console.log('Station 1:', {
    connected: station.connected,
    socketId: station.socketId,
    lastHeartbeat: station.lastHeartbeat,
    ip: station.ip
});
```

### Проверка очереди команд

```javascript
const queueSize = localModeManager.getQueueSize(1);
console.log('Queue size for station 1:', queueSize);
```

---

## Заключение

Этот алгоритм обеспечивает надежное подключение станций к серверу и может быть использован как основа для любых новых игровых механик. Все базовые функции (определение станции, регистрация, heartbeat, получение команд) работают одинаково независимо от типа игры.

