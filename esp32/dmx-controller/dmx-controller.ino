/*
 * ESP32 DMX Controller через MAX485
 * 
 * Подключение MAX485 к ESP32:
 * - DI (Data In) -> GPIO0
 * - DE+RE (Data Enable/Receive Enable) -> GPIO2
 * - RO (Receive Out) -> GPIO15 (не используется в режиме передачи)
 * 
 * Протокол: HTTP REST API
 * 
 * Для тестирования без DMX оборудования:
 * - Все команды выводятся в Serial Monitor
 * - Встроенный LED (GPIO2) мигает при получении команд
 * - Веб-интерфейс для визуализации состояния каналов
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ========== КОНФИГУРАЦИЯ ==========
// Настройки WiFi
const char* ssid = "YOUR_WIFI_SSID";        // Замените на ваш SSID
const char* password = "YOUR_WIFI_PASSWORD"; // Замените на ваш пароль

// Настройки DMX
#define DMX_UNIVERSE_SIZE 512
#define DMX_START_CODE 0x00
#define DMX_BREAK 0x88  // Длительность BREAK в микросекундах (минимум 88)
#define DMX_MAB 0x08    // Mark After Break (минимум 8)

// Пины ESP32
#define DMX_TX_PIN 0    // DI (Data In) - передача данных
#define DE_RE_PIN 2     // DE+RE - управление направлением (HIGH = передача)
#define LED_PIN 2       // Встроенный LED (тот же пин что и DE_RE_PIN)

// Настройки Serial для DMX
#define DMX_BAUD 250000  // Стандартная скорость DMX512

// Режим тестирования (true = без реального DMX, false = с DMX)
#define TEST_MODE true

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
    </style>
</head>
<body>
    <div class="header">
        <h1>ESP32 DMX Controller</h1>
        <p>Тестовый режим - Визуализация каналов</p>
    </div>
    
    <div class="status">
        <strong>Статус:</strong> <span id=\"status\">Подключение...</span><br>
        <strong>Обновлено:</strong> <span id=\"lastUpdate\">-</span>
    </div>
    
    <div class="controls">
        <button onclick=\"refreshChannels()\">Обновить</button>
        <button onclick=\"clearAll()\">Очистить все</button>
        <button onclick=\"testPattern()\">Тестовый паттерн</button>
    </div>
    
    <div class="info">
        <strong>Показывать каналы:</strong>
        <input type=\"number\" id=\"startChannel\" value=\"1\" min=\"1\" max=\"512\" style=\"width: 80px; padding: 5px; margin: 0 10px;\">
        <strong>до</strong>
        <input type=\"number\" id=\"endChannel\" value=\"42\" min=\"1\" max=\"512\" style=\"width: 80px; padding: 5px; margin: 0 10px;\">
        <button onclick=\"updateView()\">Применить</button>
    </div>
    
    <div class=\"channel-grid\" id=\"channelGrid\"></div>
    
    <script>
        let channels = {};
        let startChannel = 1;
        let endChannel = 42;
        
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
        
        // Автообновление каждые 500мс
        setInterval(loadChannels, 500);
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
  // Используем Hardware Serial 1 (UART1)
  // На ESP32 GPIO0 может использоваться как TX1, но нужно проверить вашу модель
  // Альтернатива: GPIO17 для TX2 (измените DMX_TX_PIN на 17 и используйте Serial2)
  
  // Инициализация Serial1 с GPIO0 как TX
  // Формат: begin(baud, config, rx_pin, tx_pin)
  Serial1.begin(DMX_BAUD, SERIAL_8N2, -1, DMX_TX_PIN); // RX=-1 (не используется), TX=GPIO0
  
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
  delayMicroseconds(10);
  
  // BREAK сигнал (минимум 88 микросекунд LOW)
  // Для BREAK нужно временно остановить Serial и установить линию в LOW вручную
  Serial1.end();
  pinMode(DMX_TX_PIN, OUTPUT);
  digitalWrite(DMX_TX_PIN, LOW);
  delayMicroseconds(DMX_BREAK);
  
  // Mark After Break (минимум 8 микросекунд HIGH)
  digitalWrite(DMX_TX_PIN, HIGH);
  delayMicroseconds(DMX_MAB);
  
  // Возобновляем Serial для передачи данных
  Serial1.begin(DMX_BAUD, SERIAL_8N2, -1, DMX_TX_PIN);
  
  // Start Code (всегда 0x00 для DMX512)
  Serial1.write(DMX_START_CODE);
  
  // Данные каналов (512 каналов)
  for (int i = 0; i < DMX_UNIVERSE_SIZE; i++) {
    Serial1.write(dmxUniverse[i]);
  }
  
  // Завершение передачи
  delayMicroseconds(10);
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
  doc["status"] = "ok";
  doc["test_mode"] = TEST_MODE;
  doc["wifi_ssid"] = WiFi.SSID();
  doc["ip"] = WiFi.localIP().toString();
  doc["channels_total"] = DMX_UNIVERSE_SIZE;
  
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
      
      // Логирование для тестирования
      Serial.printf("[DMX] Channel %d = %d\n", channel, value);
      
      // Мигание LED
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
      
      // Мигание LED
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
  
  // Настройка HTTP сервера
  server.on("/", handleRoot);
  server.on("/api/status", handleStatus);
  server.on("/api/channels", HTTP_GET, handleGetChannels);
  server.on("/api/channel", HTTP_POST, handleSetChannel);
  server.on("/api/batch", HTTP_POST, handleBatchUpdate);
  server.on("/api/all", HTTP_POST, handleAllOff);
  server.on("/api/test", HTTP_POST, handleTestPattern);
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
  Serial.println("Откройте в браузере: http://" + WiFi.localIP().toString());
  Serial.println("========================================");
  Serial.println();
}

// ========== LOOP ==========

void loop() {
  server.handleClient();
  
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

