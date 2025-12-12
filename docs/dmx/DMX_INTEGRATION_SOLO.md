# Интеграция DMX освещения в одиночную игру

Функция `triggerDMXEvent` уже добавлена в файл `public/solo.html` после строки 482.

## Необходимо добавить следующие вызовы DMX событий:

### 1. В функции `startGame()` после строки `startTime = Date.now();`:
```javascript
// DMX: игра началась
triggerDMXEvent('GAME_STARTED', { playerCount: 1 });
```

### 2. В функции `showQuestion()` после строки `questionStartTime = Date.now();`:
```javascript
// DMX: вопрос показан
triggerDMXEvent('QUESTION_STARTED', { questionId: question.id || currentQuestion });
```

### 3. В функции `selectAnswer()` после строки `const isCorrect = answerIndex === question.correct;`:
```javascript
// DMX: игрок ответил
triggerDMXEvent('PLAYER_ANSWERED', { playerIndex: 0, isCorrect: isCorrect });
```

### 4. В функции `selectAnswer()` после закрывающей скобки блока if/else (перед комментарием "Переход к следующему вопросу"):
```javascript
// DMX: показать правильный ответ и результаты
setTimeout(() => {
    triggerDMXEvent('SHOW_CORRECT_ANSWER', {
        results: [{ playerIndex: 0, isCorrect: isCorrect }]
    });
    setTimeout(() => {
        triggerDMXEvent('SHOW_RESULTS', {
            scoreboard: [{ playerIndex: 0, score: score, isLeader: true }]
        });
    }, 500);
}, 100);
```

### 5. В функции `endGame()` после строки `console.error('Ошибка сохранения результата:', error);`:
```javascript
// DMX: игра завершена
triggerDMXEvent('GAME_FINISHED', {
    finalResults: [{ playerIndex: 0, score: score, rank: 1 }]
});
```

Все изменения добавлены аналогично многопользовательской игре, но адаптированы для одиночной игры (playerIndex всегда 0, playerCount = 1).

