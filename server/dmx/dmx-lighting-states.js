/**
 * Определения состояний освещения для игроков и фаз игры
 * 
 * Эта система разделяет логику игры от DMX команд:
 * - Состояния игроков описывают ЧТО должно быть показано
 * - DMX команды описывают КАК это технически реализовано
 */

/**
 * Состояния освещения для одного игрока
 */
const PlayerLightingState = {
  // Базовые состояния
  OFF: 'OFF',                          // Прожектор выключен
  WAITING_FOR_READY: 'WAITING_FOR_READY', // Ожидание готовности (тёплый цвет)
  READY: 'READY',                      // Игрок готов (белый яркий)
  
  // Состояния во время вопроса
  ANSWERING: 'ANSWERING',              // Игрок думает/отвечает (мягкое освещение)
  LOCKED_IN: 'LOCKED_IN',             // Ответ зафиксирован, ждём результата
  
  // Результаты ответа
  CORRECT: 'CORRECT',                  // Правильный ответ (зелёный)
  INCORRECT: 'INCORRECT',              // Неправильный ответ (красный)
  
  // Специальные состояния
  WINNER: 'WINNER',                    // Победитель вопроса/игры (золотой/радужный)
  LEADER: 'LEADER',                    // Лидер турнира (особый эффект)
  
  // Состояния обратного отсчёта
  COUNTDOWN: 'COUNTDOWN',              // Обратный отсчёт перед вопросом
};

/**
 * Фазы игры (глобальные состояния)
 */
const GamePhase = {
  LOBBY: 'LOBBY',                      // Лобби - до начала игры
  WAITING_ALL_READY: 'WAITING_ALL_READY', // Ожидание готовности всех игроков
  QUESTION_COUNTDOWN: 'QUESTION_COUNTDOWN', // Обратный отсчёт перед вопросом
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',   // Вопрос активен, принимаются ответы
  SHOW_CORRECT_ANSWER: 'SHOW_CORRECT_ANSWER', // Показ правильного ответа
  SHOW_RESULTS: 'SHOW_RESULTS',        // Показ результатов вопроса
  GAME_FINISHED: 'GAME_FINISHED',      // Игра завершена
};

/**
 * Приоритеты состояний (чем выше число, тем важнее)
 * Используется для разрешения конфликтов, когда несколько состояний хотят управлять одним игроком
 */
const StatePriority = {
  [PlayerLightingState.OFF]: 0,
  [PlayerLightingState.WAITING_FOR_READY]: 1,
  [PlayerLightingState.READY]: 2,
  [PlayerLightingState.ANSWERING]: 3,
  [PlayerLightingState.COUNTDOWN]: 4,
  [PlayerLightingState.LOCKED_IN]: 5,
  [PlayerLightingState.INCORRECT]: 6,
  [PlayerLightingState.CORRECT]: 7,
  [PlayerLightingState.LEADER]: 8,
  [PlayerLightingState.WINNER]: 9,
};

/**
 * События игры, которые могут триггерить изменения состояний
 */
const GameEvent = {
  // События подключения и старта
  GAME_STARTED: 'GAME_STARTED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  
  // События готовности
  PLAYER_READY: 'PLAYER_READY',
  ALL_PLAYERS_READY: 'ALL_PLAYERS_READY',
  
  // События вопроса
  QUESTION_COUNTDOWN_START: 'QUESTION_COUNTDOWN_START',
  QUESTION_COUNTDOWN_TICK: 'QUESTION_COUNTDOWN_TICK',
  QUESTION_STARTED: 'QUESTION_STARTED',
  
  // События ответов
  PLAYER_ANSWERED: 'PLAYER_ANSWERED',
  SHOW_CORRECT_ANSWER: 'SHOW_CORRECT_ANSWER',
  
  // События результатов
  SHOW_RESULTS: 'SHOW_RESULTS',
  GAME_FINISHED: 'GAME_FINISHED',
  
  // Технические события
  TIMER_TICK: 'TIMER_TICK',
};

/**
 * Получить приоритет состояния
 */
function getStatePriority(state) {
  return StatePriority[state] || 0;
}

/**
 * Сравнить два состояния по приоритету
 * Возвращает true, если state1 важнее state2
 */
function isStateMoreImportant(state1, state2) {
  return getStatePriority(state1) > getStatePriority(state2);
}

module.exports = {
  PlayerLightingState,
  GamePhase,
  GameEvent,
  StatePriority,
  getStatePriority,
  isStateMoreImportant,
};





