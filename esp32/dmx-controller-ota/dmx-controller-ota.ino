/*
 * ====================================================================
 * ESP32 DMX Controller - УНИВЕРСАЛЬНАЯ ПРОШИВКА
 * ====================================================================
 * 
 * ЕДИНСТВЕННАЯ ПРОШИВКА ДЛЯ ВСЕХ ЗАДАЧ:
 * ✅ Управление 14 RGB DMX прожекторами (каналы 1-42)
 * ✅ Интеграция с веб-пультом http://localhost:3000/dmx-control.html
 * ✅ OTA обновления через WiFi
 * ✅ Веб-интерфейс для прямого управления
 * ✅ Все пресеты и эффекты
 * ✅ Статус подключения
 * 
 * ВАЖНО: Для первой загрузки этой прошивки нужен USB кабель!
 * После первой загрузки можно обновлять через WiFi (OTA).
 * 
 * ====================================================================
 * ПОДКЛЮЧЕНИЕ ОБОРУДОВАНИЯ
 * ====================================================================
 * 
 * MAX485 к ESP32:
 * - DI (Data In) -> GPIO13
 * - DE+RE (Data Enable/Receive Enable) -> GPIO14
 * - RO (Receive Out) -> GPIO27 (не используется в режиме передачи)
 * - VCC -> 5V
 * - GND -> GND
 * 
 * MAX485 к XLR-3 (DMX кабель):
 * - A (A+) -> Pin 2 (Data+ / Signal+)
 * - B (B-) -> Pin 3 (Data- / Signal-)
 * - GND -> Pin 1 (GND / Shield)
 * 
 * ВАЖНО: Если цвета не меняются, попробуйте поменять местами A и B!
 * 
 * ====================================================================
 * УПРАВЛЕНИЕ 14 RGB ПРОЖЕКТОРАМИ
 * ====================================================================
 * 
 * Каждый прожектор использует 3 канала RGB:
 * - Игрок 0: каналы 1, 2, 3 (R, G, B)
 * - Игрок 1: каналы 4, 5, 6 (R, G, B)
 * - Игрок 2: каналы 7, 8, 9 (R, G, B)
 * - ... и так далее до игрока 13 (каналы 40, 41, 42)
 * 
 * ====================================================================
 * API ENDPOINTS
 * ====================================================================
 * 
 * Для веб-пульта:
 * - GET  /api/dmx/status - статус системы
 * - POST /api/dmx/player/0-13 - управление игроком
 * - POST /api/dmx/stage - управление сценой
 * - POST /api/dmx/preset/:name - применение пресета
 * - GET  /api/dmx/presets - список пресетов
 * - POST /api/dmx/effect/:name - запуск эффекта
 * - POST /api/dmx/all - управление всеми приборами
 * 
 * Для прямого управления:
 * - GET  /api/channels - получить все каналы
 * - POST /api/batch - массовое обновление каналов
 * - POST /api/all - выключить все
 * 
 * ====================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

// ========== КОНФИГУРАЦИЯ ==========
// Настройки WiFi
const char* ssid = "ELTX-2.4GHz_WiFi_D8E8";        // Название WiFi сети
const char* password = "TG22022035";                // Пароль от WiFi

// Настройки OTA (опционально, для безопасности)
const char* ota_password = "dmx123";  // Пароль для OTA обновлений (можно оставить пустым "")

// Настройки DMX
#define DMX_UNIVERSE_SIZE 512
#define DMX_START_CODE 0x00
#define DMX_BREAK 176   // Длительность BREAK в микросекундах (минимум 88, используем 176 для надежности)
#define DMX_MAB 16      // Mark After Break (минимум 8, используем 16 для надежности)

// Пины ESP32
#define DMX_TX_PIN 13   // DI (Data In) - передача данных
#define DE_RE_PIN 14    // DE+RE - управление направлением (HIGH = передача)
#define LED_PIN 2       // Встроенный LED (GPIO2 - стандартный пин для LED на ESP32)

// Настройки Serial для DMX
#define DMX_BAUD 250000  // Стандартная скорость DMX512

// Режим тестирования (true = без реального DMX, false = с DMX)
#define TEST_MODE false  // ВЫКЛЮЧЕНО для реальной работы с DMX

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
WebServer server(80);
uint8_t dmxUniverse[DMX_UNIVERSE_SIZE] = {0};  // Все каналы DMX
bool dmxChanged = false;
unsigned long lastDMXUpdate = 0;
const unsigned long DMX_REFRESH_INTERVAL = 23; // ~44 обновления в секунду (1000/44 ≈ 23ms)

// ========== HTML ДЛЯ ВЕБ-ИНТЕРФЕЙСА ==========
const char* htmlPage = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32 DMX Controller - Тестовый режим</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #1a1a1a;
            color: #fff;
            padding: 20px;
            margin: 0;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .status {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .channel-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 10px;
            margin-top: 20px;
        }
        .channel {
            background: #2a2a2a;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
            border: 2px solid #444;
        }
        .channel.active {
            border-color: #00ff00;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }
        .channel-number {
            font-size: 12px;
            color: #888;
            margin-bottom: 5px;
        }
        .channel-value {
            font-size: 18px;
            font-weight: bold;
            color: #00ff00;
        }
        .channel-bar {
            width: 100%;
            height: 20px;
            background: #1a1a1a;
            border-radius: 3px;
            margin-top: 5px;
            overflow: hidden;
        }
        .channel-fill {
            height: 100%;
            background: linear-gradient(90deg, #00ff00, #ffff00, #ff0000);
            transition: width 0.1s;
        }
        .controls {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        button {
            background: #00ff00;
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin: 5px;
        }
        button:hover {
            background: #00cc00;
        }
        .info {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
        }
        .color-control {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 2px solid #00ff00;
        }
        .color-control h2 {
            margin-top: 0;
            color: #00ff00;
        }
        .player-selector {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-bottom: 20px;
        }
        .player-btn {
            background: #444;
            color: #fff;
            border: 2px solid #666;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        .player-btn:hover {
            background: #555;
        }
        .player-btn.active {
            background: #00ff00;
            color: #000;
            border-color: #00ff00;
        }
        .rgb-controls {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
        }
        .rgb-slider {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .rgb-slider label {
            width: 30px;
            font-weight: bold;
            color: #00ff00;
        }
        .rgb-slider input[type="range"] {
            flex: 1;
            height: 8px;
            background: #1a1a1a;
            border-radius: 5px;
            outline: none;
        }
        .rgb-slider input[type="number"] {
            width: 60px;
            padding: 5px;
            background: #1a1a1a;
            color: #fff;
            border: 1px solid #444;
            border-radius: 3px;
            text-align: center;
        }
        .color-preview {
            width: 100%;
            height: 80px;
            background: #000;
            border: 2px solid #444;
            border-radius: 5px;
            margin-bottom: 15px;
            transition: background 0.2s;
        }
        .quick-colors {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 15px;
        }
        .quick-color-btn {
            width: 50px;
            height: 50px;
            border: 2px solid #666;
            border-radius: 5px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .quick-color-btn:hover {
            transform: scale(1.1);
            border-color: #00ff00;
        }
        .ota-section {
            background: #3a3a3a;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            border: 2px solid #00ff00;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>ESP32 DMX Controller</h1>
        <p>Управление 14 RGB прожекторами</p>
    </div>
    
    <div class="status">
        <strong>Статус:</strong> <span id="status">Подключение...</span><br>
        <strong>IP адрес:</strong> <span id="ipAddress">-</span><br>
        <strong>Обновлено:</strong> <span id="lastUpdate">-</span>
    </div>
    
    <div class="color-control">
        <h2>Управление цветом игрока</h2>
        <div class="player-selector" id=\"playerSelector\"></div>
        <div class="color-preview" id=\"colorPreview\"></div>
        <div class="rgb-controls">
            <div class="rgb-slider">
                <label>R:</label>
                <input type=\"range\" id=\"rSlider\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColor()\">
                <input type=\"number\" id=\"rValue\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColorFromInput('r')\">
            </div>
            <div class="rgb-slider">
                <label>G:</label>
                <input type=\"range\" id=\"gSlider\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColor()\">
                <input type=\"number\" id=\"gValue\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColorFromInput('g')\">
            </div>
            <div class="rgb-slider">
                <label>B:</label>
                <input type=\"range\" id=\"bSlider\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColor()\">
                <input type=\"number\" id=\"bValue\" min=\"0\" max=\"255\" value=\"255\" oninput=\"updateColorFromInput('b')\">
            </div>
        </div>
        <button onclick=\"setPlayerColor()\" style=\"width: 100%; padding: 15px; font-size: 16px;\">Установить цвет</button>
        <div class="quick-colors">
            <div class=\"quick-color-btn\" style=\"background: rgb(255, 0, 0);\" onclick=\"setQuickColor(255, 0, 0)\" title=\"Красный\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(0, 255, 0);\" onclick=\"setQuickColor(0, 255, 0)\" title=\"Зеленый\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(0, 0, 255);\" onclick=\"setQuickColor(0, 0, 255)\" title=\"Синий\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(255, 255, 0);\" onclick=\"setQuickColor(255, 255, 0)\" title=\"Желтый\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(255, 0, 255);\" onclick=\"setQuickColor(255, 0, 255)\" title=\"Пурпурный\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(0, 255, 255);\" onclick=\"setQuickColor(0, 255, 255)\" title=\"Голубой\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(255, 255, 255);\" onclick=\"setQuickColor(255, 255, 255)\" title=\"Белый\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(100, 100, 255);\" onclick=\"setQuickColor(100, 100, 255)\" title=\"Голубой\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(255, 215, 0);\" onclick=\"setQuickColor(255, 215, 0)\" title=\"Золотой\"></div>
            <div class=\"quick-color-btn\" style=\"background: rgb(0, 0, 0); border-color: #fff;\" onclick=\"setQuickColor(0, 0, 0)\" title=\"Выключить\"></div>
        </div>
    </div>
    
    <div class="controls">
        <button onclick=\"refreshChannels()\">Обновить</button>
        <button onclick=\"clearAll()\">Очистить все</button>
        <button onclick=\"testPattern()\">Тестовый паттерн</button>
        <button onclick=\"quickTest()\" style=\"background: #ff6600;\">Быстрый тест (красный)</button>
    </div>
    
    <div class="info">
        <strong>Показывать каналы:</strong>
        <input type=\"number\" id=\"startChannel\" value=\"1\" min=\"1\" max=\"512\" style=\"width: 80px; padding: 5px; margin: 0 10px;\">
        <strong>до</strong>
        <input type=\"number\" id=\"endChannel\" value=\"42\" min=\"1\" max=\"512\" style=\"width: 80px; padding: 5px; margin: 0 10px;\">
        <button onclick=\"updateView()\">Применить</button>
    </div>
    
    <div class="ota-section">
        <h2>OTA Обновление</h2>
        <p>Для обновления прошивки через WiFi используйте Arduino IDE:</p>
        <ol>
            <li>Tools → Port → [IP адрес ESP32]</li>
            <li>Sketch → Upload</li>
        </ol>
    </div>
    
    <div class="channel-grid" id=\"channelGrid\"></div>
    
    <script>
        let channels = {};
        let startChannel = 1;
        let endChannel = 42;
        let selectedPlayer = 0;
        
        // Инициализация выбора игроков
        function initPlayerSelector() {
            const selector = document.getElementById(\"playerSelector\");
            for (let i = 0; i < 14; i++) {
                const btn = document.createElement(\"button\");
                btn.className = \"player-btn\" + (i === 0 ? \" active\" : \"\");
                btn.textContent = i + 1;
                btn.onclick = function() { selectPlayer(i); };
                selector.appendChild(btn);
            }
        }
        
        function selectPlayer(index) {
            selectedPlayer = index;
            document.querySelectorAll(\".player-btn\").forEach((btn, i) => {
                btn.classList.toggle(\"active\", i === index);
            });
        }
        
        function updateColor() {
            const r = document.getElementById(\"rSlider\").value;
            const g = document.getElementById(\"gSlider\").value;
            const b = document.getElementById(\"bSlider\").value;
            document.getElementById(\"rValue\").value = r;
            document.getElementById(\"gValue\").value = g;
            document.getElementById(\"bValue\").value = b;
            document.getElementById(\"colorPreview\").style.background = \"rgb(\" + r + \", \" + g + \", \" + b + \")\";
        }
        
        function updateColorFromInput(channel) {
            const r = parseInt(document.getElementById(\"rValue\").value) || 0;
            const g = parseInt(document.getElementById(\"gValue\").value) || 0;
            const b = parseInt(document.getElementById(\"bValue\").value) || 0;
            document.getElementById(\"rSlider\").value = r;
            document.getElementById(\"gSlider\").value = g;
            document.getElementById(\"bSlider\").value = b;
            document.getElementById(\"colorPreview\").style.background = \"rgb(\" + r + \", \" + g + \", \" + b + \")\";
        }
        
        function setQuickColor(r, g, b) {
            document.getElementById(\"rSlider\").value = r;
            document.getElementById(\"gSlider\").value = g;
            document.getElementById(\"bSlider\").value = b;
            document.getElementById(\"rValue\").value = r;
            document.getElementById(\"gValue\").value = g;
            document.getElementById(\"bValue\").value = b;
            updateColor();
        }
        
        async function setPlayerColor() {
            const r = parseInt(document.getElementById(\"rSlider\").value) || 0;
            const g = parseInt(document.getElementById(\"gSlider\").value) || 0;
            const b = parseInt(document.getElementById(\"bSlider\").value) || 0;
            
            // Каналы для игрока: baseChannel = (player * 3) + 1
            // Игрок 0: каналы 1, 2, 3
            // Игрок 1: каналы 4, 5, 6
            const baseChannel = selectedPlayer * 3 + 1;
            
            const channels = {};
            channels[baseChannel] = r;
            channels[baseChannel + 1] = g;
            channels[baseChannel + 2] = b;
            
            try {
                const response = await fetch(\"/api/batch\", {
                    method: \"POST\",
                    headers: { \"Content-Type\": \"application/json\" },
                    body: JSON.stringify({ channels: channels })
                });
                
                const data = await response.json();
                if (data.success) {
                    setTimeout(loadChannels, 100);
                } else {
                    alert(\"Ошибка: \" + (data.error || \"Неизвестная ошибка\"));
                }
            } catch (error) {
                alert(\"Ошибка подключения: \" + error.message);
            }
        }
        
        function updateView() {
            startChannel = parseInt(document.getElementById(\"startChannel\").value);
            endChannel = parseInt(document.getElementById(\"endChannel\").value);
            loadChannels();
        }
        
        function loadChannels() {
            fetch(\"/api/channels\")
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    channels = data.channels;
                    renderChannels();
                    document.getElementById(\"lastUpdate\").textContent = new Date().toLocaleTimeString();
                    document.getElementById(\"status\").textContent = \"Активен\";
                })
                .catch(function(e) {
                    console.error(\"Ошибка:\", e);
                    document.getElementById(\"status\").textContent = \"Ошибка подключения\";
                });
        }
        
        function renderChannels() {
            const grid = document.getElementById(\"channelGrid\");
            grid.innerHTML = \"\";
            
            for (let i = startChannel; i <= endChannel && i <= 512; i++) {
                const value = channels[i] || 0;
                const channel = document.createElement(\"div\");
                channel.className = \"channel\" + (value > 0 ? \" active\" : \"\");
                const percent = Math.round((value/255)*100);
                channel.innerHTML = \"<div class=\\\"channel-number\\\">CH \" + i + \"</div>\" +
                    \"<div class=\\\"channel-value\\\">\" + value + \"</div>\" +
                    \"<div class=\\\"channel-bar\\\">\" +
                    \"<div class=\\\"channel-fill\\\" style=\\\"width: \" + percent + \"%\\\"></div>\" +
                    \"</div>\";
                grid.appendChild(channel);
            }
        }
        
        function refreshChannels() {
            loadChannels();
        }
        
        function clearAll() {
            fetch(\"/api/all\", { method: \"POST\", headers: {\"Content-Type\": \"application/json\"}, body: JSON.stringify({action: \"off\"}) })
                .then(function() { setTimeout(loadChannels, 100); });
        }
        
        function testPattern() {
            fetch(\"/api/test\", { method: \"POST\" })
                .then(function() { setTimeout(loadChannels, 100); });
        }
        
        async function quickTest() {
            // Быстрый тест - устанавливаем красный цвет на всех игроков
            const channels = {};
            for (let player = 0; player < 14; player++) {
                const baseChannel = player * 3 + 1;
                channels[baseChannel] = 255;     // R
                channels[baseChannel + 1] = 0;   // G
                channels[baseChannel + 2] = 0;   // B
            }
            
            try {
                const response = await fetch(\"/api/batch\", {
                    method: \"POST\",
                    headers: { \"Content-Type\": \"application/json\" },
                    body: JSON.stringify({ channels: channels })
                });
                
                const data = await response.json();
                if (data.success) {
                    alert(\"Тест отправлен! Все игроки должны стать красными.\\n\\nЕсли цвета не меняются:\\n1. Проверьте подключение A/B на MAX485\\n2. Попробуйте поменять местами A и B\\n3. Проверьте адреса DMX устройств\");
                    setTimeout(loadChannels, 100);
                } else {
                    alert(\"Ошибка: \" + (data.error || \"Неизвестная ошибка\"));
                }
            } catch (error) {
                alert(\"Ошибка подключения: \" + error.message);
            }
        }
        
        // Получить IP адрес
        fetch(\"/api/status\")
            .then(function(r) { return r.json(); })
            .then(function(data) {
                document.getElementById(\"ipAddress\").textContent = data.ip || \"-\";
            });
        
        // Автообновление каждые 500мс
        setInterval(loadChannels, 500);
        initPlayerSelector();
        updateColor();
        loadChannels();
    </script>
</body>
</html>
)";

// ========== ФУНКЦИИ DMX ==========

void setupDMX() {
  pinMode(DE_RE_PIN, OUTPUT);
  digitalWrite(DE_RE_PIN, LOW);
  
  // Настройка Serial для DMX
  // Используем Hardware Serial 2 (UART2)
  // GPIO13 используется как TX2 на Serial2
  Serial2.begin(DMX_BAUD, SERIAL_8N2, -1, DMX_TX_PIN);
  
  Serial.println("[OK] DMX инициализирован");
  Serial.printf("   TX Pin: GPIO%d\n", DMX_TX_PIN);
  Serial.printf("   DE/RE Pin: GPIO%d\n", DE_RE_PIN);
  Serial.printf("   Baud Rate: %d\n", DMX_BAUD);
  Serial.printf("   Test Mode: %s\n", TEST_MODE ? "ДА" : "НЕТ");
}

void sendDMXFrame() {
  if (TEST_MODE) {
    // В тестовом режиме просто логируем первые несколько каналов
    bool hasData = false;
    for (int i = 0; i < 10; i++) {
      if (dmxUniverse[i] > 0) {
        hasData = true;
        break;
      }
    }
    if (hasData) {
      Serial.print("[DMX] Frame: ");
      for (int i = 0; i < 10; i++) {
        Serial.printf("CH%d=%d ", i+1, dmxUniverse[i]);
      }
      Serial.println();
    }
    return;
  }
  
  // Устанавливаем режим передачи (DE+RE = HIGH)
  digitalWrite(DE_RE_PIN, HIGH);
  delayMicroseconds(20);  // Увеличенная задержка для стабильности
  
  // BREAK сигнал (минимум 88 микросекунд LOW)
  // В DMX512 BREAK - это длинный LOW сигнал
  Serial2.end();
  pinMode(DMX_TX_PIN, OUTPUT);
  digitalWrite(DMX_TX_PIN, LOW);
  delayMicroseconds(DMX_BREAK);
  
  // Mark After Break (минимум 8 микросекунд HIGH)
  // MAB - это короткий HIGH перед началом данных
  digitalWrite(DMX_TX_PIN, HIGH);
  delayMicroseconds(DMX_MAB);
  
  // Возобновляем Serial для передачи данных
  // SERIAL_8N2 = 8 бит данных, без четности, 2 стоп-бита (стандарт DMX512)
  Serial2.begin(DMX_BAUD, SERIAL_8N2, -1, DMX_TX_PIN);
  
  // Небольшая задержка после инициализации Serial
  delayMicroseconds(4);
  
  // Start Code (всегда 0x00 для DMX512)
  Serial2.write(DMX_START_CODE);
  
  // Данные каналов (512 каналов)
  for (int i = 0; i < DMX_UNIVERSE_SIZE; i++) {
    Serial2.write(dmxUniverse[i]);
  }
  
  // Ждем завершения передачи всех данных
  Serial2.flush();
  delayMicroseconds(20);
  
  // Завершение передачи - переключаем в режим приема (DE+RE = LOW)
  digitalWrite(DE_RE_PIN, LOW);
  
  // Небольшая задержка перед следующим кадром
  delayMicroseconds(100);
}

// ========== HTTP API HANDLERS ==========

void handleRoot() {
  server.send(200, "text/html", htmlPage);
}

void handleStatus() {
  DynamicJsonDocument doc(1024);
  doc["available"] = true;  // Для совместимости с веб-пультом
  doc["status"] = "ok";
  doc["test_mode"] = TEST_MODE;
  doc["wifi_ssid"] = WiFi.SSID();
  doc["ip"] = WiFi.localIP().toString();
  doc["channels_total"] = DMX_UNIVERSE_SIZE;
  doc["ota_enabled"] = true;
  doc["universe"] = 0;
  doc["interface"] = "esp32";
  doc["players"] = JsonObject();
  doc["players"]["count"] = 14;
  doc["players"]["startAddress"] = 1;
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleGetChannels() {
  DynamicJsonDocument doc(8192);
  JsonObject channels = doc.createNestedObject("channels");
  
  for (int i = 0; i < DMX_UNIVERSE_SIZE; i++) {
    channels[String(i + 1)] = dmxUniverse[i];
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleSetChannel() {
  if (server.hasArg("channel") && server.hasArg("value")) {
    int channel = server.arg("channel").toInt();
    int value = server.arg("value").toInt();
    
    if (channel >= 1 && channel <= DMX_UNIVERSE_SIZE && value >= 0 && value <= 255) {
      dmxUniverse[channel - 1] = value;
      dmxChanged = true;
      
      Serial.printf("[DMX] Channel %d = %d\n", channel, value);
      
      digitalWrite(LED_PIN, HIGH);
      delay(10);
      digitalWrite(LED_PIN, LOW);
      
      server.send(200, "application/json", "{\"success\":true}");
    } else {
      server.send(400, "application/json", "{\"error\":\"Invalid channel or value\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing parameters\"}");
  }
}

void handleBatchUpdate() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(8192);
    deserializeJson(doc, body);
    
    if (doc.containsKey("channels")) {
      JsonObject channels = doc["channels"];
      int updated = 0;
      
      for (JsonPair kv : channels) {
        // В ArduinoJson 6 нужно конвертировать ключ в строку, затем в int
        String channelStr = String(kv.key().c_str());
        int channel = channelStr.toInt();
        int value = kv.value().as<int>();
        
        if (channel >= 1 && channel <= DMX_UNIVERSE_SIZE && value >= 0 && value <= 255) {
          dmxUniverse[channel - 1] = value;
          updated++;
        }
      }
      
      dmxChanged = true;
      
      Serial.printf("[DMX] Batch: Обновлено %d каналов\n", updated);
      
      digitalWrite(LED_PIN, HIGH);
      delay(10);
      digitalWrite(LED_PIN, LOW);
      
      DynamicJsonDocument response(256);
      response["success"] = true;
      response["updated"] = updated;
      
      String responseStr;
      serializeJson(response, responseStr);
      server.send(200, "application/json", responseStr);
    } else {
      server.send(400, "application/json", "{\"error\":\"Missing channels object\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
  }
}

void handleAllOff() {
  for (int i = 0; i < DMX_UNIVERSE_SIZE; i++) {
    dmxUniverse[i] = 0;
  }
  dmxChanged = true;
  
  Serial.println("[DMX] Все каналы выключены");
  
  server.send(200, "application/json", "{\"success\":true}");
}

void handleTestPattern() {
  // Тестовый паттерн - радуга по первым 42 каналам (14 игроков * 3 RGB)
  for (int player = 0; player < 14; player++) {
    int baseChannel = player * 3 + 1;
    float hue = (player * 360.0 / 14.0);
    
    // Простое RGB из HSV (упрощенное)
    int r, g, b;
    int h = (int)(hue / 60) % 6;
    float f = (hue / 60.0) - h;
    float p = 0;
    float q = 1 - f;
    float t = f;
    
    switch (h) {
      case 0: r = 255; g = t * 255; b = 0; break;
      case 1: r = q * 255; g = 255; b = 0; break;
      case 2: r = 0; g = 255; b = t * 255; break;
      case 3: r = 0; g = q * 255; b = 255; break;
      case 4: r = t * 255; g = 0; b = 255; break;
      case 5: r = 255; g = 0; b = q * 255; break;
    }
    
    dmxUniverse[baseChannel - 1] = r;
    dmxUniverse[baseChannel] = g;
    dmxUniverse[baseChannel + 1] = b;
  }
  
  dmxChanged = true;
  Serial.println("[DMX] Тестовый паттерн применен");
  
  server.send(200, "application/json", "{\"success\":true}");
}

// ========== API ENDPOINTS ДЛЯ ВЕБ-ПУЛЬТА ==========

// Управление фонарем игрока (POST /api/dmx/player/:index)
void handlePlayerControl() {
  String path = server.uri();
  int playerIndex = -1;
  
  // Извлекаем индекс игрока из пути /api/dmx/player/0, /api/dmx/player/1 и т.д.
  int lastSlash = path.lastIndexOf('/');
  if (lastSlash != -1) {
    String indexStr = path.substring(lastSlash + 1);
    playerIndex = indexStr.toInt();
  }
  
  if (playerIndex < 0 || playerIndex >= 14) {
    server.send(400, "application/json", "{\"error\":\"Invalid player index\"}");
    return;
  }
  
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    int r = doc["r"].as<int>();
    int g = doc["g"].as<int>();
    int b = doc["b"].as<int>();
    
    // Вычисляем адрес каналов для игрока (каналы 1-42 для 14 игроков по 3 RGB)
    int baseChannel = playerIndex * 3 + 1;
    dmxUniverse[baseChannel - 1] = constrain(r, 0, 255);
    dmxUniverse[baseChannel] = constrain(g, 0, 255);
    dmxUniverse[baseChannel + 1] = constrain(b, 0, 255);
    
    dmxChanged = true;
    
    Serial.printf("[DMX] Игрок %d: RGB(%d, %d, %d) на каналах %d-%d\n", 
                  playerIndex, r, g, b, baseChannel, baseChannel + 2);
    
    digitalWrite(LED_PIN, HIGH);
    delay(10);
    digitalWrite(LED_PIN, LOW);
    
    DynamicJsonDocument response(256);
    response["success"] = true;
    response["playerIndex"] = playerIndex;
    response["address"] = baseChannel;
    
    String responseStr;
    serializeJson(response, responseStr);
    server.send(200, "application/json", responseStr);
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
  }
}

// Управление сценой (POST /api/dmx/stage)
void handleStageControl() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    String action = doc["action"].as<String>();
    
    // Управление сценой (каналы 43-68 согласно конфигу)
    // Для простоты просто логируем действие
    Serial.printf("[DMX] Сцена: действие %s\n", action.c_str());
    
    // Можно добавить реальную логику управления сценой здесь
    
    DynamicJsonDocument response(256);
    response["success"] = true;
    response["action"] = action;
    
    String responseStr;
    serializeJson(response, responseStr);
    server.send(200, "application/json", responseStr);
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
  }
}

// Применить пресет (POST /api/dmx/preset/:name)
void handlePreset() {
  String path = server.uri();
  String presetName = "";
  
  int lastSlash = path.lastIndexOf('/');
  if (lastSlash != -1) {
    presetName = path.substring(lastSlash + 1);
  }
  
  // Применяем пресет
  if (presetName == "all-off") {
    handleAllOff();
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"all-off\"}");
  } else if (presetName == "all-white") {
    // Все игроки белый цвет
    for (int i = 0; i < 14; i++) {
      int baseChannel = i * 3 + 1;
      dmxUniverse[baseChannel - 1] = 255;  // R
      dmxUniverse[baseChannel] = 255;     // G
      dmxUniverse[baseChannel + 1] = 255; // B
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: все белое");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"all-white\"}");
  } else if (presetName == "rainbow") {
    // Радуга по всем игрокам
    for (int i = 0; i < 14; i++) {
      int baseChannel = i * 3 + 1;
      float hue = (i * 360.0 / 14.0);
      int h = (int)(hue / 60) % 6;
      float f = (hue / 60.0) - h;
      float t = f;
      float q = 1 - f;
      
      int r, g, b;
      switch (h) {
        case 0: r = 255; g = t * 255; b = 0; break;
        case 1: r = q * 255; g = 255; b = 0; break;
        case 2: r = 0; g = 255; b = t * 255; break;
        case 3: r = 0; g = q * 255; b = 255; break;
        case 4: r = t * 255; g = 0; b = 255; break;
        case 5: r = 255; g = 0; b = q * 255; break;
        default: r = 255; g = 255; b = 255; break;
      }
      
      dmxUniverse[baseChannel - 1] = r;
      dmxUniverse[baseChannel] = g;
      dmxUniverse[baseChannel + 1] = b;
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: радуга");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"rainbow\"}");
  } else if (presetName == "pulse-green") {
    // Пульсация зеленого (эффект обрабатывается на сервере)
    for (int i = 0; i < 14; i++) {
      int baseChannel = i * 3 + 1;
      dmxUniverse[baseChannel - 1] = 0;
      dmxUniverse[baseChannel] = 255;
      dmxUniverse[baseChannel + 1] = 0;
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: пульсация зеленого");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"pulse-green\"}");
  } else if (presetName == "pulse-red") {
    // Пульсация красного
    for (int i = 0; i < 14; i++) {
      int baseChannel = i * 3 + 1;
      dmxUniverse[baseChannel - 1] = 255;
      dmxUniverse[baseChannel] = 0;
      dmxUniverse[baseChannel + 1] = 0;
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: пульсация красного");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"pulse-red\"}");
  } else if (presetName == "wave-forward" || presetName == "wave-backward" || 
             presetName == "stage-bright" || presetName == "stage-soft" || 
             presetName == "stage-dynamic" || presetName == "final-show") {
    // Эти эффекты обрабатываются на сервере через множественные запросы
    Serial.printf("[DMX] Пресет: %s (обрабатывается на сервере)\n", presetName.c_str());
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"" + presetName + "\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"Unknown preset\"}");
  }
}

// Список пресетов (GET /api/dmx/presets)
void handlePresetsList() {
  DynamicJsonDocument doc(2048);
  JsonArray presets = doc.createNestedArray("presets");
  
  // Добавляем все пресеты из веб-пульта
  JsonObject preset1 = presets.createNestedObject();
  preset1["id"] = "all-off";
  preset1["name"] = "Все выключено";
  preset1["description"] = "Выключить все DMX приборы";
  
  JsonObject preset2 = presets.createNestedObject();
  preset2["id"] = "all-white";
  preset2["name"] = "Все белое";
  preset2["description"] = "Все фонари белого цвета";
  
  JsonObject preset3 = presets.createNestedObject();
  preset3["id"] = "rainbow";
  preset3["name"] = "Радуга";
  preset3["description"] = "Радужная волна по всем игрокам";
  
  JsonObject preset4 = presets.createNestedObject();
  preset4["id"] = "pulse-green";
  preset4["name"] = "Пульсация зеленого";
  preset4["description"] = "Все фонари пульсируют зеленым";
  
  JsonObject preset5 = presets.createNestedObject();
  preset5["id"] = "pulse-red";
  preset5["name"] = "Пульсация красного";
  preset5["description"] = "Все фонари пульсируют красным";
  
  JsonObject preset6 = presets.createNestedObject();
  preset6["id"] = "wave-forward";
  preset6["name"] = "Волна вперед";
  preset6["description"] = "Цветовая волна от первого к последнему игроку";
  
  JsonObject preset7 = presets.createNestedObject();
  preset7["id"] = "wave-backward";
  preset7["name"] = "Волна назад";
  preset7["description"] = "Цветовая волна от последнего к первому игроку";
  
  JsonObject preset8 = presets.createNestedObject();
  preset8["id"] = "stage-bright";
  preset8["name"] = "Сцена яркая";
  preset8["description"] = "Яркое освещение сцены";
  
  JsonObject preset9 = presets.createNestedObject();
  preset9["id"] = "stage-soft";
  preset9["name"] = "Сцена мягкая";
  preset9["description"] = "Мягкое освещение сцены";
  
  JsonObject preset10 = presets.createNestedObject();
  preset10["id"] = "stage-dynamic";
  preset10["name"] = "Сцена динамическая";
  preset10["description"] = "Динамические эффекты на сцене";
  
  JsonObject preset11 = presets.createNestedObject();
  preset11["id"] = "final-show";
  preset11["name"] = "Финальное шоу";
  preset11["description"] = "Финальное шоу с радужными эффектами";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Запустить эффект (POST /api/dmx/effect/:name)
void handleEffect() {
  String path = server.uri();
  String effectName = "";
  
  int lastSlash = path.lastIndexOf('/');
  if (lastSlash != -1) {
    effectName = path.substring(lastSlash + 1);
  }
  
  Serial.printf("[DMX] Эффект: %s\n", effectName.c_str());
  
  // Эффекты обрабатываются на сервере через множественные запросы
  // Здесь просто подтверждаем получение
  DynamicJsonDocument response(256);
  response["success"] = true;
  response["effect"] = effectName;
  
  String responseStr;
  serializeJson(response, responseStr);
  server.send(200, "application/json", responseStr);
}

// Управление всеми приборами (POST /api/dmx/all)
void handleAllControl() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    String action = doc["action"].as<String>();
    
    if (action == "off") {
      handleAllOff();
      server.send(200, "application/json", "{\"success\":true,\"action\":\"off\"}");
    } else if (action == "set") {
      int r = doc["r"].as<int>();
      int g = doc["g"].as<int>();
      int b = doc["b"].as<int>();
      
      // Устанавливаем цвет всем игрокам
      for (int i = 0; i < 14; i++) {
        int baseChannel = i * 3 + 1;
        dmxUniverse[baseChannel - 1] = constrain(r, 0, 255);
        dmxUniverse[baseChannel] = constrain(g, 0, 255);
        dmxUniverse[baseChannel + 1] = constrain(b, 0, 255);
      }
      
      dmxChanged = true;
      Serial.printf("[DMX] Все игроки: RGB(%d, %d, %d)\n", r, g, b);
      
      digitalWrite(LED_PIN, HIGH);
      delay(10);
      digitalWrite(LED_PIN, LOW);
      
      server.send(200, "application/json", "{\"success\":true,\"action\":\"set\"}");
    } else {
      server.send(400, "application/json", "{\"error\":\"Unknown action\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
  }
}

void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

// ========== SETUP ==========

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n");
  Serial.println("========================================");
  Serial.println("  ESP32 DMX Controller через MAX485");
  Serial.println("  С поддержкой OTA обновлений");
  Serial.println("========================================");
  Serial.println();
  
  // Настройка LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Инициализация DMX
  setupDMX();
  
  // Подключение к WiFi
  Serial.print("[WiFi] Подключение к WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Мигание LED
    attempts++;
  }
  
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[OK] WiFi подключен!");
    Serial.print("[WiFi] IP адрес: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] Сигнал: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    
    // Быстрое мигание при успешном подключении
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
  } else {
    Serial.println("[ERROR] Ошибка подключения к WiFi!");
    Serial.println("[WARN] Проверьте SSID и пароль в коде");
  }
  
  // Настройка OTA
  ArduinoOTA.setHostname("esp32-dmx-controller");
  
  if (strlen(ota_password) > 0) {
    ArduinoOTA.setPassword(ota_password);
    Serial.println("[OTA] Пароль установлен");
  } else {
    Serial.println("[OTA] Пароль не установлен (небезопасно!)");
  }
  
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("[OTA] Начало обновления " + type);
  });
  
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Обновление завершено!");
  });
  
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Прогресс: %u%%\r", (progress / (total / 100)));
  });
  
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Ошибка[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Ошибка аутентификации");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Ошибка начала обновления");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Ошибка подключения");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Ошибка приема данных");
    } else if (error == OTA_END_ERROR) {
      Serial.println("Ошибка завершения");
    }
  });
  
  ArduinoOTA.begin();
  Serial.println("[OTA] OTA обновления включены");
  Serial.print("[OTA] Используйте IP: ");
  Serial.println(WiFi.localIP());
  
  // Настройка HTTP сервера
  server.on("/", handleRoot);
  server.on("/api/status", handleStatus);
  server.on("/api/channels", HTTP_GET, handleGetChannels);
  server.on("/api/channel", HTTP_POST, handleSetChannel);
  server.on("/api/batch", HTTP_POST, handleBatchUpdate);
  server.on("/api/all", HTTP_POST, handleAllOff);
  server.on("/api/test", HTTP_POST, handleTestPattern);
  
  // API endpoints для веб-пульта
  server.on("/api/dmx/status", handleStatus);
  
  // Обработчик для всех игроков (0-13) - используем универсальный обработчик
  for (int i = 0; i < 14; i++) {
    String path = "/api/dmx/player/" + String(i);
    server.on(path.c_str(), HTTP_POST, handlePlayerControl);
  }
  
  server.on("/api/dmx/stage", HTTP_POST, handleStageControl);
  server.on("/api/dmx/preset/all-off", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/all-white", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/rainbow", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/pulse-green", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/pulse-red", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/wave-forward", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/wave-backward", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/stage-bright", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/stage-soft", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/stage-dynamic", HTTP_POST, handlePreset);
  server.on("/api/dmx/preset/final-show", HTTP_POST, handlePreset);
  server.on("/api/dmx/presets", HTTP_GET, handlePresetsList);
  server.on("/api/dmx/effect/wave-players", HTTP_POST, handleEffect);
  server.on("/api/dmx/effect/rainbow", HTTP_POST, handleEffect);
  server.on("/api/dmx/all", HTTP_POST, handleAllControl);
  
  server.onNotFound(handleNotFound);
  
  server.begin();
  Serial.println("[HTTP] HTTP сервер запущен");
  Serial.println();
  
  if (TEST_MODE) {
    Serial.println("[TEST] РЕЖИМ ТЕСТИРОВАНИЯ АКТИВЕН");
    Serial.println("   DMX команды будут только логироваться");
    Serial.println();
  }
  
  Serial.println("========================================");
  Serial.println("Готово к работе!");
  Serial.println("========================================");
  Serial.println();
  Serial.println("УПРАВЛЕНИЕ:");
  Serial.println("1. Веб-пульт: http://localhost:3000/dmx-control.html");
  Serial.println("2. Прямое управление: http://" + WiFi.localIP().toString());
  Serial.println("3. OTA обновления: http://" + WiFi.localIP().toString() + "/update");
  Serial.println();
  Serial.println("УПРАВЛЕНИЕ 14 RGB ПРОЖЕКТОРАМИ:");
  Serial.println("  - Каналы 1-42 (14 игроков по 3 RGB канала)");
  Serial.println("  - Используйте веб-пульт для управления");
  Serial.println();
  Serial.println("========================================");
}

// ========== LOOP ==========

void loop() {
  ArduinoOTA.handle();  // Обработка OTA обновлений
  server.handleClient();  // Обработка HTTP запросов
  
  // Отправка DMX кадров с нужной частотой
  unsigned long now = millis();
  if (dmxChanged && (now - lastDMXUpdate >= DMX_REFRESH_INTERVAL)) {
    if (!TEST_MODE) {
      sendDMXFrame();
    }
    dmxChanged = false;
    lastDMXUpdate = now;
  }
  
  // Небольшая задержка для стабильности
  delay(1);
}



