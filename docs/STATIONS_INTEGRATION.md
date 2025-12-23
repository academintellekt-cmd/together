# Интеграция локальных станций как игроков

## Концепция

Согласно ТЗ, локальные станции должны работать как обычные игроки, но с дополнительными возможностями:
- Имеют `stationId`
- Могут читать input с джойстика
- Могут получать admin-команды навигации/диагностики

## Текущая реализация

### ✅ Что уже работает:

1. **Подключение станции как игрока**
   ```javascript
   socket.emit('room:join', {
     roomCode: 'ABCD',
     role: 'station',  // Специальная роль
     name: 'P1',
     stationId: 1
   });
   ```

2. **Игровые действия от станции**
   ```javascript
   // Нажатие на джойстике → игровое действие
   socket.emit('game:action', {
     roomCode: 'ABCD',
     type: 'answer',
     payload: { answerIndex: buttonIndex }
   });
   ```

3. **Admin API для управления станциями**
   - `GET /api/stations/status` - статус всех станций
   - `POST /api/stations/command` - отправка команд

### ⏳ Что нужно доработать:

1. **Автоматическая регистрация в комнате**
   
   Когда хост запускает игру в локальном режиме, станции должны автоматически подключаться к комнате:

   ```javascript
   // В server-unified.js, при game:action type='start' для локального режима
   if (room.gameState.mode === 'local' && localModeManager) {
     const stations = localModeManager.getStations().filter(s => s.connected);
     
     stations.forEach(station => {
       // Отправляем команду станции подключиться к комнате
       io.to(station.socketId).emit('local-station-command', {
         command: 'join-room',
         params: {
           roomCode: room.roomCode,
           gameId: room.gameId,
           stationId: station.stationNumber,
           playerName: `P${station.stationNumber}`
         }
       });
     });
   }
   ```

2. **Обработка команды на станции**
   
   В `public/station.html` добавить обработчик:

   ```javascript
   socket.on('local-station-command', (data) => {
     if (data.command === 'join-room') {
       // Автоматически подключаемся к комнате
       socket.emit('room:join', {
         roomCode: data.params.roomCode,
         role: 'station',
         name: data.params.playerName,
         stationId: data.params.stationId,
         gameId: data.params.gameId
       });
     }
   });
   ```

3. **Маппинг джойстика на игровые действия**
   
   В `public/station.html`:

   ```javascript
   // Чтение джойстика
   function handleJoystickInput() {
     const gamepad = getGamepad();
     if (!gamepad) return;

     // Проверяем нажатия кнопок
     gamepad.buttons.forEach((button, index) => {
       if (button.pressed && !lastPressedButtons[index]) {
         // Кнопка нажата
         const action = mapButtonToAction(index);
         
         if (action && currentRoomCode) {
           socket.emit('game:action', {
             roomCode: currentRoomCode,
             type: action.type,
             payload: action.payload
           });
         }
       }
       lastPressedButtons[index] = button.pressed;
     });
   }

   function mapButtonToAction(buttonIndex) {
     // Маппинг из joystick-config.json
     const mapping = joystickConfig.buttons[buttonIndex];
     
     if (!mapping) return null;

     // Для квиза: кнопки 0-3 = варианты ответов
     if (currentGameId === 'quiz') {
       if (buttonIndex >= 0 && buttonIndex <= 3) {
         return {
           type: 'answer',
           payload: { answerIndex: buttonIndex }
         };
       }
       if (mapping.action === 'ready') {
         return {
           type: 'ready',
           payload: {}
         };
       }
     }

     return null;
   }
   ```

4. **Синхронизация состояния**
   
   Станция должна слушать `room:state` и обновлять UI:

   ```javascript
   socket.on('room:state', (state) => {
     currentRoomCode = state.roomCode;
     currentGameId = state.gameId;
     currentPhase = state.phase;

     switch (state.phase) {
       case 'lobby':
         showLobby(state);
         break;
       case 'question':
         showQuestion(state.ui.question);
         enableJoystickInput();
         break;
       case 'results':
         showResults(state.ui.results);
         disableJoystickInput();
         break;
       case 'finished':
         showFinalResults(state.ui.results);
         break;
     }
   });
   ```

