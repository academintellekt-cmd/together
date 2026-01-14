(() => {
  /**
   * Патчит socket.emit, перенаправляя старые события в единый протокол
   * room:join / game:action. Возвращает тот же socket.
   */
  function attachUnifiedSocket(socket) {
    if (!socket || typeof socket.emit !== 'function') return socket;
    if (socket.__unifiedPatched) return socket;

    const originalEmit = socket.emit.bind(socket);

    const forward = (eventName, payload) => {
      originalEmit(eventName, payload);
    };

    socket.emit = function patchedEmit(event, ...args) {
      try {
        switch (event) {
          // --- Quiz (старый протокол) ---
          case 'host-join': {
            const roomCode = args[0];
            forward('room:join', { roomCode, role: 'host', gameId: 'quiz' });
            return socket;
          }
          case 'player-join': {
            const data = args[0] || {};
            forward('room:join', {
              roomCode: data.roomCode,
              role: 'player',
              gameId: 'quiz',
              name: data.playerName,
              password: data.password
            });
            return socket;
          }
          case 'start-game': {
            const roomCode = args[0];
            forward('game:action', { roomCode, type: 'start', payload: {} });
            return socket;
          }
          case 'answer': {
            const { roomCode, answerIndex } = args[0] || {};
            forward('game:action', { roomCode, type: 'answer', payload: { answerIndex } });
            return socket;
          }
          case 'player-ready':
          case 'player-ready-next': {
            const roomCode = typeof args[0] === 'string' ? args[0] : args[0]?.roomCode;
            forward('game:action', { roomCode, type: 'ready', payload: {} });
            return socket;
          }
          case 'next-question': {
            const roomCode = args[0];
            forward('game:action', { roomCode, type: 'next-question', payload: {} });
            return socket;
          }

          default:
            return originalEmit(event, ...args);
        }
      } catch (err) {
        console.error('Unified socket adapter error:', err);
        return originalEmit(event, ...args);
      }
    };

    socket.__unifiedPatched = true;
    socket.__originalEmit = originalEmit;
    return socket;
  }

  window.attachUnifiedSocket = attachUnifiedSocket;
})();
