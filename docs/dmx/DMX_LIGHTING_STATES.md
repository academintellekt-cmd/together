# Таблица состояний освещения DMX

## 📋 Обзор

Эта система разделяет логику игры от технических DMX команд:
- **Состояния игроков** описывают ЧТО должно быть показано (READY, CORRECT, etc.)
- **DMX команды** описывают КАК это технически реализовано (конкретные каналы)

## 🎮 Состояния игроков

| Состояние | Описание | Когда используется | Приоритет |
|-----------|----------|-------------------|-----------|
| `OFF` | Прожектор выключен | Игрок не подключен, игра не началась | 0 |
| `WAITING_FOR_READY` | Ожидание готовности (тёплый цвет) | Игрок подключен, но ещё не нажал "готов" | 1 |
| `READY` | Игрок готов (белый яркий) | Игрок нажал кнопку "готов" | 2 |
| `ANSWERING` | Игрок думает/отвечает (мягкое освещение) | Вопрос активен, игрок выбирает ответ | 3 |
| `COUNTDOWN` | Обратный отсчёт перед вопросом | Идёт обратный отсчёт перед показом вопроса | 4 |
| `LOCKED_IN` | Ответ зафиксирован, ждём результата | Игрок ответил, но результат ещё не показан | 5 |
| `INCORRECT` | Неправильный ответ (красный) | Игрок ответил неправильно | 6 |
| `CORRECT` | Правильный ответ (зелёный) | Игрок ответил правильно | 7 |
| `LEADER` | Лидер турнира (особый эффект) | Игрок лидирует в турнирной таблице | 8 |
| `WINNER` | Победитель (золотой/радужный) | Игрок победил в вопросе/игре | 9 |

### Приоритеты состояний

Состояния с более высоким приоритетом имеют приоритет над состояниями с низким приоритетом.
Например, если игрок одновременно имеет состояния `READY` (2) и `CORRECT` (7), будет показано `CORRECT`.

## 🌍 Фазы игры

| Фаза | Описание | Дефолтное состояние игроков | Глобальный эффект |
|------|----------|----------------------------|-------------------|
| `LOBBY` | Лобби - до начала игры | `OFF` | - |
| `WAITING_ALL_READY` | Ожидание готовности всех игроков | `WAITING_FOR_READY` | - |
| `QUESTION_COUNTDOWN` | Обратный отсчёт перед вопросом | `COUNTDOWN` | Затемнение сцены |
| `QUESTION_ACTIVE` | Вопрос активен, принимаются ответы | `ANSWERING` | - |
| `SHOW_CORRECT_ANSWER` | Показ правильного ответа | (индивидуально) | Зелёная вспышка сцены |
| `SHOW_RESULTS` | Показ результатов вопроса | (индивидуально) | Динамические эффекты |
| `GAME_FINISHED` | Игра завершена | `OFF` | Финальное шоу |

## 📡 События игры

### События подключения и старта

| Событие | Параметры | Действие |
|---------|-----------|----------|
| `GAME_STARTED` | `{ playerCount? }` | Инициализирует комнату, устанавливает фазу `LOBBY`, все игроки `OFF` |
| `PLAYER_JOINED` | `{ playerIndex }` | Устанавливает игроку состояние `WAITING_FOR_READY` |

### События готовности

| Событие | Параметры | Действие |
|---------|-----------|----------|
| `PLAYER_READY` | `{ playerIndex }` | Устанавливает игроку состояние `READY` |
| `ALL_PLAYERS_READY` | `{ readyPlayers? }` | Переводит игру в фазу `QUESTION_COUNTDOWN` |

### События вопроса

| Событие | Параметры | Действие |
|---------|-----------|----------|
| `QUESTION_COUNTDOWN_START` | `{ duration? }` | Устанавливает фазу `QUESTION_COUNTDOWN`, все игроки `COUNTDOWN` |
| `QUESTION_COUNTDOWN_TICK` | `{ secondsLeft }` | Опционально меняет эффект в зависимости от времени |
| `QUESTION_STARTED` | `{ questionId? }` | Устанавливает фазу `QUESTION_ACTIVE`, все игроки `ANSWERING` |

### События ответов

| Событие | Параметры | Действие |
|---------|-----------|----------|
| `PLAYER_ANSWERED` | `{ playerIndex, isCorrect? }` | Если `isCorrect` указан - устанавливает `CORRECT`/`INCORRECT`, иначе `LOCKED_IN` |
| `SHOW_CORRECT_ANSWER` | `{ results: [{ playerIndex, isCorrect }, ...] }` | Устанавливает фазу `SHOW_CORRECT_ANSWER`, устанавливает состояния игроков по результатам |

### События результатов

| Событие | Параметры | Действие |
|---------|-----------|----------|
| `SHOW_RESULTS` | `{ scoreboard: [{ playerIndex, score, isLeader? }, ...] }` | Устанавливает фазу `SHOW_RESULTS`, лидерам `WINNER`, остальным `WAITING_FOR_READY` |
| `GAME_FINISHED` | `{ finalResults: [{ playerIndex, score, rank }, ...] }` | Устанавливает фазу `GAME_FINISHED`, победителю `WINNER`, остальным `OFF` |

## 🔌 Использование в коде игры

### Пример: Игрок подключился

```javascript
const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
const { GameEvent } = require('./server/dmx/dmx-lighting-states');

const engine = getDMXScenarioEngine();

// Игрок подключился
engine.handleGameEvent(roomCode, GameEvent.PLAYER_JOINED, {
  playerIndex: 0  // Индекс игрока (0-based)
});
```

### Пример: Игрок нажал "готов"

```javascript
engine.handleGameEvent(roomCode, GameEvent.PLAYER_READY, {
  playerIndex: 0
});
```

