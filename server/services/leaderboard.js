const { normalizeQuizId } = require('../utils/normalize');
const { LEADERBOARD_QUEUE_BATCH_SIZE } = require('../config');

// В памяти: рейтинг и очередь на запись
const leaderboard = [];
const leaderboardQueue = [];

async function initializeLeaderboard(loadLeaderboardFromGoogleSheets) {
  console.log('🔄 Загрузка рейтинга из Google Sheets...');
  // Очищаем рейтинг и стартуем с нуля (вместо загрузки сохраненных результатов)
  leaderboard.length = 0;
  console.log('🧹 Рейтинг очищен при инициализации');
}

async function processLeaderboardQueue(writeToGoogleSheets, reloadFn) {
  if (leaderboardQueue.length === 0) return;

  const batch = leaderboardQueue.splice(0, LEADERBOARD_QUEUE_BATCH_SIZE);
  console.log(`📤 Запись батча из ${batch.length} записей в Google Sheets...`);

  const promises = batch.map(result => writeToGoogleSheets(result));
  const results = await Promise.allSettled(promises);

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  console.log(`✅ Записано ${successCount}/${batch.length} записей в Google Sheets`);

  if (successCount === batch.length && batch.length > 0) {
    console.log('🔄 Обновляем рейтинг из Google Sheets...');
    await reloadFn();
  }
}

function addResult(result) {
  leaderboard.push(result);
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp;
  });
}

function enqueueResult(result) {
  leaderboardQueue.push(result);
}

function getLeaderboard() {
  return leaderboard;
}

function getQueue() {
  return leaderboardQueue;
}

module.exports = {
  initializeLeaderboard,
  processLeaderboardQueue,
  addResult,
  enqueueResult,
  getLeaderboard,
  getQueue
};

