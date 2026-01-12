# 🚀 Быстрый старт унифицированной системы

## ✅ Что было сделано

Проект унифицирован согласно ТЗ `together_unification_TZ.txt`:

### Ключевые изменения:

1. **Единый протокол Socket.IO** - все игры используют `room:join`, `game:action`, `room:state`
2. **Единое хранилище комнат** - больше нет отдельных `rooms` и `intellectualRooms`
3. **Реестр игровых движков** - все игры регистрируются в `server/games/`
4. **Event Bus для DMX** - DMX подписывается на игровые события
5. **Обратная совместимость** - старые события работают через адаптер

## 🎮 Запуск

### Новый унифицированный сервер (рекомендуется):

```bash
node server-unified.js
```

### Старый сервер (для полной совместимости):

```bash
node server.js
```

## 📋 Быстрая проверка

### 1. Проверка работы нового API

```bash
# Получить список игр
curl http://localhost:3000/api/games/list

# Создать комнату для квиза
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"gameId":"quiz","quizId":"gnu","mode":"online"}'

# Получить состояние комнаты
curl http://localhost:3000/api/rooms/ABCD
```

### 2. Проверка Socket.IO (в браузере)

```javascript
const socket = io();

// Создаем комнату через API
fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'quiz',
    quizId: 'gnu'
  })
})
.then(res => res.json())
.then(data => {
  const roomCode = data.roomCode;
  
  // Подключаемся как хост
  socket.emit('room:join', {
    roomCode,
    role: 'host'
  });
  
  // Слушаем состояние
  socket.on('room:state', (state) => {
    console.log('Room state:', state);
  });
});
```

### 3. Проверка совместимости (старые события)

```javascript
// Старые события все еще работают!
socket.emit('player-join', {
  roomCode: 'ABCD',
  playerName: 'Test Player'
});

socket.on('player-connected', (data) => {
  console.log('Connected (old protocol):', data);
});
```

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────┐
│           Client (Browser/Station)          │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │   Socket.IO        │
        │  (unified protocol)│
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │  Socket Router     │◄──── Compatibility Adapter
        └─────────┬──────────┘      (old events → new)
                  │
        ┌─────────▼──────────┐
        │   Room Manager     │
        │  (unified storage) │
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │   Game Registry    │
        └─────────┬──────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐
│ Quiz   │  │  CHGK   │  │  Solo   │
│ Engine │  │ Engine  │  │ Engine  │
└───┬────┘  └────┬────┘  └────┬────┘
    │            │            │
    └────────────┼────────────┘
                 │
        ┌────────▼─────────┐
        │    Event Bus     │
        └────────┬─────────┘
                 │
        ┌────────▼─────────┐
        │  DMX Integration │
        └──────────────────┘
```

## 📁 Новые файлы

### Ядро системы:
- `server/core/events.js` - Event Bus
- `server/core/rooms.js` - Менеджер комнат
- `server/core/socket-router.js` - Socket.IO роутер
- `server/core/compatibility-adapter.js` - Адаптер совместимости

### Игровые движки:
- `server/games/index.js` - Реестр
- `server/games/quiz.game.js` - Quiz
- `server/games/chgk.game.js` - ЧГК
- `server/games/solo.game.js` - Solo

### API:
- `server/routes/rooms-api.js` - Unified Rooms API
- `server/routes/redirects.js` - Редиректы

### DMX:
- `server/dmx/dmx-integration-unified.js` - DMX через Event Bus

### Сервер:
- `server-unified.js` - Новый сервер
- `server.js.backup` - Резервная копия старого

### Документация:
- `docs/MIGRATION_TO_UNIFIED.md` - Подробная документация по миграции
- `UNIFIED_QUICKSTART.md` - Этот файл

## 🔄 Новый протокол Socket.IO

### События клиент → сервер:

**room:join** - Подключение к комнате
```javascript
socket.emit('room:join', {
  roomCode: 'ABCD',
  role: 'host' | 'player' | 'station' | 'commission',
  name: 'Player Name',      // для игроков
  stationId: 1,             // для станций
  gameId: 'quiz' | 'chgk',  // если создаем новую комнату
  settings: { ... }         // настройки новой комнаты
});
```

**game:action** - Игровое действие
```javascript
socket.emit('game:action', {
  roomCode: 'ABCD',
  type: 'start' | 'answer' | 'ready' | 'next-question' | ...,
  payload: { ... }
});
```

**room:leave** - Отключение от комнаты
```javascript
socket.emit('room:leave', {
  roomCode: 'ABCD'
});
```

### События сервер → клиент:

**room:state** - Состояние комнаты (единое для всех)
```javascript
socket.on('room:state', (state) => {
  // state.phase: 'lobby' | 'playing' | 'question' | 'results' | 'finished'
  // state.ui: данные для отображения
  // state.players: список игроков
  // state.phaseEndsAt: timestamp окончания фазы (для таймера)
});
```

**system:error** - Ошибка
```javascript
socket.on('system:error', (error) => {
  console.error('Error:', error.message);
});
```

## 🎯 Примеры использования

### Quiz - создание и игра

```javascript
// 1. Создаем комнату
const response = await fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'quiz',
    quizId: 'gnu',
    mode: 'online'
  })
});
const { roomCode } = await response.json();

