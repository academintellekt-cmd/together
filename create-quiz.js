#!/usr/bin/env node

/**
 * Скрипт для автоматического создания нового квиза
 * Использование: node create-quiz.js <quiz-id> [quiz-name]
 * 
 * Пример: node create-quiz.js "corporate-2024-01" "Корпоратив 2024"
 */

const fs = require('fs');
const path = require('path');

// Получаем аргументы командной строки
const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('❌ Ошибка: Укажите ID квиза');
    console.log('Использование: node create-quiz.js <quiz-id> [quiz-name]');
    console.log('Пример: node create-quiz.js "corporate-2024-01" "Корпоратив 2024"');
    process.exit(1);
}

const quizId = args[0];
const quizName = args[1] || quizId;

// Проверяем формат ID (только латиница, цифры, дефисы и подчеркивания)
if (!/^[a-z0-9_-]+$/i.test(quizId)) {
    console.error('❌ Ошибка: ID квиза может содержать только латинские буквы, цифры, дефисы и подчеркивания');
    process.exit(1);
}

console.log(`📝 Создание нового квиза: ${quizName} (ID: ${quizId})`);

// Пути к файлам
const quizzesDir = path.join(__dirname, 'data', 'quizzes');
const questionsDir = path.join(__dirname, 'data', 'questions');
const templateQuizPath = path.join(quizzesDir, 'template.json');
const templateQuestionPath = path.join(questionsDir, 'template.txt');
const newQuizPath = path.join(quizzesDir, `${quizId}.json`);
const newQuestionPath = path.join(questionsDir, `${quizId}.txt`);

// Проверяем существование шаблонов
if (!fs.existsSync(templateQuizPath)) {
    console.error(`❌ Ошибка: Шаблон квиза не найден: ${templateQuizPath}`);
    process.exit(1);
}

if (!fs.existsSync(templateQuestionPath)) {
    console.error(`❌ Ошибка: Шаблон вопросов не найден: ${templateQuestionPath}`);
    process.exit(1);
}

// Проверяем, не существует ли уже квиз с таким ID
if (fs.existsSync(newQuizPath)) {
    console.error(`❌ Ошибка: Квиз с ID "${quizId}" уже существует`);
    process.exit(1);
}

if (fs.existsSync(newQuestionPath)) {
    console.error(`❌ Ошибка: Файл вопросов "${quizId}.txt" уже существует`);
    process.exit(1);
}

try {
    // Читаем шаблон квиза
    const templateQuiz = JSON.parse(fs.readFileSync(templateQuizPath, 'utf8'));
    
    // Обновляем данные квиза
    templateQuiz.id = quizId;
    templateQuiz.name = quizName;
    templateQuiz.description = `Описание квиза "${quizName}"`;
    templateQuiz.questionsFile = `${quizId}.txt`;
    
    // Сохраняем новый файл квиза
    fs.writeFileSync(newQuizPath, JSON.stringify(templateQuiz, null, 2), 'utf8');
    console.log(`✅ Создан файл квиза: ${newQuizPath}`);
    
    // Читаем шаблон вопросов
    const templateQuestions = fs.readFileSync(templateQuestionPath, 'utf8');
    
    // Сохраняем новый файл вопросов
    fs.writeFileSync(newQuestionPath, templateQuestions, 'utf8');
    console.log(`✅ Создан файл вопросов: ${newQuestionPath}`);
    
    console.log('\n🎉 Квиз успешно создан!');
    console.log('\n📋 Следующие шаги:');
    console.log(`1. Отредактируйте файл: ${newQuizPath}`);
    console.log(`   - Укажите правильное название, описание, цвета');
    console.log(`   - Настройте параметры игры (questionsPerGame, defaultTime, maxPlayers)`);
    console.log(`2. Добавьте вопросы в файл: ${newQuestionPath}`);
    console.log(`   - Формат: Q: вопрос, A: варианты ответов, A*: правильный ответ, T: время`);
    console.log(`3. Перезапустите сервер для применения изменений`);
    console.log('\n💡 Примечание:');
    console.log('   - Джойстик и DMX автоматически доступны для всех квизов');
    console.log('   - Настройка джойстика: /joystick-test/joystick.html');
    console.log('   - Пульт DMX: /dmx-control.html');
    
} catch (error) {
    console.error(`❌ Ошибка при создании квиза: ${error.message}`);
    process.exit(1);
}

