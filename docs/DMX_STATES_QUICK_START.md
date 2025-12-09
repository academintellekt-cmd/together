# Быстрый старт: Система состояний освещения DMX

## ✅ Что было создано

1. **Система определений состояний** (`dmx-lighting-states.js`)
   - Состояния игроков: `OFF`, `WAITING_FOR_READY`, `READY`, `ANSWERING`, `CORRECT`, `INCORRECT`, `WINNER` и др.
   - Фазы игры: `LOBBY`, `WAITING_ALL_READY`, `QUESTION_ACTIVE`, `SHOW_RESULTS` и др.
   - События игры: `GAME_STARTED`, `PLAYER_JOINED`, `PLAYER_READY`, `QUESTION_STARTED` и др.

2. **Маппинг состояний на DMX команды** (`dmx-state-mapping.js`)
   - Связывает логические состояния с конкретными DMX командами
   - Хранится в `server/dmx/dmx-state-mapping.json`

3. **Менеджер состояний** (`dmx-state-manager.js`)
   - Управляет состояниями игроков и фазой игры
   - Автоматически применяет DMX команды при изменении состояний

4. **Движок сценариев** (`dmx-scenario-engine.js`)
   - Обрабатывает события игры
   - Высокоуровневый интерфейс для управления освещением

5. **API endpoints** (в `dmx-api.js`)
   - `/api/dmx/scenario/event` - обработка событий игры
   - `/api/dmx/scenario/player-state` - управление состоянием игрока
   - `/api/dmx/scenario/game-phase` - управление фазой игры
   - И другие...

## 🚀 Как использовать в коде игры

### Шаг 1: Импорт

```javascript
const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
const { GameEvent } = require('./server/dmx/dmx-lighting-states');

const lightingEngine = getDMXScenarioEngine();
```

### Шаг 2: Инициализация при создании комнаты

```javascript
lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_STARTED, {
  playerCount: 14
});
```

### Шаг 3: Обработка событий игры

```javascript
// Игрок подключился
lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_JOINED, {
  playerIndex: 0  // 0-based индекс игрока
});

// Игрок нажал "готов"
lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_READY, {
  playerIndex: 0
});

// Все игроки готовы
lightingEngine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY);

// Вопрос начался
lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_STARTED, {
  questionId: 'q1'
});

// Игрок ответил
lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
  playerIndex: 0,
  isCorrect: true  // или false
});

// Показать правильный ответ
lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, {
  results: [
    { playerIndex: 0, isCorrect: true },
    { playerIndex: 1, isCorrect: false },
    // ...
  ]
});

// Показать результаты
lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_RESULTS, {
  scoreboard: [
    { playerIndex: 0, score: 100, isLeader: true },
    { playerIndex: 1, score: 50, isLeader: false },
    // ...
  ]
});

// Игра завершена
lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_FINISHED, {
  finalResults: [
    { playerIndex: 0, score: 500, rank: 1 },
    { playerIndex: 1, score: 400, rank: 2 },
    // ...
  ]
});
```

## 📋 Таблица состояний игроков

| Состояние | Когда используется | DMX команда (по умолчанию) |
|-----------|-------------------|----------------------------|
| `OFF` | Игрок не подключен | (выключено) |
| `WAITING_FOR_READY` | Игрок подключен, но не готов | `player-waiting` |
| `READY` | Игрок нажал "готов" | `player-ready` |
| `ANSWERING` | Игрок думает/отвечает | `player-answering` |
| `COUNTDOWN` | Обратный отсчёт перед вопросом | `player-countdown` |
| `LOCKED_IN` | Ответ зафиксирован | `player-locked-in` |
| `CORRECT` | Правильный ответ | `player-correct` |
| `INCORRECT` | Неправильный ответ | `player-incorrect` |
| `WINNER` | Победитель | `player-winner` |

## 📋 Таблица фаз игры

| Фаза | Описание | Дефолтное состояние игроков |
|------|----------|----------------------------|
| `LOBBY` | До начала игры | `OFF` |
| `WAITING_ALL_READY` | Ожидание готовности | `WAITING_FOR_READY` |
| `QUESTION_COUNTDOWN` | Обратный отсчёт | `COUNTDOWN` |
| `QUESTION_ACTIVE` | Вопрос активен | `ANSWERING` |
| `SHOW_CORRECT_ANSWER` | Показ правильного ответа | (индивидуально) |
| `SHOW_RESULTS` | Показ результатов | (индивидуально) |
| `GAME_FINISHED` | Игра завершена | `OFF` |

## ⚙️ Настройка DMX команд для состояний

Перед использованием необходимо создать DMX команды через веб-интерфейс `/dmx-config.html`:

1. Откройте `/dmx-config.html`
2. Настройте прожектор LM70S с нужными каналами
3. Сохраните команду с именем:
   - `player-waiting` - тёплый цвет для ожидания готовности
   - `player-ready` - белый яркий для готовности
   - `player-answering` - мягкое освещение для размышления
   - `player-correct` - зелёный для правильного ответа
   - `player-incorrect` - красный для неправильного ответа
   - `player-winner` - золотой/радужный для победителя

Имена команд можно настроить в файле `server/dmx/dmx-state-mapping.json`.

## 📚 Дополнительная документация

- **Полная таблица состояний**: `docs/DMX_LIGHTING_STATES.md`
- **Примеры интеграции**: `docs/DMX_INTEGRATION_EXAMPLE.md`
- **API документация**: см. `docs/DMX_LIGHTING_STATES.md` раздел "HTTP API"

## 🔍 Отладка

```javascript
// Получить статистику комнаты
const stats = lightingEngine.getRoomStats(roomCode);
console.log(stats);

// Получить состояние игрока
const state = lightingEngine.getPlayerState(roomCode, 0);
console.log('Игрок 0:', state);

// Получить фазу игры
const phase = lightingEngine.getGamePhase(roomCode);
console.log('Фаза:', phase);
```

## 🎯 Ключевые принципы

1. **Используйте события, а не прямые вызовы** - это обеспечивает согласованность
2. **Всегда передавайте `playerIndex`** (0-based), а не `playerId`
3. **Очищайте комнату** при завершении: `lightingEngine.cleanupRoom(roomCode)`
4. **Создавайте DMX команды заранее** через веб-интерфейс

## 📞 Поддержка

Если что-то не работает:
1. Проверьте, что DMX команды созданы и названы правильно
2. Проверьте файл `server/dmx/dmx-state-mapping.json`
3. Используйте отладочные методы для проверки состояний
4. Проверьте логи сервера на наличие ошибок

