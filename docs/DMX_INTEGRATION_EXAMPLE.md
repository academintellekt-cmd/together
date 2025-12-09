# Пример интеграции системы состояний освещения в игру

## 📝 Быстрый старт

### 1. Импорт модулей

```javascript
const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
const { GameEvent, PlayerLightingState, GamePhase } = require('./server/dmx/dmx-lighting-states');

const lightingEngine = getDMXScenarioEngine();
```

### 2. Инициализация при создании комнаты

```javascript
// Когда создаётся новая комната
function createRoom(roomCode, playerCount = 14) {
  // ... создание комнаты ...
  
  // Инициализируем систему освещения
  lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_STARTED, {
    playerCount: playerCount
  });
}
```

### 3. Обработка подключения игрока

```javascript
// Когда игрок подключается к комнате
function onPlayerJoin(roomCode, playerId) {
  const room = rooms.get(roomCode);
  const playerIndex = room.players.findIndex(p => p.id === playerId);
  
  if (playerIndex !== -1) {
    // Уведомляем систему освещения
    lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_JOINED, {
      playerIndex: playerIndex
    });
  }
}
```

### 4. Обработка готовности игроков

```javascript
// Когда игрок нажимает "готов"
function onPlayerReady(roomCode, playerId) {
  const room = rooms.get(roomCode);
  const playerIndex = room.players.findIndex(p => p.id === playerId);
  
  if (playerIndex !== -1) {
    // Обновляем состояние игрока в комнате
    room.players[playerIndex].ready = true;
    
    // Уведомляем систему освещения
    lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_READY, {
      playerIndex: playerIndex
    });
    
    // Проверяем, все ли игроки готовы
    const allReady = room.players.every(p => p.ready);
    if (allReady) {
      lightingEngine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY, {
        readyPlayers: room.players.map((p, i) => i)
      });
    }
  }
}
```

### 5. Обратный отсчёт перед вопросом

```javascript
// Когда начинается обратный отсчёт перед вопросом
function startQuestionCountdown(roomCode, duration = 5) {
  lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_COUNTDOWN_START, {
    duration: duration
  });
  
  // Запускаем таймер обратного отсчёта
  let secondsLeft = duration;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    
    // Отправляем тик обратного отсчёта
    lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_COUNTDOWN_TICK, {
      secondsLeft: secondsLeft
    });
    
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      // Переходим к показу вопроса
      showQuestion(roomCode);
    }
  }, 1000);
}
```

### 6. Показ вопроса

```javascript
// Когда вопрос показывается на экране
function showQuestion(roomCode, questionId) {
  const room = rooms.get(roomCode);
  
  // Сбрасываем готовность игроков для следующего вопроса
  room.players.forEach(p => p.ready = false);
  
  // Уведомляем систему освещения
  lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_STARTED, {
    questionId: questionId
  });
}
```

### 7. Обработка ответа игрока

```javascript
// Когда игрок выбирает ответ
function onPlayerAnswer(roomCode, playerId, answerIndex) {
  const room = rooms.get(roomCode);
  const playerIndex = room.players.findIndex(p => p.id === playerId);
  const question = room.currentQuestion;
  
  if (playerIndex === -1 || !question) return;
  
  // Сохраняем ответ
  room.players[playerIndex].answer = answerIndex;
  room.players[playerIndex].answered = true;
  
  // Если результат известен сразу (например, в режиме "показывать сразу")
  const isCorrect = answerIndex === question.correctAnswer;
  
  lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
    playerIndex: playerIndex,
    isCorrect: isCorrect  // Если не указать, игрок получит состояние LOCKED_IN
  });
  
  // Если все ответили, показываем результаты
  const allAnswered = room.players.every(p => p.answered);
  if (allAnswered) {
    showCorrectAnswer(roomCode);
  }
}
```

### 8. Показ правильного ответа

