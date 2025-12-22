/**
 * Скрипт для создания дефолтных DMX команд для всех состояний освещения
 */

const { getDMXCommands } = require('./dmx-commands');

// Цвета из конфига
const colors = {
  waiting: [255, 255, 100],    // Жёлтый/тёплый
  ready: [255, 255, 255],      // Белый
  answering: [200, 200, 200],   // Серый/мягкий
  countdown: [150, 150, 255],   // Голубой
  lockedIn: [100, 100, 255],     // Синий
  correct: [0, 255, 0],         // Зелёный
  incorrect: [255, 0, 0],       // Красный
  winner: [255, 215, 0],        // Золотой
  leader: [255, 200, 0],        // Оранжево-золотой
};

/**
 * Создать команду для состояния игрока
 * 
 * Структура каналов LM70S (9 каналов):
 * 1. Угол X (0-255) - обычно 128 (центр)
 * 2. Угол Y (0-255) - обычно 128 (центр)
 * 3. Режим работы (0-8=ВЫКЛ, 9-135=Затемнение, 136-240=Стробоскоп, 241-255=ВКЛ)
 * 4. R (0-255)
 * 5. G (0-255)
 * 6. B (0-255)
 * 7. Белый (0-255)
 * 8. Скорость (0-255)
 * 9. Сброс (150-200)
 */
function createPlayerStateCommand(name, description, rgb, mode = 241, white = 0, speed = 0) {
  const [r, g, b] = rgb;
  
  return {
    name: name,
    description: description,
    lm70sNumber: 1, // Базовый номер, команда будет применяться к любому прожектору
    startAddress: 1,
    channels: {
      1: 128,  // Угол X - центр
      2: 128,  // Угол Y - центр
      3: mode, // Режим работы (241 = ВКЛ)
      4: r,    // R
      5: g,    // G
      6: b,    // B
      7: white, // Белый
      8: speed, // Скорость
      9: 0,    // Сброс (0 = не сбрасывать)
    },
    tags: [name.replace('player-', ''), 'state', 'lighting'],
  };
}

/**
 * Создать команду с эффектом пульсации
 */
function createPulseCommand(name, description, rgb) {
  const [r, g, b] = rgb;
  
  return {
    name: name,
    description: description,
    lm70sNumber: 1,
    startAddress: 1,
    channels: {
      1: 128,  // Угол X
      2: 128,  // Угол Y
      3: 136,  // Режим: Стробоскоп (для пульсации)
      4: r,    // R
      5: g,    // G
      6: b,    // B
      7: 0,    // Белый
      8: 128,  // Скорость пульсации (средняя)
      9: 0,    // Сброс
    },
    tags: [name.replace('player-', ''), 'state', 'pulse', 'lighting'],
  };
}

/**
 * Создать все дефолтные команды
 */
function createAllDefaultCommands() {
  const commands = getDMXCommands();
  
  // Список команд для создания
  const commandsToCreate = [
    // Базовые состояния
    createPlayerStateCommand(
      'player-waiting',
      'Игрок: ожидание готовности (тёплый жёлтый цвет)',
      colors.waiting,
      241, // ВКЛ
      50   // Немного белого для мягкости
    ),
    
    createPlayerStateCommand(
      'player-ready',
      'Игрок: готов (белый яркий)',
      colors.ready,
      241, // ВКЛ
      255  // Максимальный белый
    ),
    
    createPlayerStateCommand(
      'player-answering',
      'Игрок: думает/отвечает (мягкое серое освещение)',
      colors.answering,
      241, // ВКЛ
      100  // Мягкий белый
    ),
    
    createPlayerStateCommand(
      'player-countdown',
      'Игрок: обратный отсчёт перед вопросом (голубой)',
      colors.countdown,
      241, // ВКЛ
      0
    ),
    
    createPlayerStateCommand(
      'player-locked-in',
      'Игрок: ответ зафиксирован (синий)',
      colors.lockedIn,
      241, // ВКЛ
      0
    ),
    
    // Результаты ответов (с пульсацией для эффектности)
    createPulseCommand(
      'player-correct',
      'Игрок: правильный ответ (зелёный с пульсацией)',
      colors.correct
    ),
    
    createPulseCommand(
      'player-incorrect',
      'Игрок: неправильный ответ (красный с пульсацией)',
      colors.incorrect
    ),
    
    // Специальные состояния
    createPulseCommand(
      'player-winner',
      'Игрок: победитель (золотой с пульсацией)',
      colors.winner
    ),
    
    createPulseCommand(
      'player-leader',
      'Игрок: лидер турнира (оранжево-золотой с пульсацией)',
      colors.leader
    ),
  ];
  
  console.log('📝 Создание дефолтных DMX команд для состояний освещения...\n');
  
  let created = 0;
  let skipped = 0;
  
  commandsToCreate.forEach(cmdData => {
    try {
      // Проверяем, существует ли уже команда с таким именем
      const existing = commands.getAllCommands().find(cmd => 
        cmd.name.toLowerCase() === cmdData.name.toLowerCase()
      );
      
      if (existing) {
        console.log(`⏭️  Команда "${cmdData.name}" уже существует, пропускаем`);
        skipped++;
      } else {
        const command = commands.createCommand(cmdData);
        console.log(`✅ Создана команда: "${command.name}"`);
        console.log(`   Описание: ${cmdData.description}`);
        console.log(`   Цвет: RGB(${cmdData.channels[4]}, ${cmdData.channels[5]}, ${cmdData.channels[6]})`);
        console.log(`   Режим: ${cmdData.channels[3] === 241 ? 'ВКЛ' : cmdData.channels[3] === 136 ? 'Стробоскоп' : 'Затемнение'}`);
        console.log('');
        created++;
      }
    } catch (error) {
      console.error(`❌ Ошибка создания команды "${cmdData.name}":`, error.message);
    }
  });
  
  console.log(`\n📊 Итого: создано ${created}, пропущено ${skipped}`);
  
  if (created > 0) {
    console.log('\n✅ Дефолтные команды успешно созданы!');
    console.log('💡 Теперь можно использовать систему состояний освещения в игре.');
  } else {
    console.log('\n💡 Все команды уже существуют, ничего не создано.');
  }
}

// Запуск
if (require.main === module) {
  try {
    createAllDefaultCommands();
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

module.exports = {
  createAllDefaultCommands,
};






