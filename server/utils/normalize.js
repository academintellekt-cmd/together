function normalizeQuizId(quizIdOrName) {
  if (!quizIdOrName) return null;

  const knownIds = ['akadem'];
  if (knownIds.includes(quizIdOrName)) {
    return quizIdOrName;
  }

  const lower = quizIdOrName.toLowerCase().trim();

  if (lower.includes('академ') || lower.includes('академгородок') ||
      (lower.includes('история') && lower.includes('легенды'))) {
    return 'akadem';
  }

  // Попытка совпадения по имени/титулу ранее загруженных квизов
  if (typeof quizzes !== 'undefined' && quizzes) {
    for (const [id, quiz] of Object.entries(quizzes)) {
      const quizName = (quiz.name || '').toLowerCase().trim();
      const quizTitle = (quiz.display?.title || '').toLowerCase().trim();

      if (quizName === lower || quizTitle === lower ||
          lower.includes(quizName) || quizName.includes(lower) ||
          lower.includes(quizTitle) || quizTitle.includes(lower)) {
        return id;
      }
    }
  }

  return quizIdOrName;
}

module.exports = {
  normalizeQuizId
};

