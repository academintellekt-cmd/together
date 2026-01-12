const PORT = process.env.PORT || 3000;

// Масштабирование и лимиты
const MAX_ROOMS = 50; // Максимум активных комнат одновременно
const MAX_TOTAL_PLAYERS = 500; // Максимум игроков на сервере
const MAX_LEADERBOARD_ENTRIES = 1000; // Максимум записей рейтинга в памяти
const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 минут неактивности для очистки комнаты
const LEADERBOARD_QUEUE_BATCH_SIZE = 10; // Размер батча для записи в Google Sheets
const LEADERBOARD_QUEUE_INTERVAL = 30 * 1000; // Интервал записи батча (30 секунд)

module.exports = {
  PORT,
  MAX_ROOMS,
  MAX_TOTAL_PLAYERS,
  MAX_LEADERBOARD_ENTRIES,
  ROOM_TIMEOUT,
  LEADERBOARD_QUEUE_BATCH_SIZE,
  LEADERBOARD_QUEUE_INTERVAL
};

