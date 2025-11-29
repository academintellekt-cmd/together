const fs = require('fs');
const path = require('path');

/**
 * Загружает конфигурацию квиза из JSON файла
 */
function loadQuizConfig(quizId) {
  const configPath = path.join(__dirname, '../../data/quizzes', `${quizId}.json`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Конфигурация квиза ${quizId} не найдена: ${configPath}`);
  }
  
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);
  
  // Валидация обязательных полей
  const requiredFields = ['id', 'name', 'questionsFile'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`В конфигурации квиза ${quizId} отсутствует обязательное поле: ${field}`);
    }
  }
  
  return config;
}

/**
 * Загружает все доступные квизы из папки data/quizzes
 */
function loadAllQuizConfigs() {
  const quizzesDir = path.join(__dirname, '../../data/quizzes');
  const quizzes = {};
  
  if (!fs.existsSync(quizzesDir)) {
    console.warn(`Папка с квизами не найдена: ${quizzesDir}`);
    return quizzes;
  }
  
  const files = fs.readdirSync(quizzesDir);
  
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'template.json') {
      try {
        const quizId = file.replace('.json', '');
        const config = loadQuizConfig(quizId);
        quizzes[quizId] = config;
        console.log(`✅ Загружен квиз: ${config.name} (${quizId})`);
      } catch (error) {
        console.error(`❌ Ошибка загрузки квиза ${file}:`, error.message);
      }
    }
  }
  
  return quizzes;
}

/**
 * Парсит файл с вопросами
 * Поддерживает два формата:
 * 1. Новый формат:
 *    Q: Вопрос?
 *    A: Вариант 1
 *    A*: Правильный ответ
 *    A: Вариант 3
 *    A: Вариант 4
 *    T: 15
 * 
 * 2. Старый формат (для совместимости):
 *    Вопрос?
 *    * Вариант 1
 *    * Вариант 2 ★
 *    * Вариант 3
 *    * Вариант 4
 */
function parseQuestionsFile(content) {
  const questions = [];
  const lines = content.split('\n');
  
  let currentQuestion = null;
  let currentOptions = [];
  let currentCorrect = -1;
  let currentTime = 15;
  let currentImage = null;
  let currentSound = null;
  let isNewFormat = false;
  
  // Определяем формат по первой строке с вопросом
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].trim();
    if (line.startsWith('Q:')) {
      isNewFormat = true;
      break;
    } else if (line.endsWith('?') && !line.startsWith('#') && !line.toLowerCase().startsWith('вопрос ')) {
      isNewFormat = false;
      break;
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Пропускаем пустые строки и комментарии
    if (!line || line.startsWith('//') || (line.startsWith('#') && !line.startsWith('Q:'))) {
      // Если пустая строка после вопроса - сохраняем вопрос (новый формат)
      if (isNewFormat && currentQuestion && line === '' && currentOptions.length > 0) {
        if (currentCorrect === -1) {
          console.warn(`Вопрос "${currentQuestion}" не имеет правильного ответа`);
          currentCorrect = 0;
        }
        
        if (!currentImage) {
          console.warn(`Вопрос "${currentQuestion}" не имеет изображения`);
        }
        
        questions.push({
          id: questions.length + 1,
          question: currentQuestion,
          image: currentImage,
          sound: currentSound || null,
          options: currentOptions,
          correct: currentCorrect,
          time: currentTime
        });
        
        currentQuestion = null;
        currentOptions = [];
        currentCorrect = -1;
        currentTime = 15;
        currentImage = null;
        currentSound = null;
      }
      continue;
    }
    
    // НОВЫЙ ФОРМАТ
    if (isNewFormat) {
      // Вопрос
      if (line.startsWith('Q:')) {
        // Сохраняем предыдущий вопрос, если есть
        if (currentQuestion && currentOptions.length > 0) {
          if (currentCorrect === -1) {
            currentCorrect = 0;
          }
          questions.push({
            id: questions.length + 1,
            question: currentQuestion,
            image: currentImage,
            sound: currentSound || null,
            options: currentOptions,
            correct: currentCorrect,
            time: currentTime
          });
        }
        
        currentQuestion = line.substring(2).trim();
        currentOptions = [];
        currentCorrect = -1;
        currentTime = 15;
        currentImage = null;
        currentSound = null;
      }
      // Изображение
      else if (line.startsWith('I:')) {
        currentImage = line.substring(2).trim();
      }
      // Звук
      else if (line.startsWith('S:')) {
        currentSound = line.substring(2).trim();
      }
      // Правильный ответ
      else if (line.startsWith('A*:')) {
        const option = line.substring(3).trim();
        currentOptions.push(option);
        currentCorrect = currentOptions.length - 1;
      }
      // Обычный вариант ответа
      else if (line.startsWith('A:')) {
        const option = line.substring(2).trim();
        currentOptions.push(option);
      }
      // Время
      else if (line.startsWith('T:')) {
        const timeStr = line.substring(2).trim();
        const time = parseInt(timeStr, 10);
        if (!isNaN(time) && time > 0) {
          currentTime = time;
        }
      }
    }
    // СТАРЫЙ ФОРМАТ (совместимость)
    else {
      // Пропускаем строки "Вопрос N"
      if (line.toLowerCase().startsWith('вопрос ')) {
        continue;
      }
      
      // Если строка заканчивается на "?", это вопрос
      if (line.endsWith('?')) {
        // Сохраняем предыдущий вопрос, если есть
        if (currentQuestion && currentOptions.length > 0) {
          if (currentCorrect === -1) {
            currentCorrect = 0;
          }
          questions.push({
            id: questions.length + 1,
            question: currentQuestion,
            options: currentOptions,
            correct: currentCorrect,
            time: currentTime
          });
        }
        
        currentQuestion = line;
        currentOptions = [];
        currentCorrect = -1;
        currentTime = 20; // По умолчанию 20 секунд для старого формата
      }
      // Если строка начинается с "+", "*", "-", это вариант ответа
      else if (line.startsWith('+') || line.startsWith('*') || line.startsWith('-')) {
        if (currentQuestion) {
          let answer = line.substring(1).trim();
          
          // Проверяем, есть ли звездочка в конце (правильный ответ)
          const isCorrect = answer.endsWith('★') || answer.endsWith('*');
          
          // Удаляем звездочку из конца ответа
          answer = answer.replace(/[★*]$/, '').trim();
          
          // Удаляем префикс "* " если есть
          answer = answer.replace(/^\*\s*/, '').trim();
          
          currentOptions.push(answer);
          
          // Если это правильный ответ и еще не установлен
          if (isCorrect && currentCorrect === -1) {
            currentCorrect = currentOptions.length - 1;
          }
        }
      }
      // Иначе это может быть вариант ответа без префикса (проверяем на звездочку)
      else if (currentQuestion && currentOptions.length < 4) {
        let answer = line.trim();
        const isCorrect = answer.endsWith('★') || answer.endsWith('*');
        
        // Удаляем звездочку из ответа
        answer = answer.replace(/[★*]$/, '').trim();
        answer = answer.replace(/^\*\s*/, '').trim();
        
        currentOptions.push(answer);
        
        // Если это правильный ответ и еще не установлен
        if (isCorrect && currentCorrect === -1) {
          currentCorrect = currentOptions.length - 1;
        }
      }
    }
  }
  
  // Сохраняем последний вопрос
  if (currentQuestion && currentOptions.length > 0) {
    if (currentCorrect === -1) {
      currentCorrect = 0;
    }
    questions.push({
      id: questions.length + 1,
      question: currentQuestion,
      image: currentImage,
      sound: currentSound || null,
      options: currentOptions,
      correct: currentCorrect,
      time: currentTime
    });
  }
  
  return questions;
}

/**
 * Загружает вопросы для квиза из файла
 */
function loadQuestions(quizId, questionsFileName) {
  const questionsPath = path.join(__dirname, '../../data/questions', questionsFileName);
  
  if (!fs.existsSync(questionsPath)) {
    console.warn(`Файл с вопросами не найден: ${questionsPath}`);
    return [];
  }
  
  const content = fs.readFileSync(questionsPath, 'utf8');
  const questions = parseQuestionsFile(content);
  
  console.log(`📚 Загружено ${questions.length} вопросов для квиза ${quizId}`);
  
  return questions;
}

/**
 * Загружает полную информацию о квизе (конфигурация + вопросы)
 */
function loadQuiz(quizId) {
  const config = loadQuizConfig(quizId);
  const questions = loadQuestions(quizId, config.questionsFile);
  
  // Обновляем totalQuestions в конфигурации
  config.gameSettings.totalQuestions = questions.length;
  
  return {
    ...config,
    questions: questions
  };
}

/**
 * Валидация медиафайлов для квиза
 */
function validateQuizMedia(quiz) {
  const errors = [];
  const warnings = [];
  const questionsDir = quiz.questionsDir || quiz.id;
  const mediaQuestionsPath = path.join(__dirname, '../../data/media/questions', questionsDir);
  
  quiz.questions.forEach((q, index) => {
    if (!q.image) {
      errors.push(`Вопрос ${index + 1}: отсутствует изображение`);
    } else {
      const imagePath = path.join(mediaQuestionsPath, q.image);
      if (!fs.existsSync(imagePath)) {
        errors.push(`Вопрос ${index + 1}: файл изображения не найден: ${q.image}`);
      }
    }
    
    if (q.sound) {
      const soundPath = path.join(mediaQuestionsPath, q.sound);
      if (!fs.existsSync(soundPath)) {
        warnings.push(`Вопрос ${index + 1}: файл звука не найден: ${q.sound}`);
      }
    }
  });
  
  if (quiz.backgroundMusic) {
    const musicPath = path.join(__dirname, '../../data/media/quizzes', quiz.id, quiz.backgroundMusic);
    if (!fs.existsSync(musicPath)) {
      warnings.push(`Фоновая музыка не найдена: ${quiz.backgroundMusic}`);
    }
  }
  
  return { errors, warnings };
}

/**
 * Загружает все квизы с их вопросами
 */
function loadAllQuizzes() {
  const configs = loadAllQuizConfigs();
  const quizzes = {};
  
  for (const [quizId, config] of Object.entries(configs)) {
    try {
      const questions = loadQuestions(quizId, config.questionsFile);
      const quiz = {
        ...config,
        questions: questions,
        gameSettings: {
          ...config.gameSettings,
          totalQuestions: questions.length
        }
      };
      
      // Валидация медиафайлов
      const { errors, warnings } = validateQuizMedia(quiz);
      if (errors.length > 0) {
        console.error(`❌ Ошибки валидации квиза ${quizId}:`);
        errors.forEach(err => console.error(`   - ${err}`));
      }
      if (warnings.length > 0) {
        console.warn(`⚠️ Предупреждения для квиза ${quizId}:`);
        warnings.forEach(warn => console.warn(`   - ${warn}`));
      }
      
      quizzes[quizId] = quiz;
    } catch (error) {
      console.error(`❌ Ошибка загрузки вопросов для квиза ${quizId}:`, error.message);
    }
  }
  
  return quizzes;
}

module.exports = {
  loadQuizConfig,
  loadAllQuizConfigs,
  loadQuestions,
  loadQuiz,
  loadAllQuizzes,
  parseQuestionsFile
};

