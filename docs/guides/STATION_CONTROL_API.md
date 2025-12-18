# Универсальная система управления станциями

## Обзор

Новая универсальная система управления станциями позволяет полностью контролировать состояние и поведение страниц станций через сервер. Система поддерживает произвольные команды и данные, что дает максимальную гибкость в управлении.

## Архитектура

### Компоненты системы:

1. **Сервер (`server.js`)** - отправляет команды станциям
2. **Менеджер станций (`server/local/local-mode.js`)** - хранит состояние станций
3. **Страница станции (`public/local-station.html`)** - получает и выполняет команды

### Типы команд:

- `navigate` - навигация между страницами
- `update-state` - обновление состояния станции
- `update-content` - обновление содержимого элементов страницы
- `execute-action` - выполнение действий
- `custom` - кастомные команды

## API

### Socket.io события

#### Отправка команды станциям

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1, 2, 3], // массив номеров станций или null для всех
  command: 'navigate',
  params: {
    page: 'quiz',
    roomCode: 'ABC123',
    quizId: 'gnu'
  }
});
```

#### Получение статуса от станции

```javascript
socket.on('local-station-status-updated', (data) => {
  console.log('Статус станции:', data);
  // data: { stationNumber, status, state, data, timestamp }
});
```

#### Получение состояния станции

```javascript
socket.emit('local-station-get-state', { stationNumber: 1 });
socket.on('local-station-state', (data) => {
  console.log('Состояние станции:', data);
});
```

### HTTP API

#### Отправка команды через HTTP

```bash
POST /api/local/stations/command
Content-Type: application/json

{
  "stationNumbers": [1, 2, 3],
  "command": "navigate",
  "params": {
    "page": "quiz",
    "roomCode": "ABC123"
  }
}
```

#### Получение состояния станции

```bash
GET /api/local/stations/1/state
```

#### Обновление состояния станции

```bash
POST /api/local/stations/1/state
Content-Type: application/json

{
  "state": {
    "currentPage": "waiting",
    "customState": {
      "statusText": "Готов к игре"
    }
  }
}
```

#### Получение статуса всех станций

```bash
GET /api/local/stations/status
```

## Примеры использования

### 1. Навигация - открыть квиз на станциях

```javascript
// Через Socket.io
socket.emit('local-station-command', {
  stationNumbers: [1, 2, 3],
  command: 'navigate',
  params: {
    page: 'quiz',
    roomCode: 'ABC123',
    quizId: 'gnu'
  }
});

// Через HTTP API
fetch('/api/local/stations/command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stationNumbers: [1, 2, 3],
    command: 'navigate',
    params: {
      page: 'quiz',
      roomCode: 'ABC123',
      quizId: 'gnu'
    }
  })
});
```

### 2. Обновление состояния станции

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1],
  command: 'update-state',
  params: {
    statusText: 'Игра началась',
    showTimer: true,
    timerValue: 30
  }
});
```

### 3. Обновление содержимого элементов

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1],
  command: 'update-content',
  params: {
    selector: '#stationStatus',
    text: 'Новый статус',
    style: {
      color: '#00C159',
      fontSize: '24px'
    }
  }
});
```

### 4. Выполнение действий

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1, 2, 3],
  command: 'execute-action',
  params: {
    action: 'showQuestion',
    data: {
      questionNumber: 1,
      questionText: 'Вопрос?'
    }
  }
});
```

### 5. Кастомная команда

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1],
  command: 'custom',
  params: {
    type: 'myCustomAction',
    data: {
      customData: 'любые данные'
    }
  }
});

// На странице станции можно обработать через событие:
window.addEventListener('station-custom-command', (event) => {
  const { type, data } = event.detail;
  console.log('Кастомная команда:', type, data);
});
```

### 6. Возврат в режим ожидания

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1, 2, 3],
  command: 'navigate',
  params: {
    page: 'waiting'
  }
});
```

### 7. Переход на произвольный URL

```javascript
socket.emit('local-station-command', {
  stationNumbers: [1],
  command: 'navigate',
  params: {
    page: 'custom',
    customUrl: '/leaderboard.html?room=ABC123'
  }
});
```

## Обратная связь от станций

Станции автоматически отправляют статус при:
- Подключении к серверу
- Получении команды
- Ошибке выполнения команды

Также можно вручную отправить статус:

```javascript
// На странице станции
socket.emit('local-station-status', {
  stationNumber: 1,
  status: 'ready',
  state: {
    currentPage: 'waiting',
    customState: { ready: true }
  },
  data: { any: 'data' }
});
```

## Состояние станции

Каждая станция имеет состояние:

```javascript
{
  currentPage: 'waiting', // waiting, quiz, results, custom
  pageData: {}, // данные для текущей страницы
  customState: {}, // произвольные данные состояния
  lastUpdate: 1234567890 // timestamp последнего обновления
}
```

## Обратная совместимость

Старые команды продолжают работать:
- `local-station-open-quiz`
- `local-station-return-to-waiting`
- `local-station-end-quiz`
- `local-station-refresh`
- `local-station-reload`

## Рекомендации

1. **Используйте универсальные команды** для новых функций
2. **Храните состояние на сервере** для синхронизации
3. **Отправляйте статус** от станций для мониторинга
4. **Используйте HTTP API** для интеграции с внешними системами
5. **Используйте Socket.io** для реального времени

## Отладка

Все команды логируются на сервере:
- `📤` - отправка команды
- `✅` - успешная отправка
- `⚠️` - предупреждение
- `❌` - ошибка

На странице станции в консоли браузера:
- `📥` - получение команды
- `🧭` - навигация
- `🔄` - обновление состояния
- `📝` - обновление контента
- `⚡` - выполнение действия

