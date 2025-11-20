// Serverless функция для Vercel - получение списка квизов
const path = require('path');
const fs = require('fs');

// Функция загрузки вопросов (копия из server.js)
function loadQuestionsFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`Файл ${filePath} не найден. Вопросы будут пустыми.`);
      return [];
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const questions = [];
    let currentQuestion = null;
    let questionId = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('Вопрос')) {
        continue;
      }

      if (line.endsWith('?')) {
        if (currentQuestion && currentQuestion.options.length > 0) {
          questions.push(currentQuestion);
        }
        
        currentQuestion = {
          id: questionId++,
          question: line,
          options: [],
          correct: -1,
          time: 20
        };
      }
      else if (line.startsWith('+') || line.startsWith('*')) {
        if (currentQuestion) {
          let answer = line.substring(1).trim().replace(/[★*]$/, '').trim();
          currentQuestion.options.push(answer);
          if (currentQuestion.correct === -1) {
            currentQuestion.correct = currentQuestion.options.length - 1;
          }
        }
      }
      else if (line.startsWith('-')) {
        if (currentQuestion) {
          const answer = line.substring(1).trim().replace(/[★*]$/, '').trim();
          currentQuestion.options.push(answer);
        }
      }
      else if (line.toLowerCase().includes('time:') || line.toLowerCase().includes('время:')) {
        if (currentQuestion) {
          const timeMatch = line.match(/\d+/);
          if (timeMatch) {
            currentQuestion.time = parseInt(timeMatch[0]);
          }
        }
      }
      else if (currentQuestion && currentQuestion.options.length < 4) {
        let answer = line.trim();
        const isCorrect = answer.endsWith('★') || answer.endsWith('*');
        answer = answer.replace(/[★*]$/, '').trim();
        
        currentQuestion.options.push(answer);
        
        if (isCorrect && currentQuestion.correct === -1) {
          currentQuestion.correct = currentQuestion.options.length - 1;
        }
      }
    }

    if (currentQuestion && currentQuestion.options.length > 0) {
      questions.push(currentQuestion);
    }

    // Перемешиваем варианты ответов
    questions.forEach(question => {
      if (question.options.length > 0 && question.correct >= 0) {
        const correctAnswer = question.options[question.correct];
        const shuffledOptions = question.options.sort(() => Math.random() - 0.5);
        const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);
        question.options = shuffledOptions;
        question.correct = newCorrectIndex;
      }
    });

    const shuffled = questions.sort(() => Math.random() - 0.5);
    shuffled.forEach((q, index) => {
      q.id = index + 1;
    });

    return shuffled;
  } catch (error) {
    console.error(`Ошибка при загрузке вопросов из файла ${filePath}:`, error);
    return [];
  }
}

// Загрузка вопросов (для Vercel пути могут отличаться)
let friendsQuizQuestions = [];
const possiblePaths = [
  path.join(process.cwd(), 'Quiz', 'GNU.txt'),
  path.join(process.cwd(), 'questions.txt'),
  path.join(__dirname, '..', 'Quiz', 'GNU.txt'),
  path.join(__dirname, '..', 'questions.txt'),
  '/var/task/Quiz/GNU.txt',
  '/var/task/questions.txt'
];

let questionsFilePath = null;
for (const filePath of possiblePaths) {
  try {
    if (fs.existsSync(filePath)) {
      questionsFilePath = filePath;
      console.log('Найден файл вопросов:', filePath);
      break;
    }
  } catch (e) {
    // Продолжаем поиск
  }
}

if (questionsFilePath) {
  friendsQuizQuestions = loadQuestionsFromFile(questionsFilePath);
  console.log(`Загружено ${friendsQuizQuestions.length} вопросов`);
} else {
  console.warn('Файл вопросов не найден. Используются пустые вопросы.');
}

// Структура квизов
const quizzes = {
  'general-knowledge': {
    id: 'general-knowledge',
    name: 'Общие знания',
    description: 'Проверьте свои знания в разных областях',
    icon: '🧠',
    questions: [
      {
        id: 1,
        question: "Какая планета самая большая в Солнечной системе?",
        options: ["Земля", "Юпитер", "Сатурн", "Марс"],
        correct: 1,
        time: 15
      },
      {
        id: 2,
        question: "Сколько континентов на Земле?",
        options: ["5", "6", "7", "8"],
        correct: 2,
        time: 10
      },
      {
        id: 3,
        question: "Какая столица Франции?",
        options: ["Лондон", "Берлин", "Париж", "Мадрид"],
        correct: 2,
        time: 10
      },
      {
        id: 4,
        question: "Кто написал 'Войну и мир'?",
        options: ["Достоевский", "Толстой", "Чехов", "Тургенев"],
        correct: 1,
        time: 15
      },
      {
        id: 5,
        question: "Какая самая высокая гора в мире?",
        options: ["Килиманджаро", "Эверест", "К2", "Альпы"],
        correct: 1,
        time: 15
      }
    ]
  },
  'friends-quiz': {
    id: 'friends-quiz',
    name: 'Чемпионат ГНУ по целям своих братишек',
    description: 'Девушки тоже братишки',
    icon: '👥',
    soloMode: true,
    questions: friendsQuizQuestions
  }
};

module.exports = async (req, res) => {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    console.log('API /api/quizzes called, method:', req.method);
    console.log('Available quizzes:', Object.keys(quizzes));
    console.log('Friends quiz questions count:', friendsQuizQuestions.length);

    const quizzesList = Object.values(quizzes).map(quiz => {
    const avgTime = quiz.questions.length > 0
      ? Math.round(quiz.questions.reduce((sum, q) => sum + q.time, 0) / quiz.questions.length)
      : 0;
    
    let questionCount = quiz.questions.length;
    let questionInfo = `${questionCount} вопросов`;
    
    if (quiz.id === 'friends-quiz' && questionCount > 15) {
      questionInfo = `15 из ${questionCount} вопросов`;
      questionCount = 15;
    }
    
    return {
      id: quiz.id,
      name: quiz.name,
      description: quiz.description,
      icon: quiz.icon,
      questionCount: questionCount,
      questionInfo: questionInfo,
      avgTime: avgTime,
      soloMode: quiz.soloMode || false,
      totalQuestionsInBase: quiz.questions.length
    };
    });

    console.log('Returning quizzes list:', quizzesList.length, 'items');
    res.json(quizzesList);
  } catch (error) {
    console.error('Error in /api/quizzes:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