```javascript
// Когда показывается правильный ответ
function showCorrectAnswer(roomCode) {
  const room = rooms.get(roomCode);
  const question = room.currentQuestion;
  
  // Формируем результаты для каждого игрока
  const results = room.players.map((player, index) => ({
    playerIndex: index,
    isCorrect: player.answer === question.correctAnswer
  }));
  
  // Уведомляем систему освещения
  lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, {
    results: results
  });
  
  // Через несколько секунд показываем результаты вопроса
  setTimeout(() => {
    showQuestionResults(roomCode);
  }, 3000);
}
```

### 9. Показ результатов вопроса

```javascript
// Когда показываются результаты вопроса
function showQuestionResults(roomCode) {
  const room = rooms.get(roomCode);
  
  // Обновляем счёт игроков
  room.players.forEach((player, index) => {
    if (player.answer === room.currentQuestion.correctAnswer) {
      player.score += 10; // или другая логика начисления очков
    }
  });
  
  // Сортируем по очкам для определения лидера
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const maxScore = sortedPlayers[0].score;
  
  // Формируем scoreboard
  const scoreboard = room.players.map((player, index) => ({
    playerIndex: index,
    score: player.score,
    isLeader: player.score === maxScore
  }));
  
  // Уведомляем систему освещения
  lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_RESULTS, {
    scoreboard: scoreboard
  });
  
  // Через несколько секунд переходим к следующему вопросу или завершаем игру
  setTimeout(() => {
    if (room.currentQuestionIndex < room.questions.length - 1) {
      // Переходим к следующему вопросу
      room.currentQuestionIndex++;
      startQuestionCountdown(roomCode);
    } else {
      // Игра завершена
      finishGame(roomCode);
    }
  }, 5000);
}
```

### 10. Завершение игры

```javascript
// Когда игра завершается
function finishGame(roomCode) {
  const room = rooms.get(roomCode);
  
  // Сортируем игроков по финальному счёту
  const finalResults = room.players
    .map((player, index) => ({
      playerIndex: index,
      score: player.score,
      rank: 0  // будет установлен ниже
    }))
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      ...player,
      rank: index + 1
    }));
  
  // Уведомляем систему освещения
  lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_FINISHED, {
    finalResults: finalResults
  });
  
  // Очищаем комнату через некоторое время
  setTimeout(() => {
    lightingEngine.cleanupRoom(roomCode);
    rooms.delete(roomCode);
  }, 10000);
}
```

## 🔄 Полный пример интеграции в server.js

