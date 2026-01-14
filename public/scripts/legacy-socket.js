(() => {
  /**
   * Легаси-обертка над Socket.IO для текущего протокола server.js.
   * Возвращает объект с socket и удобными методами для отправки событий.
   */
  function createSocket(options = {}) {
    const socket = io(options.url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect_error:', err?.message || err);
    });

    socket.on('disconnect', (reason) => {
      console.warn('Socket disconnected:', reason);
    });

    // Quiz (старый протокол)
    const joinHost = (roomCode) => socket.emit('host-join', roomCode);
    const joinPlayer = (roomCode, playerName, password) =>
      socket.emit('player-join', { roomCode, playerName, password });
    const startGame = (roomCode) => socket.emit('start-game', roomCode);
    const nextQuestion = (roomCode) => socket.emit('next-question', roomCode);
    const answer = (roomCode, answerIndex) =>
      socket.emit('answer', { roomCode, answerIndex });
    const playerReady = (roomCode) => socket.emit('player-ready', { roomCode });
    const playerReadyNext = (roomCode) =>
      socket.emit('player-ready-next', roomCode);

    // CHGK (старый протокол)
    const intellectualHostJoin = (roomCode) =>
      socket.emit('intellectual-host-join', roomCode);
    const intellectualPlayerJoin = (roomCode, playerName) =>
      socket.emit('intellectual-player-join', { roomCode, playerName });
    const intellectualCommissionJoin = (roomCode) =>
      socket.emit('intellectual-commission-join', roomCode);
    const intellectualStartGame = (roomCode) =>
      socket.emit('intellectual-start-game', roomCode);
    const intellectualStartQuestion = (roomCode) =>
      socket.emit('intellectual-start-question', roomCode);
    const intellectualQuestionTimeout = (roomCode) =>
      socket.emit('intellectual-question-timeout', roomCode);
    const intellectualNextQuestion = (roomCode) =>
      socket.emit('intellectual-next-question', roomCode);
    const intellectualAnswer = (roomCode, answer) =>
      socket.emit('intellectual-answer', { roomCode, answer });
    const intellectualVerify = (roomCode, playerId, isCorrect, score) =>
      socket.emit('intellectual-verify-answer', {
        roomCode,
        playerId,
        isCorrect,
        score,
      });

    return {
      socket,
      joinHost,
      joinPlayer,
      startGame,
      nextQuestion,
      answer,
      playerReady,
    playerReadyNext,
    intellectualHostJoin,
    intellectualPlayerJoin,
    intellectualCommissionJoin,
    intellectualStartGame,
    intellectualStartQuestion,
    intellectualQuestionTimeout,
    intellectualNextQuestion,
    intellectualAnswer,
    intellectualVerify,
    };
  }

  window.LegacySocket = {
    createSocket,
  };
})();
