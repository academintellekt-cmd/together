#!/usr/bin/env node
/**
 * Упрощенный скрипт для непрерывного тестирования DMX команд
 */

const http = require('http');

const ESP32_IP = '192.168.0.71';
const ESP32_PORT = 80;

function sendCommand(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ESP32_IP,
      port: ESP32_PORT,
      path: path,
      method: method,
      timeout: 1000
    };

    if (data) {
      options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      };
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode });
      });
    });

    req.on('error', () => {
      resolve({ status: 0 }); // Игнорируем ошибки для непрерывной работы
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0 });
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runContinuousTest() {
  console.log('🎨 Непрерывное тестирование DMX команд...');
  console.log(`📍 ESP32: http://${ESP32_IP}:${ESP32_PORT}`);
  console.log('💡 Нажмите Ctrl+C для остановки\n');

  const colors = [
    { name: 'КРАСНЫЙ', r: 255, g: 0, b: 0 },
    { name: 'ЗЕЛЕНЫЙ', r: 0, g: 255, b: 0 },
    { name: 'СИНИЙ', r: 0, g: 0, b: 255 },
    { name: 'БЕЛЫЙ', r: 255, g: 255, b: 255 },
    { name: 'ЖЕЛТЫЙ', r: 255, g: 255, b: 0 },
    { name: 'ФИОЛЕТОВЫЙ', r: 255, g: 0, b: 255 },
    { name: 'ГОЛУБОЙ', r: 0, g: 255, b: 255 }
  ];

  let cycle = 0;

  while (true) {
    cycle++;
    console.log(`\n🔄 Цикл ${cycle}:`);

    for (const color of colors) {
      console.log(`   🎨 Установка ${color.name}...`);
      
      // Устанавливаем цвет для игрока 1 (каналы 1, 2, 3)
      await sendCommand(`/api/channel?channel=1&value=${color.r}`, 'POST');
      await sendCommand(`/api/channel?channel=2&value=${color.g}`, 'POST');
      await sendCommand(`/api/channel?channel=3&value=${color.b}`, 'POST');
      
      await sleep(1000); // Пауза 1 секунда между цветами
    }

    // Выключаем все
    console.log('   🔌 Выключение...');
    await sendCommand('/api/all', 'POST', JSON.stringify({ action: 'off' }));
    await sleep(1000);
  }
}

// Обработка Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Остановка тестирования...');
  process.exit(0);
});

runContinuousTest().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});





