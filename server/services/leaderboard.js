const { normalizeQuizId } = require('../utils/normalize');
const { LEADERBOARD_QUEUE_BATCH_SIZE } = require('../config');

// В памяти: рейтинг и очередь на запись
const leaderboard = [];
const leaderboardQueue = [];

async function initializeLeaderboard(loadLeaderboardFromGoogleSheets) {
  console.log('🔄 Загрузка рейтинга из Google Sheets...');
  const savedLeaderboard = await loadLeaderboardFromGoogleSheets();

  leaderboard.length = 0;

  if (savedLeaderboard.length > 0) {
    savedLeaderboard.forEach(entry => {
      const originalQuizId = entry.quizId;
      const normalizedQuizId = normalizeQuizId(entry.quizId) || entry.quizId;

      if (entry.playerName?.toLowerCase().includes('роман')) {
        console.log(`🔍 Загрузка "роман" из Google Sheets: оригинальный quizId="${originalQuizId}", нормализованный="${normalizedQuizId}", очки=${entry.score}, дата=${entry.date}`);
      }

      leaderboard.push({ ...entry, quizId: normalizedQuizId });
    });

    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    });

    const romanEntries = leaderboard.filter(e => e.playerName?.toLowerCase().includes('роман'));
    if (romanEntries.length > 0) {
      console.log(`📊 Найдено ${romanEntries.length} записей "роман" в загруженном рейтинге:`, romanEntries.map(e => ({ quizId: e.quizId, score: e.score, date: e.date })));
    } else {
      console.log(`⚠️ Записи "роман" НЕ найдены в загруженном рейтинге`);
    }

    console.log(`✅ Рейтинг загружен: ${leaderboard.length} записей`);
  } else {
    console.log('📝 Начинаем с пустого рейтинга');
  }
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

