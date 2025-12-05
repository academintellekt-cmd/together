#!/usr/bin/env node
/**
 * Скрипт для проверки подключения ESP32 к серверу
 * Использование: node test-esp32-connection.js [IP_ESP32]
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Читаем конфигурацию
let esp32IP = process.argv[2];
let config = null;

try {
  const configPath = path.join(__dirname, 'server/dmx/dmx-config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (!esp32IP && config.interface.type === 'esp32') {
    esp32IP = config.interface.host;
  }
} catch (error) {
  console.error('❌ Ошибка чтения конфигурации:', error.message);
}

if (!esp32IP) {
  console.log('📋 Использование: node test-esp32-connection.js [IP_ESP32]');
  console.log('   Или укажите IP в server/dmx/dmx-config.json');
  process.exit(1);
}

const esp32Url = `http://${esp32IP}:${config?.interface?.port || 80}`;

console.log('🔍 Проверка подключения к ESP32...');
console.log(`📍 URL: ${esp32Url}`);
console.log('');

// Тест 1: Проверка статуса
async function testStatus() {
  try {
    console.log('1️⃣ Проверка статуса ESP32...');
    const response = await axios.get(`${esp32Url}/api/status`, { timeout: 3000 });
    console.log('   ✅ ESP32 отвечает!');
    console.log('   📊 Статус:');
    console.log(`      - IP адрес: ${response.data.ip || 'не указан'}`);
    console.log(`      - WiFi SSID: ${response.data.wifi_ssid || 'не указан'}`);
    console.log(`      - Тестовый режим: ${response.data.test_mode ? 'ДА' : 'НЕТ'}`);
    console.log(`      - Каналов DMX: ${response.data.channels_total || 512}`);
    return true;
  } catch (error) {
    console.log('   ❌ ESP32 недоступен!');
    console.log(`      Ошибка: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('      → ESP32 не отвечает на запросы');
      console.log('      → Проверьте, что ESP32 прошит и подключен к WiFi');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('      → Превышено время ожидания');
      console.log('      → Проверьте IP адрес и что ESP32 в той же сети');
    }
    return false;
  }
}

// Тест 2: Проверка получения каналов
async function testGetChannels() {
  try {
    console.log('\n2️⃣ Проверка получения каналов DMX...');
    const response = await axios.get(`${esp32Url}/api/channels`, { timeout: 3000 });
    const channels = response.data.channels || {};
    const channelCount = Object.keys(channels).length;
    console.log(`   ✅ Получено ${channelCount} каналов`);
    
    // Показываем первые несколько каналов
    const sampleChannels = Object.keys(channels).slice(0, 5);
    if (sampleChannels.length > 0) {
      console.log('   📊 Примеры каналов:');
      sampleChannels.forEach(ch => {
        console.log(`      CH${ch}: ${channels[ch]}`);
      });
    }
    return true;
  } catch (error) {
    console.log('   ❌ Не удалось получить каналы');
    console.log(`      Ошибка: ${error.message}`);
    return false;
  }
}

// Тест 3: Проверка отправки команды
async function testSendCommand() {
  try {
    console.log('\n3️⃣ Проверка отправки команды DMX...');
    const testChannel = 1;
    const testValue = 255;
    
    const response = await axios.post(
      `${esp32Url}/api/channel?channel=${testChannel}&value=${testValue}`,
      {},
      { timeout: 3000 }
    );
    
    console.log(`   ✅ Команда отправлена: CH${testChannel} = ${testValue}`);
    console.log('   💡 Если подключено DMX оборудование, канал должен включиться');
    
    // Выключаем канал
    setTimeout(async () => {
      try {
        await axios.post(
          `${esp32Url}/api/channel?channel=${testChannel}&value=0`,
          {},
          { timeout: 3000 }
        );
        console.log(`   🔌 Канал CH${testChannel} выключен`);
      } catch (e) {
        // Игнорируем ошибку выключения
      }
    }, 1000);
    
    return true;
  } catch (error) {
    console.log('   ❌ Не удалось отправить команду');
    console.log(`      Ошибка: ${error.message}`);
    return false;
  }
}

// Тест 4: Проверка пакетного обновления
async function testBatchUpdate() {
  try {
    console.log('\n4️⃣ Проверка пакетного обновления...');
    const testChannels = {
      "1": 100,
      "2": 150,
      "3": 200
    };
    
    const response = await axios.post(
      `${esp32Url}/api/batch`,
      { channels: testChannels },
      {
        timeout: 3000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('   ✅ Пакетное обновление успешно');
    console.log('   📊 Обновлены каналы:', Object.keys(testChannels).map(ch => `CH${ch}`).join(', '));
    
    // Выключаем каналы
    setTimeout(async () => {
      try {
        await axios.post(
          `${esp32Url}/api/all`,
          { action: 'off' },
          {
            timeout: 3000,
            headers: { 'Content-Type': 'application/json' }
          }
        );
        console.log('   🔌 Все каналы выключены');
      } catch (e) {
        // Игнорируем ошибку
      }
    }, 1000);
    
    return true;
  } catch (error) {
    console.log('   ❌ Не удалось выполнить пакетное обновление');
    console.log(`      Ошибка: ${error.message}`);
    return false;
  }
}

// Запуск всех тестов
async function runTests() {
  const results = {
    status: false,
    getChannels: false,
    sendCommand: false,
    batchUpdate: false
  };
  
  results.status = await testStatus();
  if (!results.status) {
    console.log('\n❌ ESP32 недоступен. Остановка тестов.');
    console.log('\n💡 Что проверить:');
    console.log('   1. ESP32 прошит прошивкой dmx-controller-ota.ino');
    console.log('   2. ESP32 подключен к WiFi (проверьте Serial Monitor)');
    console.log('   3. IP адрес правильный (проверьте в Serial Monitor)');
    console.log('   4. ESP32 и компьютер в одной WiFi сети');
    process.exit(1);
  }
  
  results.getChannels = await testGetChannels();
  results.sendCommand = await testSendCommand();
  results.batchUpdate = await testBatchUpdate();
  
  // Итоговый результат
  console.log('\n' + '='.repeat(50));
  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log('✅ Все тесты пройдены! ESP32 готов к работе.');
    console.log('\n📝 Следующие шаги:');
    console.log('   1. Обновите server/dmx/dmx-config.json:');
    console.log(`      "type": "esp32",`);
    console.log(`      "host": "${esp32IP}",`);
    console.log(`      "port": ${config?.interface?.port || 80}`);
    console.log('   2. Перезапустите сервер: npm start');
    console.log('   3. Откройте http://localhost:3000/dmx-control.html для тестирования');
  } else {
    console.log('⚠️ Некоторые тесты не прошли');
    console.log('   Проверьте логи выше для деталей');
  }
  console.log('='.repeat(50));
}

runTests().catch(error => {
  console.error('❌ Критическая ошибка:', error.message);
  process.exit(1);
});



