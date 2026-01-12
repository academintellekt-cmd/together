// Seed-based перемешивание для стабильности в сессии
function seededShuffle(array, seed) {
  const shuffled = [...array];
  let rng = seed;

  // Простой LCG (Linear Congruential Generator)
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (rng * 9301 + 49297) % 233280;
    const j = Math.floor((rng / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// Перемешивание вопросов с seed
function shuffleQuestions(questions, seed = Date.now()) {
  return seededShuffle(questions, seed);
}

// Перемешивание вариантов ответов с seed
function shuffleOptions(options, correctIndex, seed = Date.now()) {
  const shuffled = seededShuffle([...options], seed);
  const correctAnswer = options[correctIndex];
  const newCorrectIndex = shuffled.indexOf(correctAnswer);
  return { options: shuffled, correctIndex: newCorrectIndex };
}

module.exports = {
  seededShuffle,
  shuffleQuestions,
  shuffleOptions
};