```javascript
// В начале файла server.js
const { getDMXScenarioEngine } = require('./server/dmx/dmx-scenario-engine');
const { GameEvent } = require('./server/dmx/dmx-lighting-states');

const lightingEngine = getDMXScenarioEngine();

// При создании комнаты
io.on('connection', (socket) => {
  socket.on('create-room', (data) => {
    const roomCode = generateRoomCode();
    rooms.set(roomCode, {
      players: [],
      questions: [],
      currentQuestionIndex: 0
    });
    
    // Инициализируем освещение
    lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_STARTED, {
      playerCount: 14
    });
    
    socket.join(roomCode);
    socket.emit('room-created', { roomCode });
  });
  
  socket.on('join-room', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (room) {
      const player = {
        id: socket.id,
        name: playerName,
        ready: false,
        answered: false,
        score: 0
      };
      
      room.players.push(player);
      const playerIndex = room.players.length - 1;
      
      socket.join(roomCode);
      socket.emit('joined-room', { roomCode, playerIndex });
      
      // Уведомляем систему освещения
      lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_JOINED, {
        playerIndex: playerIndex
      });
    }
  });
  
  socket.on('player-ready', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    
    if (room) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players[playerIndex].ready = true;
        
        // Уведомляем систему освещения
        lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_READY, {
          playerIndex: playerIndex
        });
        
        // Проверяем готовность всех
        const allReady = room.players.every(p => p.ready);
        if (allReady && room.players.length >= 2) {
          lightingEngine.handleGameEvent(roomCode, GameEvent.ALL_PLAYERS_READY);
          startQuestionCountdown(roomCode);
        }
      }
    }
  });
  
  socket.on('player-answer', (data) => {
    const { roomCode, answerIndex } = data;
    const room = rooms.get(roomCode);
    
    if (room) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      const question = room.questions[room.currentQuestionIndex];
      
      if (playerIndex !== -1 && question) {
        room.players[playerIndex].answer = answerIndex;
        room.players[playerIndex].answered = true;
        
        const isCorrect = answerIndex === question.correctAnswer;
        
        // Уведомляем систему освещения
        lightingEngine.handleGameEvent(roomCode, GameEvent.PLAYER_ANSWERED, {
          playerIndex: playerIndex,
          isCorrect: isCorrect
        });
        
        // Проверяем, все ли ответили
        const allAnswered = room.players.every(p => p.answered);
        if (allAnswered) {
          showCorrectAnswer(roomCode);
        }
      }
    }
  });
});

function startQuestionCountdown(roomCode) {
  lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_COUNTDOWN_START);
  
  let secondsLeft = 5;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_COUNTDOWN_TICK, {
      secondsLeft: secondsLeft
    });
    
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      showQuestion(roomCode);
    }
  }, 1000);
}

function showQuestion(roomCode) {
  const room = rooms.get(roomCode);
  room.players.forEach(p => p.ready = false);
  
  lightingEngine.handleGameEvent(roomCode, GameEvent.QUESTION_STARTED, {
    questionId: room.questions[room.currentQuestionIndex].id
  });
  
  io.to(roomCode).emit('question-shown', {
    question: room.questions[room.currentQuestionIndex]
  });
}

function showCorrectAnswer(roomCode) {
  const room = rooms.get(roomCode);
  const question = room.questions[room.currentQuestionIndex];
  
  const results = room.players.map((player, index) => ({
    playerIndex: index,
    isCorrect: player.answer === question.correctAnswer
  }));
  
  lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_CORRECT_ANSWER, {
    results: results
  });
  
  setTimeout(() => {
    showQuestionResults(roomCode);
  }, 3000);
}

function showQuestionResults(roomCode) {
  const room = rooms.get(roomCode);
  const question = room.questions[room.currentQuestionIndex];
  
  room.players.forEach((player) => {
    if (player.answer === question.correctAnswer) {
      player.score += 10;
    }
  });
  
  const maxScore = Math.max(...room.players.map(p => p.score));
  const scoreboard = room.players.map((player, index) => ({
    playerIndex: index,
    score: player.score,
    isLeader: player.score === maxScore
  }));
  
  lightingEngine.handleGameEvent(roomCode, GameEvent.SHOW_RESULTS, {
    scoreboard: scoreboard
  });
  
  setTimeout(() => {
    if (room.currentQuestionIndex < room.questions.length - 1) {
      room.currentQuestionIndex++;
      startQuestionCountdown(roomCode);
    } else {
      finishGame(roomCode);
    }
  }, 5000);
}

function finishGame(roomCode) {
  const room = rooms.get(roomCode);
  
  const finalResults = room.players
    .map((player, index) => ({
      playerIndex: index,
      score: player.score,
      rank: 0
    }))
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      ...player,
      rank: index + 1
    }));
  
  lightingEngine.handleGameEvent(roomCode, GameEvent.GAME_FINISHED, {
    finalResults: finalResults
  });
  
  setTimeout(() => {
    lightingEngine.cleanupRoom(roomCode);
    rooms.delete(roomCode);
  }, 10000);
}
```

## 🎯 Ключевые моменты

1. **Всегда передавайте `playerIndex`** (0-based индекс игрока в массиве комнаты), а не `playerId`
2. **Используйте события вместо прямого управления состояниями** - это обеспечивает согласованность
3. **Очищайте комнату** при завершении игры через `cleanupRoom()`
4. **Проверяйте существование комнаты** перед вызовом событий
5. **Используйте правильные структуры данных** для событий (см. документацию по событиям)

## 🐛 Отладка

Для отладки можно использовать:

```javascript
// Получить статистику комнаты
const stats = lightingEngine.getRoomStats(roomCode);
console.log('Статистика освещения:', stats);

// Получить текущее состояние игрока
const state = lightingEngine.getPlayerState(roomCode, 0);
console.log('Состояние игрока 0:', state);

// Получить текущую фазу игры
const phase = lightingEngine.getGamePhase(roomCode);
console.log('Фаза игры:', phase);
```