## Пример полной интеграции

### 1. Хост создает комнату в локальном режиме

```javascript
// В public/local-host-control.html
fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'quiz',
    quizId: 'gnu',
    mode: 'local'  // Важно!
  })
})
.then(res => res.json())
.then(data => {
  roomCode = data.roomCode;
  
  // Хост подключается
  socket.emit('room:join', {
    roomCode,
    role: 'host'
  });
});
```

### 2. Хост запускает игру

```javascript
socket.emit('game:action', {
  roomCode,
  type: 'start',
  payload: {}
});
```

### 3. Сервер автоматически подключает станции

```javascript
// В server/games/quiz.game.js, метод _handleStart
_handleStart(room, client) {
  // ... обычная логика старта ...

  // Если локальный режим, подключаем станции
  if (room.gameState.mode === 'local') {
    this._connectLocalStations(room);
  }
}

_connectLocalStations(room) {
  const localModeManager = require('../local/local-mode').getLocalModeManager();
  if (!localModeManager) return;

  const stations = localModeManager.getStations().filter(s => s.connected);
  
  stations.forEach(station => {
    // Отправляем команду через Socket.IO
    const io = require('../../server-unified').io;
    
    io.to(station.socketId).emit('local-station-command', {
      command: 'join-room',
      params: {
        roomCode: room.roomCode,
        gameId: room.gameId,
        stationId: station.stationNumber,
        playerName: `P${station.stationNumber}`
      }
    });
  });
}
```

### 4. Станция автоматически подключается

```javascript
// В public/station.html
socket.on('local-station-command', (data) => {
  if (data.command === 'join-room') {
    currentRoomCode = data.params.roomCode;
    currentGameId = data.params.gameId;
    
    socket.emit('room:join', {
      roomCode: data.params.roomCode,
      role: 'station',
      name: data.params.playerName,
      stationId: data.params.stationId,
      gameId: data.params.gameId
    });
    
    console.log(`✅ Station ${data.params.stationId} joined room ${data.params.roomCode}`);
  }
});
```

### 5. Станция играет через джойстик

```javascript
// Игровой цикл джойстика
setInterval(() => {
  if (currentPhase === 'question' && joystickEnabled) {
    handleJoystickInput();
  }
}, 100); // Проверяем каждые 100мс

function handleJoystickInput() {
  const gamepad = getGamepad();
  if (!gamepad) return;

  gamepad.buttons.forEach((button, index) => {
    if (button.pressed && !lastPressedButtons[index]) {
      const action = mapButtonToAction(index);
      
      if (action && currentRoomCode) {
        socket.emit('game:action', {
          roomCode: currentRoomCode,
          type: action.type,
          payload: action.payload
        });
        
        // Визуальная обратная связь
        showButtonFeedback(index);
      }
    }
    lastPressedButtons[index] = button.pressed;
  });
}
```

## Преимущества новой архитектуры

1. **Единый протокол** - станции используют те же события, что и обычные игроки
2. **Упрощенная логика** - не нужен отдельный `local-*` протокол для геймплея
3. **Переиспользование кода** - игровая логика одна для всех клиентов
4. **Гибкость** - можно смешивать онлайн и локальных игроков

## Что осталось сделать

1. ✅ Базовая поддержка role='station' в Socket Router
2. ⏳ Автоматическое подключение станций при старте игры
3. ⏳ Обработка команд на станции
4. ⏳ Маппинг джойстика на game:action
5. ⏳ Обновление UI станции по room:state
6. ⏳ Тестирование полного цикла

## Следующие шаги

1. Обновить `server/games/quiz.game.js` - добавить `_connectLocalStations()`
2. Обновить `public/station.html` - добавить обработчики нового протокола
3. Протестировать с реальными станциями
4. Документировать конфигурацию джойстиков

---

**Статус:** ⏳ В процессе  
**Приоритет:** Высокий  
**Зависимости:** Требует завершения базовой унификации

