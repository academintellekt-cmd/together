const express = require('express');
const { loadQuiz } = require('../utils/quiz-loader');

function createReloadRouter(quizzes) {
  const router = express.Router();

  // Перезагрузка вопросов из файла (для обновления без перезапуска сервера)
  router.post('/questions', (req, res) => {
    const { quizId } = req.body;

    if (!quizId || !quizzes[quizId]) {
      return res.status(400).json({ error: 'Квиз не найден' });
    }

    try {
      const reloadedQuiz = loadQuiz(quizId);

      quizzes[quizId].questions = reloadedQuiz.questions;

      if (quizId === 'gnu') {
        if (quizzes['friends-quiz']) {
          quizzes['friends-quiz'].questions = reloadedQuiz.questions;
        }
        if (quizzes['gnu-multiplayer']) {
          quizzes['gnu-multiplayer'].questions = reloadedQuiz.questions;
        }
      }

      res.json({
        success: true,
        message: `Вопросы перезагружены. Загружено ${reloadedQuiz.questions.length} вопросов.`,
        questionCount: reloadedQuiz.questions.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Ошибка перезагрузки вопросов: ' + error.message
      });
    }
  });

  return router;
}

module.exports = {
  createReloadRouter
};

