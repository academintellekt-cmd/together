const https = require('https');
const http = require('http');

function createGoogleSheetsClient({ normalizeQuizId, quizzes }) {
  const WEB_APP_URL =
    process.env.GOOGLE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbwfQPlAw9LTH4V3a3mrZXpqVdOdrTqCYs67L7aPTdibiMloDTvivj-c3hpnQdafvY43zQ/exec';

  async function loadLeaderboardFromGoogleSheets() {
    try {
      console.log('🔄 Попытка загрузки рейтинга из Google Sheets...');
      console.log('📡 URL:', WEB_APP_URL + '?action=getLeaderboard');

      if (!WEB_APP_URL) {
        console.log('❌ GOOGLE_APPS_SCRIPT_URL не настроен. Пропускаем загрузку рейтинга.');
        return [];
      }

      const parsedUrl = new URL(WEB_APP_URL + '?action=getLeaderboard');
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      };

      return new Promise((resolve) => {
        const req = client.request(options, (res) => {
          let responseData = '';

          console.log('📊 Статус ответа Google Sheets:', res.statusCode);

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            console.log('📄 Ответ от Google Sheets:', responseData.substring(0, 200) + '...');

            if (res.statusCode === 302 && responseData.includes('script.googleusercontent.com')) {
              console.log('🔄 Обнаружен редирект, извлекаем URL...');
              const match = responseData.match(/HREF="([^"]+)"/);
              if (match) {
                const redirectUrl = match[1].replace(/&amp;/g, '&');
                console.log('📡 Редирект URL:', redirectUrl);

                const redirectReq = https.get(redirectUrl, (redirectRes) => {
                  let redirectData = '';
                  redirectRes.on('data', (chunk) => {
                    redirectData += chunk;
                  });
                  redirectRes.on('end', () => {
                    try {
                      const data = JSON.parse(redirectData);
                      console.log('🔍 Парсинг редиректа успешен. Success:', data.success, 'Leaderboard length:', data.leaderboard?.length);

                      if (data.success && Array.isArray(data.leaderboard)) {
                        logQuizIds(data.leaderboard, 'ДО нормализации');
                        const processedLeaderboard = data.leaderboard.map(entry => ({
                          ...entry,
                          quizId: normalizeQuizId(entry.quizId) || entry.quizId
                        }));
                        logQuizIds(processedLeaderboard, 'ПОСЛЕ нормализации');
                        if (processedLeaderboard.length > 0) {
                          console.log('📋 Первая запись (обработанная):', JSON.stringify(processedLeaderboard[0], null, 2));
                          console.log('📋 Оригинальная первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
                        }
                        resolve(processedLeaderboard);
                      } else {
                        console.log('⚠️ Рейтинг не найден в Google Sheets');
                        resolve([]);
                      }
                    } catch (e) {
                      console.log('❌ Ошибка парсинга JSON редиректа:', e.message);
                      resolve([]);
                    }
                  });
                });

                redirectReq.on('error', (error) => {
                  console.log('❌ Ошибка запроса редиректа:', error.message);
                  resolve([]);
                });

                return;
              }
            }

            try {
              const data = JSON.parse(responseData);
              console.log('🔍 Парсинг успешен. Success:', data.success, 'Leaderboard length:', data.leaderboard?.length);

              if (data.success && Array.isArray(data.leaderboard)) {
                logQuizIds(data.leaderboard, 'ДО нормализации');
                const processedLeaderboard = data.leaderboard.map(entry => ({
                  ...entry,
                  quizId: normalizeQuizId(entry.quizId) || entry.quizId
                }));
                logQuizIds(processedLeaderboard, 'ПОСЛЕ нормализации');
                if (processedLeaderboard.length > 0) {
                  console.log('📋 Первая запись (обработанная):', JSON.stringify(processedLeaderboard[0], null, 2));
                  console.log('📋 Оригинальная первая запись:', JSON.stringify(data.leaderboard[0], null, 2));
                }
                resolve(processedLeaderboard);
              } else {
                console.log('⚠️ Рейтинг не найден в Google Sheets или неверный формат ответа');
                console.log('🔍 Полный ответ:', JSON.stringify(data, null, 2));
                resolve([]);
              }
            } catch (e) {
              console.log('❌ Ошибка парсинга JSON от Google Sheets:', e.message);
              console.log('📄 Сырой ответ:', responseData);
              resolve([]);
            }
          });
        });

        req.on('error', (error) => {
          console.log('❌ Ошибка HTTP запроса к Google Sheets:', error.message);
          resolve([]);
        });

        req.setTimeout(10000, () => {
          console.log('⏰ Таймаут запроса к Google Sheets');
          req.destroy();
          resolve([]);
        });

        req.end();
      });
    } catch (error) {
      console.log('❌ Критическая ошибка при загрузке рейтинга из Google Sheets:', error.message);
      return [];
    }
  }

  async function writeToGoogleSheets(result) {
    try {
      if (!WEB_APP_URL) {
        console.log('GOOGLE_APPS_SCRIPT_URL не настроен. Пропускаем запись в Google Sheets.');
        return false;
      }

      const minutes = Math.floor(result.timeSpent / 60);
      const seconds = result.timeSpent % 60;
      const percentage = result.totalQuestions > 0
        ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
        : 0;

      const normalizedQuizId = result.quizId;
      const quizName = quizzes[normalizedQuizId]?.name || result.quizId;

      const data = {
        date: result.date,
        playerName: result.playerName,
        score: result.score,
        correctAnswers: result.correctAnswers,
        totalQuestions: result.totalQuestions,
        timeSpent: result.timeSpent,
        percentage: percentage,
        quizId: normalizedQuizId,
        quizName: quizName,
        formattedTime: `${minutes}м ${seconds}с`
      };

      if (result.playerName?.toLowerCase().includes('роман')) {
        console.log(`📝 Сохранение "роман" в Google Sheets: quizId="${normalizedQuizId}", quizName="${quizName}", очки=${result.score}`);
      }

      const parsedUrl = new URL(WEB_APP_URL);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const postData = JSON.stringify(data);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        maxRedirects: 3
      };

      return await new Promise((resolve) => {
        const req = client.request(options, (res) => {
          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            try {
              const data = JSON.parse(responseData);
              const success = data.success === true || res.statusCode === 200;
              if (success) {
                console.log(`✅ Результат записан в Google Sheets: ${result.playerName} (${result.score})`);
              } else {
                console.log('⚠️ Запись в Google Sheets завершилась без success:', responseData);
              }
              resolve(success);
            } catch (e) {
              console.log('⚠️ Не удалось распарсить ответ Google Sheets:', responseData);
              resolve(false);
            }
          });
        });

        req.on('error', (error) => {
          console.error('❌ Ошибка записи в Google Sheets:', error.message);
          resolve(false);
        });

        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('❌ Критическая ошибка записи в Google Sheets:', error.message);
      return false;
    }
  }

  function logQuizIds(leaderboardData, label) {
    const ids = [...new Set(leaderboardData.map(e => e.quizId))];
    console.log(`📊 Уникальные quizId ${label}:`, ids);
  }

  return {
    loadLeaderboardFromGoogleSheets,
    writeToGoogleSheets
  };
}

module.exports = {
  createGoogleSheetsClient
};

