# Миграция на унифицированную архитектуру

## Обзор изменений

Проект был унифицирован согласно ТЗ `together_unification_TZ.txt`:

### Что сделано

✅ **1. Единое ядро системы**
- `server/core/events.js` - Event Bus для всех игровых событий
- `server/core/rooms.js` - Единое хранилище комнат (заменяет `rooms` и `global.intellectualRooms`)
- `server/core/socket-router.js` - Единый роутер Socket.IO с новым протоколом

✅ **2. Реестр игровых движков**
- `server/games/index.js` - Центральный реестр игр
- `server/games/quiz.game.js` - Движок квиза с вариантами ответов
- `server/games/chgk.game.js` - Движок ЧГК с текстовыми ответами
- `server/games/solo.game.js` - Движок соло-режима

✅ **3. Единый протокол Socket.IO**

**Новые события:**
- `room:join` - подключение к комнате
- `room:leave` - отключение от комнаты
- `room:state` - состояние комнаты (сервер → клиент)
- `game:action` - игровое действие (клиент → сервер)
- `system:error` - ошибки

**Старые события** продолжают работать через `compatibility-adapter.js`

✅ **4. Единое состояние комнаты**

```javascript
{
  roomCode: string,
  gameId: "quiz" | "chgk" | "solo",
  phase: string,
  phaseEndsAt: number | null,
  players: [...],
  host: { id, isConnected },
  ui: { ... },
  meta: { createdAt, updatedAt }
}
```

✅ **5. DMX интеграция через Event Bus**
- `server/dmx/dmx-integration-unified.js` - Подписывается на события игры
- Отвязан от конкретных реализаций страниц

✅ **6. API для комнат**
- `POST /api/rooms` - создание комнаты (универсальный endpoint)
- `GET /api/rooms/:roomCode` - получение состояния
- `GET /api/games/list` - список доступных игр

✅ **7. Обратная совместимость**
- `server/core/compatibility-adapter.js` - транслирует старые события в новые
- `server/routes/redirects.js` - редиректы для старых URL
- Старый `server.js` сохранен как `server.js.backup`

## Как запустить

### Вариант 1: Новый унифицированный сервер (рекомендуется)

```bash
node server-unified.js
```

**Преимущества:**
- Чистая архитектура
- Единый протокол
- Event Bus для DMX
- Готов к масштабированию

**Ограничения:**
- Требуется обновление клиентского кода для использования нового протокола
- Старые события работают через адаптер совместимости

### Вариант 2: Старый сервер (для полной совместимости)

```bash
node server.js
```

**Преимущества:**
- Полная совместимость со всем существующим кодом
- Все функции работают как раньше

**Недостатки:**
- Старая архитектура
- Разные протоколы для разных игр
- Сложнее поддерживать

## Миграция клиентского кода

### Шаг 1: Обновление подключения к комнате

**Было (старый протокол):**
```javascript
socket.emit('player-join', {
  roomCode: 'ABCD',
  playerName: 'Player 1'
});
```

**Стало (новый протокол):**
```javascript
socket.emit('room:join', {
  roomCode: 'ABCD',
  role: 'player',
  name: 'Player 1'
});
```

### Шаг 2: Обновление игровых действий

**Было:**
```javascript
socket.emit('answer', {
  roomCode: 'ABCD',
  answerIndex: 2
});
```

**Стало:**
```javascript
socket.emit('game:action', {
  roomCode: 'ABCD',
  type: 'answer',
  payload: { answerIndex: 2 }
});
```

### Шаг 3: Обновление получения состояния

**Было (разные события для разных состояний):**
```javascript
socket.on('question', (data) => { ... });
socket.on('results', (data) => { ... });
socket.on('game-finished', (data) => { ... });
```

**Стало (единое событие):**
```javascript
socket.on('room:state', (state) => {
  switch (state.phase) {
    case 'question':
      // Отображаем вопрос из state.ui.question
      break;
    case 'results':
      // Отображаем результаты из state.ui.results
      break;
    case 'finished':
      // Отображаем финальные результаты
      break;
  }
});
```

## Создание комнаты через новый API

**Quiz:**
```javascript
fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'quiz',
    quizId: 'gnu',
    mode: 'online',
    password: null
  })
})
.then(res => res.json())
.then(data => {
  console.log('Room created:', data.roomCode);
});
```

**CHGK:**
```javascript
fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'chgk',
    quizId: 'chgk',
    password: null
  })
})
.then(res => res.json())
.then(data => {
  console.log('Room created:', data.roomCode);
});
```

## Локальные станции

Локальные станции теперь работают как обычные игроки с дополнительными полями:

```javascript
socket.emit('room:join', {
  roomCode: 'ABCD',
  role: 'station',  // Вместо 'player'
  name: 'P1',
  stationId: 1      // Дополнительное поле
});
```

Управление станциями остается через REST API:
- `GET /api/stations/status`
- `POST /api/stations/command`

## DMX интеграция

DMX теперь подписывается на события через Event Bus:

```javascript
const { getEventBus, GAME_EVENTS } = require('./server/core/events');

const eventBus = getEventBus();

eventBus.on(GAME_EVENTS.PLAYER_CORRECT, (data) => {
  // Включаем зеленый свет для игрока
  dmxController.setPlayerLight(data.playerIndex, 'green');
});
```

События доступны:
- `GAME_STARTED`
- `GAME_FINISHED`
- `QUESTION_SHOWN`
- `PLAYER_JOINED`
- `PLAYER_ANSWERED`
- `PLAYER_CORRECT`
- `PLAYER_WRONG`
- `PLAYER_READY`

## Что дальше?

### Оставшиеся задачи (по приоритету):

1. **Интеграция локальных станций** - полная интеграция станций как игроков
2. **Реструктуризация страниц** - переименование и реорганизация HTML файлов
3. **Вынос JS из HTML** - создание отдельных JS модулей

### Рекомендации:

1. **Постепенная миграция**: начните с новых функций на `server-unified.js`
2. **Тестирование**: проверьте все игровые сценарии
3. **Мониторинг**: следите за логами при переходе
4. **Откат**: в случае проблем вернитесь к `server.js`

## Структура проекта

```
server/
  core/
    events.js              # Event Bus
    rooms.js               # Единое хранилище комнат
    socket-router.js       # Socket.IO роутер
    compatibility-adapter.js  # Адаптер совместимости
  games/
    index.js               # Реестр игр
    quiz.game.js           # Движок квиза
    chgk.game.js           # Движок ЧГК
    solo.game.js           # Движок соло
  routes/
    rooms-api.js           # Unified Rooms API
    redirects.js           # Редиректы
  dmx/
    dmx-integration-unified.js  # DMX через Event Bus
  local/
    local-mode.js          # Локальный режим (без изменений)
  utils/
    quiz-loader.js         # Загрузка квизов (без изменений)
    config-manager.js      # Конфигурация (без изменений)

server.js                  # Старый сервер (backup)
server.js.backup           # Резервная копия
server-unified.js          # Новый унифицированный сервер
```

## Поддержка

При возникновении проблем:
1. Проверьте логи сервера
2. Убедитесь, что все модули установлены (`npm install`)
3. Проверьте, что порт 3000 свободен
4. В случае критических проблем вернитесь к `server.js`

