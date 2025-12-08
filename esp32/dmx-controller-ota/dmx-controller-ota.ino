/*
 * ====================================================================
 * ESP32 DMX Controller - УНИВЕРСАЛЬНАЯ ПРОШИВКА
 * ====================================================================
 * 
 * ЕДИНСТВЕННАЯ ПРОШИВКА ДЛЯ ВСЕХ ЗАДАЧ:
 * ✅ Управление 14 RGB DMX прожекторами (каждый по 9 каналов)
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
 * Каждый прожектор использует 9 каналов:
 * - Канал 1: Угол по оси X (0-255)
 * - Канал 2: Угол по оси Y (0-255)
 * - Канал 3: Режим работы (0-8=ВЫКЛ, 9-135=Затемнение, 136-240=Стробоскоп, 241-255=ВКЛ)
 * - Канал 4: Затемнение КРАСНЫЙ (0-255) - RGB R
 * - Канал 5: Затемнение ЗЕЛЕНЫЙ (0-255) - RGB G
 * - Канал 6: Затемнение СИНИЙ (0-255) - RGB B
 * - Канал 7: Затемнение БЕЛЫЙ (0-255)
 * - Канал 8: Скорость (0-255)
 * - Канал 9: Сброс настроек (150-200)
 * 
 * Адресация:
 * - Прожектор 1 (Игрок 0): DMX адреса 1-9
 * - Прожектор 2 (Игрок 1): DMX адреса 10-18
 * - Прожектор 3 (Игрок 2): DMX адреса 19-27
 * - ... до прожектора 14 (Игрок 13): DMX адреса 118-126
 * 
 * Формула: Start(Прожектор N) = 1 + (N - 1) × 9
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

// ========== HTML ДЛЯ ВЕБ-ИНТЕРФЕЙСА (УЛУЧШЕННАЯ ВЕРСИЯ) ==========
#include "dmx-web-interface.h"
const char* htmlPage = htmlPageImproved;

// ========== ФУНКЦИИ DMX ==========

// Вспомогательные функции для работы с LM70S согласно спецификации
// Start(LM70S N) = 1 + (N - 1) * 9, где N от 1 до 14 (каждый прожектор использует 9 каналов)
int getLM70SBaseChannel(int lm70sNumber) {
  // lm70sNumber от 0 до 13 (для удобства в коде)
  return 1 + lm70sNumber * 9;
}

// Установить RGB для LM70S
// RGB каналы: Ch+3 (R), Ch+4 (G), Ch+5 (B) - каналы 4, 5, 6 в offset от startAddress
void setLM70SRGB(int lm70sNumber, uint8_t r, uint8_t g, uint8_t b) {
  int baseChannel = getLM70SBaseChannel(lm70sNumber);
  dmxUniverse[baseChannel + 3 - 1] = constrain(r, 0, 255);  // R (Ch+3, канал 4)
  dmxUniverse[baseChannel + 4 - 1] = constrain(g, 0, 255);  // G (Ch+4, канал 5)
  dmxUniverse[baseChannel + 5 - 1] = constrain(b, 0, 255);  // B (Ch+5, канал 6)
}

// Вспомогательные функции для работы с LED BAR
// Start(BAR N) = 197 + (N - 1) * 24, где N от 1 до 10
int getLEDBarBaseChannel(int barNumber) {
  // barNumber от 0 до 9 (для удобства в коде)
  return 197 + barNumber * 24;
}

// Установить RGB для пикселя LED BAR
// Каждый пиксель использует 3 канала: R, G, B
void setLEDBarPixelRGB(int barNumber, int pixel, uint8_t r, uint8_t g, uint8_t b) {
  int baseChannel = getLEDBarBaseChannel(barNumber);
  int pixelOffset = (pixel - 1) * 3;  // pixel от 1 до 8
  if (pixel >= 1 && pixel <= 8) {
    dmxUniverse[baseChannel + pixelOffset + 0 - 1] = constrain(r, 0, 255);
    dmxUniverse[baseChannel + pixelOffset + 1 - 1] = constrain(g, 0, 255);
    dmxUniverse[baseChannel + pixelOffset + 2 - 1] = constrain(b, 0, 255);
  }
}

// Установить RGB для всех пикселей LED BAR
void setLEDBarAllPixelsRGB(int barNumber, uint8_t r, uint8_t g, uint8_t b) {
  for (int pixel = 1; pixel <= 8; pixel++) {
    setLEDBarPixelRGB(barNumber, pixel, r, g, b);
  }
}

// Управление туман-машиной
// Канал 437: 0-4 = OFF, 5-255 = туман
void setFogMachine(uint8_t level) {
  dmxUniverse[437 - 1] = constrain(level, 0, 255);
}

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

// API для работы с каналами (GET /api/dmx/channels)
void handleDMXGetChannels() {
  String startAddrStr = server.arg("startAddress");
  String countStr = server.arg("count");
  
  int startAddress = startAddrStr.length() > 0 ? startAddrStr.toInt() : 1;
  int channelCount = countStr.length() > 0 ? countStr.toInt() : 9;
  
  if (startAddress < 1 || startAddress > DMX_UNIVERSE_SIZE) {
    startAddress = 1;
  }
  if (channelCount < 1 || channelCount > 512) {
    channelCount = 9;
  }
  
  DynamicJsonDocument doc(4096);
  doc["success"] = true;
  doc["startAddress"] = startAddress;
  
  JsonObject channels = doc.createNestedObject("channels");
  for (int i = 0; i < channelCount && (startAddress + i - 1) < DMX_UNIVERSE_SIZE; i++) {
    int channelNum = startAddress + i;
    channels[String(i + 1)] = dmxUniverse[channelNum - 1];
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// API для работы с каналами (POST /api/dmx/channels)
void handleDMXSetChannels() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, body);
    
    int startAddress = doc.containsKey("startAddress") ? doc["startAddress"].as<int>() : 1;
    if (startAddress < 1 || startAddress > DMX_UNIVERSE_SIZE) {
      startAddress = 1;
    }
    
    if (doc.containsKey("channels")) {
      JsonObject channels = doc["channels"];
      int updated = 0;
      
      Serial.printf("[DMX] Получен запрос: startAddress=%d, количество каналов=%d\n", startAddress, channels.size());
      
      for (JsonPair kv : channels) {
        String channelOffsetStr = String(kv.key().c_str());
        int channelOffset = channelOffsetStr.toInt();
        int value = kv.value().as<int>();
        
        // ВАЖНО: channelOffset - это относительный номер канала (1-9 для LM70S)
        // absoluteChannel = startAddress + channelOffset - 1
        // Например: startAddress=1, channelOffset=1 -> absoluteChannel=1
        //           startAddress=1, channelOffset=9 -> absoluteChannel=9
        //           startAddress=10, channelOffset=1 -> absoluteChannel=10
        //           startAddress=10, channelOffset=9 -> absoluteChannel=18
        if (channelOffset >= 1 && channelOffset <= 512) {
          int absoluteChannel = startAddress + channelOffset - 1;
          if (absoluteChannel >= 1 && absoluteChannel <= DMX_UNIVERSE_SIZE) {
            uint8_t oldValue = dmxUniverse[absoluteChannel - 1];
            dmxUniverse[absoluteChannel - 1] = constrain(value, 0, 255);
            updated++;
            
            // Логирование для отладки (первые 50 каналов для лучшей диагностики)
            if (absoluteChannel <= 50) {
              Serial.printf("[DMX] Канал %d (offset %d от адреса %d) = %d (было %d)\n", 
                            absoluteChannel, channelOffset, startAddress, value, oldValue);
            }
            
            // Специальное логирование для RGB каналов
            if (channelOffset == 4 || channelOffset == 5 || channelOffset == 6) {
              const char* colorName = (channelOffset == 4) ? "R" : (channelOffset == 5) ? "G" : "B";
              Serial.printf("[DMX] RGB: %s канал на адресе %d = %d\n", colorName, absoluteChannel, value);
            }
          } else {
            Serial.printf("[DMX] ОШИБКА: абсолютный канал %d выходит за пределы (startAddress=%d, offset=%d)\n", 
                          absoluteChannel, startAddress, channelOffset);
          }
        } else {
          Serial.printf("[DMX] ОШИБКА: неверный offset %d (должен быть 1-512)\n", channelOffset);
        }
      }
      
      Serial.printf("[DMX] Итого обновлено %d каналов с адреса %d\n", updated, startAddress);
      
      dmxChanged = true;
      
      Serial.printf("[DMX] Channels API: Обновлено %d каналов с адреса %d\n", updated, startAddress);
      
      DynamicJsonDocument response(512);
      response["success"] = true;
      response["updated"] = updated;
      response["startAddress"] = startAddress;
      
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
  // Тестовый паттерн - радуга по всем 14 LM70S
  for (int player = 0; player < 14; player++) {
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
    
    setLM70SRGB(player, r, g, b);
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
    
    // Устанавливаем RGB для LM70S согласно спецификации
    setLM70SRGB(playerIndex, r, g, b);
    
    dmxChanged = true;
    
    // Вычисляем базовый канал для логирования
    int baseChannel = getLM70SBaseChannel(playerIndex);
    Serial.printf("[DMX] LM70S %d: RGB(%d, %d, %d) на каналах %d(R), %d(G), %d(B)\n", 
                  playerIndex + 1, r, g, b, baseChannel + 3, baseChannel + 4, baseChannel + 5);
    
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
    // Все LM70S белый цвет
    for (int i = 0; i < 14; i++) {
      setLM70SRGB(i, 255, 255, 255);
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: все белое");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"all-white\"}");
  } else if (presetName == "rainbow") {
    // Радуга по всем LM70S
    for (int i = 0; i < 14; i++) {
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
      
      setLM70SRGB(i, r, g, b);
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: радуга");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"rainbow\"}");
  } else if (presetName == "pulse-green") {
    // Пульсация зеленого (эффект обрабатывается на сервере)
    for (int i = 0; i < 14; i++) {
      setLM70SRGB(i, 0, 255, 0);
    }
    dmxChanged = true;
    Serial.println("[DMX] Пресет: пульсация зеленого");
    server.send(200, "application/json", "{\"success\":true,\"preset\":\"pulse-green\"}");
  } else if (presetName == "pulse-red") {
    // Пульсация красного
    for (int i = 0; i < 14; i++) {
      setLM70SRGB(i, 255, 0, 0);
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
      
      // Устанавливаем цвет всем LM70S согласно спецификации
      for (int i = 0; i < 14; i++) {
        setLM70SRGB(i, r, g, b);
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

// Управление LED BAR (POST /api/dmx/ledbar/:barNumber)
void handleLEDBarControl() {
  String path = server.uri();
  int barNumber = -1;
  
  int lastSlash = path.lastIndexOf('/');
  if (lastSlash != -1) {
    String numberStr = path.substring(lastSlash + 1);
    barNumber = numberStr.toInt() - 1;  // Конвертируем в 0-based индекс
  }
  
  if (barNumber < 0 || barNumber >= 10) {
    server.send(400, "application/json", "{\"error\":\"Invalid LED BAR number (1-10)\"}");
    return;
  }
  
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    if (doc.containsKey("pixel")) {
      // Управление конкретным пикселем
      int pixel = doc["pixel"].as<int>();
      int r = doc["r"].as<int>();
      int g = doc["g"].as<int>();
      int b = doc["b"].as<int>();
      
      setLEDBarPixelRGB(barNumber, pixel, r, g, b);
      dmxChanged = true;
      
      Serial.printf("[DMX] LED BAR %d, Pixel %d: RGB(%d, %d, %d)\n", barNumber + 1, pixel, r, g, b);
    } else {
      // Управление всеми пикселями
      int r = doc["r"].as<int>();
      int g = doc["g"].as<int>();
      int b = doc["b"].as<int>();
      
      setLEDBarAllPixelsRGB(barNumber, r, g, b);
      dmxChanged = true;
      
      Serial.printf("[DMX] LED BAR %d: все пиксели RGB(%d, %d, %d)\n", barNumber + 1, r, g, b);
    }
    
    DynamicJsonDocument response(256);
    response["success"] = true;
    response["barNumber"] = barNumber + 1;
    
    String responseStr;
    serializeJson(response, responseStr);
    server.send(200, "application/json", responseStr);
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
  }
}

// Управление туман-машиной (POST /api/dmx/fog)
void handleFogMachine() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(256);
    deserializeJson(doc, body);
    
    uint8_t level = doc["level"].as<uint8_t>();
    setFogMachine(level);
    dmxChanged = true;
    
    Serial.printf("[DMX] Туман-машина: уровень %d\n", level);
    
    DynamicJsonDocument response(256);
    response["success"] = true;
    response["level"] = level;
    
    String responseStr;
    serializeJson(response, responseStr);
    server.send(200, "application/json", responseStr);
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
  
  // Настройка статического IP адреса
  IPAddress local_IP(192, 168, 0, 71);
  IPAddress gateway(192, 168, 0, 1);
  IPAddress subnet(255, 255, 255, 0);
  
  if (!WiFi.config(local_IP, gateway, subnet)) {
    Serial.println("[WiFi] Ошибка настройки статического IP!");
  } else {
    Serial.println("[WiFi] Статический IP настроен: 192.168.0.71");
  }
  
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
  server.on("/api/dmx/channels", HTTP_GET, handleDMXGetChannels);
  server.on("/api/dmx/channels", HTTP_POST, handleDMXSetChannels);
  
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
  
  // API для LED BAR (1-10)
  for (int i = 1; i <= 10; i++) {
    String path = "/api/dmx/ledbar/" + String(i);
    server.on(path.c_str(), HTTP_POST, handleLEDBarControl);
  }
  
  // API для туман-машины
  server.on("/api/dmx/fog", HTTP_POST, handleFogMachine);
  
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
  Serial.println("  - Каждый прожектор использует 9 каналов (14 прожекторов = каналы 1-126)");
  Serial.println("  - Структура каналов:");
  Serial.println("    1: Угол по оси X");
  Serial.println("    2: Угол по оси Y");
  Serial.println("    3: Режим работы");
  Serial.println("    4: Затемнение КРАСНЫЙ (RGB R)");
  Serial.println("    5: Затемнение ЗЕЛЕНЫЙ (RGB G)");
  Serial.println("    6: Затемнение СИНИЙ (RGB B)");
  Serial.println("    7: Затемнение БЕЛЫЙ");
  Serial.println("    8: Скорость");
  Serial.println("    9: Сброс настроек");
  Serial.println("  - RGB каналы: 4, 5, 6 (в offset от startAddress каждого прожектора)");
  Serial.println("  - Используйте веб-пульт для управления");
  Serial.println();
  Serial.println("========================================");
}

// ========== LOOP ==========

void loop() {
  ArduinoOTA.handle();  // Обработка OTA обновлений
  server.handleClient();  // Обработка HTTP запросов
  
  // Отправка DMX кадров с нужной частотой
  // ВАЖНО: DMX кадры должны отправляться ПОСТОЯННО (~44 раза в секунду),
  // даже если значения не изменились. Это необходимо для того, чтобы
  // устройства получали постоянный сигнал и не переходили в режим "нет сигнала"
  unsigned long now = millis();
  if (now - lastDMXUpdate >= DMX_REFRESH_INTERVAL) {
    if (!TEST_MODE) {
      sendDMXFrame();
    }
    // Сбрасываем флаг изменений только после отправки
    // Но продолжаем отправлять кадры постоянно
    dmxChanged = false;
    lastDMXUpdate = now;
  }
  
  // Небольшая задержка для стабильности
  delay(1);
}



