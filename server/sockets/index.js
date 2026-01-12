const { wireSocketHandlers } = require('./main');

function initSockets(io, deps) {
  io.on('connection', (socket) => {
    wireSocketHandlers(io, socket, deps);
  });
}

module.exports = { initSockets };

