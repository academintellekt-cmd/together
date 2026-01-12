function wireSocketHandlers(io, socket, deps) {
  const {
    roomsService,
    findPlayersForStation,
    dmxScenarioEngine,
    localModeAvailable,
    localModeManager,
    updateAnswerStatus,
    updateReadyStatus,
    quizzes,
    showQuestion,
    showResults,
    endGame,
    emitPlayerList
  } = deps;

  const rooms = roomsService.getRooms();
  const players = roomsService.getPlayers();

  console.log('Новое подключение:', socket.id);
  console.log('localModeAvailable:', localModeAvailable, 'localModeManager:', !!localModeManager);

  // Хост подключается к комнате
  socket.on('host-join', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    if (!room.host) {
      room.host = socket.id;
      console.log(`🎮 Основной хост установлен для комнаты ${roomCode}: ${socket.id}`);
    } else {
      console.log(`📡 Дополнительный хост подключен к комнате ${roomCode}: ${socket.id} (основной хост: ${room.host})`);
    }
    room.lastActivity = Date.now();
    socket.join(roomCode);
    socket.emit('host-connected', { roomCode, players: room.players });
    // Дополнительно шлём полный список игроков, чтобы фронт не пропустил
    if (typeof emitPlayerList === 'function') {
      emitPlayerList(roomCode);
    } else {
      io.to(roomCode).emit('player-list', room.players);
      io.to(roomCode).emit('player-list-updated', { players: room.players });
    }
    console.log(`Хост подключен к комнате ${roomCode}, состояние игры: ${room.gameState}`);

    if (room.gameState === 'question' && room.currentQuestion < room.questions.length) {
      const question = room.questions[room.currentQuestion];
      const questionData = {
        question: question.question,
        options: question.options,
        questionNumber: room.currentQuestion + 1,
        totalQuestions: room.questions.length,
        time: question.time,
        quizId: room.quizId
      };
      socket.emit('question', questionData);
      console.log(`📤 Отправлен текущий вопрос ${questionData.questionNumber} хосту при подключении`);

      updateAnswerStatus(roomCode);

      if (room.startTime) {
        const elapsed = Date.now() - room.startTime;
        const remaining = Math.max(0, Math.floor((question.time * 1000 - elapsed) / 1000));
        if (remaining > 0 && remaining < question.time) {
          questionData.time = remaining;
        }
      }
    } else if (room.gameState === 'results' && room.currentQuestion < room.questions.length) {
      const question = room.questions[room.currentQuestion];
      const results = Array.from(room.answers.values());
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      socket.emit('results', {
        correctAnswer: question.correct,
        correctAnswerText: question.options[question.correct],
        results: results,
        players: sortedPlayers
      });
      console.log(`📤 Отправлены текущие результаты хосту при подключении`);

      setTimeout(() => {
        updateReadyStatus(roomCode);
      }, 100);
    } else if (room.gameState === 'playing') {
      socket.emit('game-started');
      console.log(`📤 Отправлено событие game-started хосту при подключении`);
    } else if (room.gameState === 'finished') {
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      socket.emit('game-finished', { results: sortedPlayers });
      console.log(`📤 Отправлены финальные результаты хосту при подключении`);
    }
  });

  // Игрок подключается к комнате
  socket.on('player-join', ({ roomCode, playerName, password }) => {
    console.log(`📥 Получено событие player-join: roomCode=${roomCode}, playerName=${playerName}`);

    const normalizedRoomCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const normalizedPlayerName = playerName ? playerName.trim() : '';

    if (!normalizedRoomCode || !normalizedPlayerName) {
      socket.emit('error', { message: 'Неверные данные: заполните все поля' });
      return;
    }

    const room = rooms.get(normalizedRoomCode);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    console.log(`✅ Игрок ${normalizedPlayerName} подключается к комнате ${normalizedRoomCode} (пароль не требуется), состояние игры: ${room.gameState}`);

    const existingPlayer = room.players.find(p => {
      const playerNameNormalized = (p.name || '').trim().toLowerCase();
      const inputNameNormalized = normalizedPlayerName.toLowerCase();
      return playerNameNormalized === inputNameNormalized;
    });

    let player;
    let isReconnection = false;

    if (existingPlayer) {
      const isDisconnected = existingPlayer.disconnected === true;
      if (!isDisconnected) {
        socket.emit('error', { message: 'Игрок с таким именем уже подключен к этой комнате' });
        return;
      }

      isReconnection = true;
      if (players.has(existingPlayer.id)) {
        players.delete(existingPlayer.id);
      }

      player = existingPlayer;
      player.id = socket.id;
      player.disconnected = false;
      player.disconnectedAt = null;

      socket.join(normalizedRoomCode);
      players.set(socket.id, { roomCode: normalizedRoomCode, player });

      room.lastActivity = Date.now();
      socket.emit('player-reconnected', { playerId: socket.id, roomCode: normalizedRoomCode, score: player.score });
      io.to(normalizedRoomCode).emit('player-reconnected', { playerId: socket.id, name: player.name });
      updateReadyStatus(normalizedRoomCode);
      updateAnswerStatus(normalizedRoomCode);
      return;
    }

    if (room.players.length >= (quizzes[room.quizId]?.gameSettings?.maxPlayers || 14)) {
      socket.emit('error', { message: 'Комната заполнена' });
      return;
    }

    player = {
      id: socket.id,
      name: normalizedPlayerName,
      score: 0,
      answers: [],
      ready: false,
      disconnected: false,
      createdAt: Date.now()
    };

    room.players.push(player);
    players.set(socket.id, { roomCode: normalizedRoomCode, player });
    room.lastActivity = Date.now();

    socket.join(normalizedRoomCode);
    socket.emit('player-joined', { playerId: socket.id, roomCode: normalizedRoomCode, quizId: room.quizId });
    io.to(normalizedRoomCode).emit('player-list', room.players);
    io.to(normalizedRoomCode).emit('player-list-updated', { players: room.players });

    console.log(`Игрок ${player.name} (${socket.id}) подключился к комнате ${normalizedRoomCode}`);
  });

  // Готовность игрока
  socket.on('player-ready', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = true;
      if (room.readyPlayers && typeof room.readyPlayers.add === 'function') {
        room.readyPlayers.add(socket.id);
      }
      updateReadyStatus(roomCode);
    }
  });

  socket.on('player-not-ready', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = false;
      if (room.readyPlayers && typeof room.readyPlayers.delete === 'function') {
        room.readyPlayers.delete(socket.id);
      }
      updateReadyStatus(roomCode);
    }
  });

  // Хост переходит к следующему вопросу
  socket.on('next-question', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Только основной хост может переключать вопросы
    if (room.host && room.host !== socket.id) {
      return;
    }

    if (room.gameState !== 'results') {
      return;
    }

    const readyCount = room.readyPlayers ? room.readyPlayers.size : 0;
    const allReady = readyCount === room.players.length && room.players.length > 0;
    if (!allReady) {
      socket.emit('error', { message: 'Не все игроки готовы к следующему вопросу' });
      return;
    }

    room.currentQuestion++;
    room.lastActivity = Date.now();
    if (room.currentQuestion < room.questions.length) {
      if (typeof showQuestion === 'function') {
        showQuestion(roomCode);
      }
    } else if (typeof endGame === 'function') {
      endGame(roomCode);
    }
  });

  // Хост запускает игру
  socket.on('start-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();
    room.gameState = 'playing';
    io.to(roomCode).emit('game-started');

    // Сразу показываем первый вопрос, если передана функция
    if (typeof showQuestion === 'function') {
      showQuestion(roomCode);
    }

    console.log(`🎬 Игра запущена в комнате ${roomCode}`);
  });

  // Хост отправляет вопрос
  socket.on('send-question', ({ roomCode, questionIndex }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();
    if (questionIndex < 0 || questionIndex >= room.questions.length) return;

    // Если есть расширенная функция, используем её
    if (typeof showQuestion === 'function') {
      room.currentQuestion = questionIndex;
      showQuestion(roomCode);
      return;
    }

    room.currentQuestion = questionIndex;
    room.gameState = 'question';
    room.startTime = Date.now();

    const question = room.questions[questionIndex];
    const questionData = {
      question: question.question,
      options: question.options,
      questionNumber: questionIndex + 1,
      totalQuestions: room.questions.length,
      time: question.time,
      quizId: room.quizId
    };

    io.to(roomCode).emit('question', questionData);
    console.log(`📤 Вопрос ${questionIndex + 1}/${room.questions.length} отправлен в комнату ${roomCode}`);
  });

  // Игрок отвечает на вопрос
  socket.on('answer', ({ roomCode, answerIndex, timeSpent }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const question = room.questions[room.currentQuestion];
    if (!question) return;

    const isCorrect = answerIndex === question.correct;
    const scoreDelta = isCorrect ? Math.max(0, Math.round(question.time - (timeSpent || 0))) : 0;
    player.score += scoreDelta;

    room.answers.set(socket.id, {
      playerId: socket.id,
      playerName: player.name,
      answer: answerIndex,
      isCorrect,
      score: scoreDelta,
      time: timeSpent || 0,
      submittedAt: Date.now()
    });

    updateAnswerStatus(roomCode);

    console.log(`✅ Ответ игрока ${player.name} (${socket.id}) в комнате ${roomCode}: ${isCorrect ? 'верно' : 'неверно'}, +${scoreDelta} очков`);

    // Если все активные игроки ответили — сразу показываем результаты
    const activePlayers = room.players.filter(p => !p.disconnected);
    const answeredCount = new Set(Array.from(room.answers.values()).map(a => a.playerName)).size;
    if (answeredCount === activePlayers.length && activePlayers.length > 0) {
      if (typeof showResults === 'function') {
        showResults(roomCode);
      }
    }
  });

  // Хост показывает результаты вопроса
  socket.on('show-results', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();
    // Предпочитаем расширенную функцию
    if (typeof showResults === 'function') {
      showResults(roomCode);
    } else {
      room.gameState = 'results';

      const question = room.questions[room.currentQuestion];
      const results = Array.from(room.answers.values());
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);

      io.to(roomCode).emit('results', {
        correctAnswer: question.correct,
        correctAnswerText: question.options[question.correct],
        results: results,
        players: sortedPlayers
      });

      setTimeout(() => {
        updateReadyStatus(roomCode);
      }, 100);
    }

    console.log(`📊 Результаты вопроса ${room.currentQuestion + 1} отправлены в комнату ${roomCode}`);
  });

  // Хост завершает игру
  socket.on('finish-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();
    if (typeof endGame === 'function') {
      endGame(roomCode);
    } else {
      room.gameState = 'finished';

      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      io.to(roomCode).emit('game-finished', { results: sortedPlayers });

      if (dmxScenarioEngine) {
        dmxScenarioEngine.handleGameEvent(roomCode, 'gameFinished', {
          finalResults: sortedPlayers.map((p, idx) => ({
            playerIndex: idx,
            score: p.score,
            rank: idx + 1
          }))
        });
      }
    }

    console.log(`🏁 Игра завершена в комнате ${roomCode}`);
  });

  // Отметка готовности к следующему вопросу
  socket.on('player-ready-next', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.lastActivity = Date.now();
    room.readyPlayers.add(socket.id);

    updateReadyStatus(roomCode);
  });

  // Отключение
  socket.on('disconnect', () => {
    if (players.has(socket.id)) {
      const { roomCode, player } = players.get(socket.id);
      const room = rooms.get(roomCode);
      if (room) {
        player.disconnected = true;
        player.disconnectedAt = Date.now();
        room.lastActivity = Date.now();
          if (room.readyPlayers && typeof room.readyPlayers.delete === 'function') {
            room.readyPlayers.delete(socket.id);
          }
        players.delete(socket.id);
          io.to(roomCode).emit('player-disconnected', { playerId: socket.id, name: player.name });
          // Обновляем списки игроков для хоста сразу после дисконнекта
          io.to(roomCode).emit('player-list', room.players);
          io.to(roomCode).emit('player-list-updated', { players: room.players });
        console.log(`🔌 Игрок ${player.name} отключился от комнаты ${roomCode}`);
      }
    }

    console.log('Отключение:', socket.id);
  });
}

module.exports = { wireSocketHandlers };