### Пример: Все игроки готовы

```javascript
engine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY, {
  readyPlayers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
});
```

### Пример: Вопрос начался

```javascript
engine.handleGameEvent(roomCode, GameEvent.QUESTION_STARTED, {
  questionId: 'q1'
});
```

### Пример: Игрок ответил

```javascript
// Если результат известен сразу
engine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
  playerIndex: 0,
  isCorrect: true  // или false
});

// Если результат неизвестен (ответ зафиксирован, но правильность пока не показана)
engine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
  playerIndex: 0
  // isCorrect не указан - игрок получит состояние LOCKED_IN
});
```

### Пример: Показать правильный ответ

```javascript
engine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, {
  results: [
    { playerIndex: 0, isCorrect: true },
    { playerIndex: 1, isCorrect: false },
    { playerIndex: 2, isCorrect: true },
    // ...
  ]
});
```

### Пример: Показать результаты вопроса

```javascript
engine.handleGameEvent(roomCode, GameEvent.SHOW_RESULTS, {
  scoreboard: [
    { playerIndex: 0, score: 100, isLeader: true },
    { playerIndex: 1, score: 50, isLeader: false },
    { playerIndex: 2, score: 75, isLeader: false },
    // ...
  ]
});
```

### Пример: Игра завершена

```javascript
engine.handleGameEvent(roomCode, GameEvent.GAME_FINISHED, {
  finalResults: [
    { playerIndex: 0, score: 500, rank: 1 },
    { playerIndex: 1, score: 400, rank: 2 },
    { playerIndex: 2, score: 300, rank: 3 },
    // ...
  ]
});
```

## 🌐 HTTP API

### POST `/api/dmx/scenario/event`

Обработать событие игры (основной endpoint для интеграции).

**Тело запроса:**
```json
{
  "roomCode": "ABC123",
  "event": "PLAYER_READY",
  "data": {
    "playerIndex": 0
  }
}
```

### POST `/api/dmx/scenario/player-state`

Установить состояние игрока вручную.

**Тело запроса:**
```json
{
  "roomCode": "ABC123",
  "playerIndex": 0,
  "state": "READY",
  "forcePriority": false
}
```

### POST `/api/dmx/scenario/all-players-state`

Установить состояние для всех игроков.

**Тело запроса:**
```json
{
  "roomCode": "ABC123",
  "state": "WAITING_FOR_READY",
  "forcePriority": false
}
```

### POST `/api/dmx/scenario/game-phase`

Установить фазу игры.

**Тело запроса:**
```json
{
  "roomCode": "ABC123",
  "phase": "QUESTION_ACTIVE"
}
```

### GET `/api/dmx/scenario/player-state`

Получить текущее состояние игрока.

**Query параметры:**
- `roomCode` - код комнаты
- `playerIndex` - индекс игрока

### GET `/api/dmx/scenario/game-phase`

Получить текущую фазу игры.

**Query параметры:**
- `roomCode` - код комнаты

### GET `/api/dmx/scenario/room-stats`

Получить статистику комнаты (для отладки).

**Query параметры:**
- `roomCode` - код комнаты

### GET `/api/dmx/scenario/definitions`

Получить список всех доступных событий, состояний и фаз (для документации).

## ⚙️ Настройка маппинга состояний на DMX команды

Маппинг состояний на DMX команды хранится в файле `server/dmx/dmx-state-mapping.json`.

**Структура файла:**
```json
{
  "playerStates": {
    "WAITING_FOR_READY": "player-waiting",
    "READY": "player-ready",
    "ANSWERING": "player-answering",
    "CORRECT": "player-correct",
    "INCORRECT": "player-incorrect",
    "WINNER": "player-winner"
  },
  "gamePhases": {
    "QUESTION_COUNTDOWN": {
      "defaultPlayerState": "COUNTDOWN",
      "globalEffect": "countdown-effect"
    }
  }
}
```

**Важно:** 
- Имена команд (например, `"player-ready"`) должны соответствовать именам команд, созданных через веб-интерфейс DMX.
- Если команда с указанным именем не найдена, система попытается найти команду по тегам.
- Если команда не найдена вообще, прожектор будет выключен.

## 📝 Создание DMX команд для состояний

Перед использованием системы состояний необходимо создать DMX команды для каждого состояния:

1. Откройте веб-интерфейс `/dmx-config.html`
2. Настройте прожектор LM70S с нужными каналами (цвет, яркость, эффекты)
3. Сохраните команду с именем, соответствующим состоянию:
   - `player-waiting` - для состояния WAITING_FOR_READY
   - `player-ready` - для состояния READY
   - `player-answering` - для состояния ANSWERING
   - `player-correct` - для состояния CORRECT
   - `player-incorrect` - для состояния INCORRECT
   - `player-winner` - для состояния WINNER
   - и т.д.

Альтернативно, можно использовать теги команд вместо точных имён.

## 🔄 Интеграция с существующим кодом

Система состояний может работать параллельно с существующей системой `DMXIntegration`.
Для постепенного перехода можно использовать оба подхода одновременно.

**Старый подход (через DMXIntegration):**
```javascript
dmxIntegration.onPlayerJoin(roomCode, playerId);
dmxIntegration.onCorrectAnswer(roomCode, playerId);
```

**Новый подход (через Scenario Engine):**
```javascript
const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
const { GameEvent } = require('./server/dmx/dmx-lighting-states');

const engine = getDMXScenarioEngine();
engine.handleGameEvent(roomCode, GameEvent.PLAYER_JOINED, { playerIndex: 0 });
engine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, { 
  results: [{ playerIndex: 0, isCorrect: true }] 
});
```


