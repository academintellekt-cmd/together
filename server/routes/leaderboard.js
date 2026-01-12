const express = require('express');

/**
 * Конструктор роутера рейтинга с внедрением зависимостей.
 */
function createLeaderboardRouter({
  leaderboardService,
  normalizeQuizId,
  writeToGoogleSheets,
  processLeaderboardQueue,
  loadLeaderboardFromGoogleSheets,
  initializeLeaderboard,
  LEADERBOARD_QUEUE_BATCH_SIZE,
  MAX_LEADERBOARD_ENTRIES
}) {
  const router = express.Router();
  const leaderboard = leaderboardService.getLeaderboard();
  const leaderboardQueue = leaderboardService.getQueue();

  // Сохранение результата
  router.post('/', (req, res) => {
    const { playerName, quizId, score, correctAnswers, totalQuestions, timeSpent } = req.body;

    if (!playerName || !quizId || score === undefined) {
      return res.status(400).json({ error: 'Недостаточно данных' });
    }

    const originalQuizId = quizId;
    const normalizedQuizId = normalizeQuizId(quizId) || quizId;

    console.log(`💾 Сохранение результата: игрок="${playerName.trim()}", оригинальный quizId="${originalQuizId}", нормализованный quizId="${normalizedQuizId}", очки=${score}`);

    const result = {
      id: Date.now().toString(),
      playerName: playerName.trim(),
      quizId: normalizedQuizId,
      score: score,
      correctAnswers: correctAnswers || 0,
      totalQuestions: totalQuestions || 0,
      timeSpent: timeSpent || 0,
      date: new Date().toISOString(),
      timestamp: Date.now()
    };

    leaderboardService.addResult(result);

    if (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
      leaderboard.splice(MAX_LEADERBOARD_ENTRIES);
      console.log(`📊 Рейтинг ограничен до ${MAX_LEADERBOARD_ENTRIES} записей в памяти`);
    }

    writeToGoogleSheets(result).then(success => {
      if (!success) {
        leaderboardService.enqueueResult(result);
        console.log('⚠️ Запись в Google Sheets не удалась, добавлено в очередь для повторной попытки');
      }
    }).catch(error => {
      leaderboardService.enqueueResult(result);
      console.error('❌ Ошибка записи в Google Sheets, добавлено в очередь для повторной попытки:', error.message);
    });

    if (leaderboardQueue.length >= LEADERBOARD_QUEUE_BATCH_SIZE) {
      processLeaderboardQueue();
    }

    res.json({ success: true, result: result });
  });

  // Получение рейтинга
  router.get('/', (req, res) => {
    const { quizId } = req.query;

    let results = leaderboard;

    if (quizId) {
      const normalizedQuizId = normalizeQuizId(quizId) || quizId;
      console.log(`📊 Запрос лидерборда: оригинальный quizId="${quizId}", нормализованный="${normalizedQuizId}", всего записей в памяти=${leaderboard.length}`);

      results = leaderboard.filter(r => {
        if (!r.quizId) return false;

        const rNormalized = normalizeQuizId(r.quizId);
        const matches = rNormalized === normalizedQuizId;

        if (leaderboard.indexOf(r) < 5) {
          console.log(`  📋 Запись: игрок="${r.playerName}", quizId="${r.quizId}" -> нормализованный="${rNormalized}", совпадает=${matches}`);
        }

        return matches;
      });

      console.log(`📊 После фильтрации найдено ${results.length} записей для quizId="${normalizedQuizId}"`);
    }

    const playerBestScores = {};
    results.forEach(result => {
      if (!result.playerName?.trim()) return;

      const key = result.playerName.trim().toLowerCase().replace(/\s+/g, ' ');
      const current = playerBestScores[key];

      if (key.includes('роман')) {
        console.log(`  🔍 Найден результат для "роман": очки=${result.score}, quizId="${result.quizId}", timestamp=${result.timestamp}, текущий лучший=${current ? current.score : 'нет'}`);
      }

      if (!current || result.score > current.score ||
          (result.score === current.score && result.timestamp > current.timestamp)) {
        playerBestScores[key] = result;
        if (key.includes('роман')) {
          console.log(`  ✅ Обновлен лучший результат для "роман": очки=${result.score}`);
        }
      }
    });

    const sortedResults = Object.values(playerBestScores).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    });

    const topResults = sortedResults.slice(0, 50);

    const romanInTop = topResults.find(r => r.playerName?.toLowerCase().includes('роман'));
    if (romanInTop) {
      console.log(`✅ "роман" в топ-50: позиция=${topResults.indexOf(romanInTop) + 1}, очки=${romanInTop.score}`);
    } else {
      console.log(`⚠️ "роман" НЕ попал в топ-50. Всего результатов после фильтрации: ${results.length}, после группировки: ${sortedResults.length}`);
      const allRoman = sortedResults.filter(r => r.playerName?.toLowerCase().includes('роман'));
      if (allRoman.length > 0) {
        console.log(`  📋 Найдено результатов "роман" во всех данных: ${allRoman.length}`, allRoman.map(r => ({ score: r.score, quizId: r.quizId })));
      }
    }

    res.json(topResults);
  });

  // Принудительная перезагрузка рейтинга
  router.get('/reload', async (req, res) => {
    console.log('🔄 Принудительная перезагрузка рейтинга...');

    try {
      const currentQueue = [...leaderboardQueue];

      if (currentQueue.length > 0) {
        const batch = [...currentQueue];
        leaderboardQueue.splice(0, currentQueue.length);
        const promises = batch.map(result => writeToGoogleSheets(result));
        await Promise.allSettled(promises);
      }

      const savedLeaderboard = await loadLeaderboardFromGoogleSheets();

      leaderboard.length = 0;

      if (savedLeaderboard.length > 0) {
        savedLeaderboard.forEach(entry => {
          const normalizedQuizId = normalizeQuizId(entry.quizId) || entry.quizId;
          leaderboard.push({ ...entry, quizId: normalizedQuizId });
        });

        leaderboard.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.timestamp - b.timestamp;
        });

        if (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
          leaderboard.splice(MAX_LEADERBOARD_ENTRIES);
        }
      }

      res.json({
        success: true,
        message: `Рейтинг перезагружен: ${leaderboard.length} записей`,
        leaderboard: leaderboard
      });
    } catch (error) {
      console.error('❌ Ошибка перезагрузки рейтинга:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка перезагрузки рейтинга: ' + error.message
      });
    }
  });

  return router;
}

module.exports = {
  createLeaderboardRouter
};

