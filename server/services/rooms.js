class RoomsService {
  constructor({ maxRooms, maxPlayers, roomTimeout }) {
    this.maxRooms = maxRooms;
    this.maxPlayers = maxPlayers;
    this.roomTimeout = roomTimeout;
    this.rooms = new Map();
    this.players = new Map();
  }

  getRooms() {
    return this.rooms;
  }

  getPlayers() {
    return this.players;
  }

  hasCapacity() {
    return this.rooms.size < this.maxRooms;
  }

  hasPlayerCapacity() {
    return this.players.size < this.maxPlayers;
  }

  createRoom(roomCode, quiz, options = {}) {
    if (!this.hasCapacity()) throw new Error('Достигнут лимит комнат');

    const room = {
      code: roomCode,
      quizId: quiz.id,
      quizName: quiz.name,
      questions: quiz.questions,
      currentQuestion: 0,
      players: [],
      answers: new Map(),
      readyPlayers: new Set(),
      host: null,
      password: options.password || quiz.password || null,
      gameState: 'lobby',
      startTime: null,
      questionStartTime: null,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  deleteRoom(roomCode) {
    return this.rooms.delete(roomCode);
  }

  addPlayer(roomCode, player) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Комната не найдена');
    if (!this.hasPlayerCapacity()) throw new Error('Достигнут лимит игроков');

    room.players.push(player);
    this.players.set(player.id, { roomCode, player });
    room.lastActivity = Date.now();
    return room;
  }

  removePlayer(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    this.players.delete(playerId);
    room.lastActivity = Date.now();
  }

  findPlayer(playerId) {
    return this.players.get(playerId);
  }

  markActivity(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) room.lastActivity = Date.now();
  }

  cleanupInactive(dmxScenarioEngine) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, room] of this.rooms.entries()) {
      if (room.lastActivity && now - room.lastActivity > this.roomTimeout) {
        if (dmxScenarioEngine) {
          dmxScenarioEngine.cleanupRoom(code);
        }
        this.rooms.delete(code);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

module.exports = {
  RoomsService
};

