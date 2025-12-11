#!/usr/bin/env node
/**
 * Скрипт для автоматической отправки тестовых команд на ESP32
 * Тестирует различные цвета и эффекты
 */

const http = require('http');

const ESP32_IP = '192.168.0.71';
const ESP32_PORT = 80;

// Функция для отправки команды на ESP32
function sendCommand(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ESP32_IP,
      port: ESP32_PORT,
      path: path,
      method: method,
      timeout: 2000
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
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

// Тестовые команды
async function runTests() {
  console.log('🎨 Тестирование DMX команд на ESP32...');
  console.log(`📍 ESP32: http://${ESP32_IP}:${ESP32_PORT}`);
  console.log('');

  try {
    // Тест 1: Проверка статуса
    console.log('1️⃣ Проверка статуса ESP32...');
    const status = await sendCommand('/api/status');
    console.log(`   ✅ ESP32 отвечает (статус: ${status.status})`);
    console.log('');

    // Тест 2: Красный цвет (каналы 1, 2, 3 = RGB для игрока 1)
    console.log('2️⃣ Установка КРАСНОГО цвета (игрок 1)...');
    await sendCommand('/api/channel?channel=1&value=255', 'POST');
    await sendCommand('/api/channel?channel=2&value=0', 'POST');
    await sendCommand('/api/channel?channel=3&value=0', 'POST');
    console.log('   ✅ Каналы 1-3 установлены: R=255, G=0, B=0 (КРАСНЫЙ)');
    await sleep(2000);

    // Тест 3: Зеленый цвет
    console.log('3️⃣ Установка ЗЕЛЕНОГО цвета...');
    await sendCommand('/api/channel?channel=1&value=0', 'POST');
    await sendCommand('/api/channel?channel=2&value=255', 'POST');
    await sendCommand('/api/channel?channel=3&value=0', 'POST');
    console.log('   ✅ Каналы 1-3 установлены: R=0, G=255, B=0 (ЗЕЛЕНЫЙ)');
    await sleep(2000);

    // Тест 4: Синий цвет
    console.log('4️⃣ Установка СИНЕГО цвета...');
    await sendCommand('/api/channel?channel=1&value=0', 'POST');
    await sendCommand('/api/channel?channel=2&value=0', 'POST');
    await sendCommand('/api/channel?channel=3&value=255', 'POST');
    console.log('   ✅ Каналы 1-3 установлены: R=0, G=0, B=255 (СИНИЙ)');
    await sleep(2000);

    // Тест 5: Белый цвет
    console.log('5️⃣ Установка БЕЛОГО цвета...');
    await sendCommand('/api/channel?channel=1&value=255', 'POST');
    await sendCommand('/api/channel?channel=2&value=255', 'POST');
    await sendCommand('/api/channel?channel=3&value=255', 'POST');
    console.log('   ✅ Каналы 1-3 установлены: R=255, G=255, B=255 (БЕЛЫЙ)');
    await sleep(2000);

    // Тест 6: Пакетное обновление (игроки 1-3)
    console.log('6️⃣ Пакетное обновление (игроки 1-3)...');
    const batchData = JSON.stringify({
      channels: {
        "1": 255, "2": 0, "3": 0,      // Игрок 1 - Красный
        "4": 0, "5": 255, "6": 0,      // Игрок 2 - Зеленый
        "7": 0, "8": 0, "9": 255       // Игрок 3 - Синий
      }
    });
    await sendCommand('/api/batch', 'POST', batchData);
    console.log('   ✅ Игрок 1: Красный, Игрок 2: Зеленый, Игрок 3: Синий');
    await sleep(3000);

    // Тест 7: Плавное изменение яркости
    console.log('7️⃣ Плавное изменение яркости (канал 1)...');
    for (let i = 0; i <= 255; i += 10) {
      await sendCommand(`/api/channel?channel=1&value=${i}`, 'POST');
      await sleep(50);
    }
    console.log('   ✅ Яркость увеличена от 0 до 255');
    await sleep(1000);

    for (let i = 255; i >= 0; i -= 10) {
      await sendCommand(`/api/channel?channel=1&value=${i}`, 'POST');
      await sleep(50);
    }
    console.log('   ✅ Яркость уменьшена от 255 до 0');
    await sleep(1000);

    // Тест 8: Радуга (цикл цветов)
    console.log('8️⃣ Эффект радуги...');
    const colors = [
      { r: 255, g: 0, b: 0 },    // Красный
      { r: 255, g: 127, b: 0 },  // Оранжевый
      { r: 255, g: 255, b: 0 },  // Желтый
      { r: 0, g: 255, b: 0 },    // Зеленый
      { r: 0, g: 0, b: 255 },    // Синий
      { r: 127, g: 0, b: 255 }   // Фиолетовый
    ];

    for (let cycle = 0; cycle < 2; cycle++) {
      for (const color of colors) {
        await sendCommand(`/api/channel?channel=1&value=${color.r}`, 'POST');
        await sendCommand(`/api/channel?channel=2&value=${color.g}`, 'POST');
        await sendCommand(`/api/channel?channel=3&value=${color.b}`, 'POST');
        await sleep(500);
      }
    }
    console.log('   ✅ Радуга завершена');

    // Тест 9: Выключение всех каналов
    console.log('9️⃣ Выключение всех каналов...');
    await sendCommand('/api/all', 'POST', JSON.stringify({ action: 'off' }));
    console.log('   ✅ Все каналы выключены');

    console.log('');
    console.log('='.repeat(50));
    console.log('✅ Все тесты завершены успешно!');
    console.log('='.repeat(50));
    console.log('');
    console.log('💡 Если вы видите изменения в Serial Monitor ESP32,');
    console.log('   значит команды доходят до ESP32!');
    console.log('');
    console.log('📊 Проверьте:');
    console.log('   1. Serial Monitor ESP32 (115200 baud) - должны быть логи');
    console.log('   2. Веб-интерфейс ESP32: http://192.168.0.71');
    console.log('   3. Если подключено DMX оборудование - должно работать');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.log('');
    console.log('💡 Проверьте:');
    console.log('   1. ESP32 включен и подключен к WiFi');
    console.log('   2. IP адрес правильный: 192.168.0.71');
    console.log('   3. ESP32 и компьютер в одной сети');
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Запуск тестов
runTests();