// 2. Хост подключается
socket.emit('room:join', {
  roomCode,
  role: 'host'
});

// 3. Игроки подключаются
socket.emit('room:join', {
  roomCode,
  role: 'player',
  name: 'Player 1'
});

// 4. Хост запускает игру
socket.emit('game:action', {
  roomCode,
  type: 'start',
  payload: {}
});

// 5. Игрок отвечает
socket.emit('game:action', {
  roomCode,
  type: 'answer',
  payload: { answerIndex: 2 }
});

// 6. Все слушают состояние
socket.on('room:state', (state) => {
  if (state.phase === 'question') {
    // Показываем вопрос
    displayQuestion(state.ui.question);
  } else if (state.phase === 'results') {
    // Показываем результаты
    displayResults(state.ui.results);
  }
});
```

### CHGK - с жюри

```javascript
// 1. Создаем комнату
const { roomCode } = await fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'chgk',
    quizId: 'chgk'
  })
}).then(r => r.json());

// 2. Хост, игроки и жюри подключаются
socket.emit('room:join', {
  roomCode,
  role: 'commission'  // или 'host', 'player'
});

// 3. Игрок отправляет текстовый ответ
socket.emit('game:action', {
  roomCode,
  type: 'submit',
  payload: { text: 'Мой ответ' }
});

// 4. Жюри проверяет ответ
socket.emit('game:action', {
  roomCode,
  type: 'verify',
  payload: {
    playerId: 'socket-id',
    isCorrect: true,
    score: 10
  }
});
```

## 🔧 Отладка

### Логи сервера

Новый сервер выводит подробные логи:

```
✅ Unified Socket.IO protocol initialized
✅ Compatibility adapter initialized
🎮 Host joined room ABCD
✅ Player joined: Player 1 (station: online)
📤 Отправка вопроса 1 из 10 в комнату ABCD
```

### Проверка состояния комнаты

```bash
curl http://localhost:3000/api/rooms/ABCD | jq
```

### Проверка Event Bus (в коде)

```javascript
const { getEventBus, GAME_EVENTS } = require('./server/core/events');

const eventBus = getEventBus();

// Подписываемся на все события
Object.values(GAME_EVENTS).forEach(event => {
  eventBus.on(event, (data) => {
    console.log(`Event: ${event}`, data);
  });
});
```

## ⚠️ Известные ограничения

1. **Клиентский код** - требует обновления для использования нового протокола
2. **Локальные станции** - частично интегрированы, требуется доработка
3. **Страницы** - еще не реструктурированы (будет в следующей итерации)
4. **JS в HTML** - еще не вынесен в отдельные файлы

## 📚 Дополнительная информация

- Подробная документация: `docs/MIGRATION_TO_UNIFIED.md`
- Оригинальное ТЗ: `together_unification_TZ.txt`
- Архитектура: `docs/architecture/`

## 🆘 Помощь

Если что-то не работает:

1. **Проверьте порт**: убедитесь, что порт 3000 свободен
2. **Проверьте зависимости**: `npm install`
3. **Проверьте логи**: смотрите вывод сервера
4. **Откат**: используйте `node server.js` для старой версии
5. **Резервная копия**: `server.js.backup` - оригинальный файл

## ✨ Что дальше?

Следующие шаги по ТЗ:

1. ✅ Единое ядро и протокол
2. ✅ Реестр игровых движков
3. ✅ Event Bus для DMX
4. ✅ Обратная совместимость
5. ⏳ Интеграция локальных станций как игроков
6. ⏳ Реструктуризация страниц (app/games/admin/dev)
7. ⏳ Вынос JS из HTML в отдельные модули

---

**Версия:** 1.0 (Унифицированная архитектура)  
**Дата:** 2025-12-23  
**Статус:** ✅ Готово к тестированию

