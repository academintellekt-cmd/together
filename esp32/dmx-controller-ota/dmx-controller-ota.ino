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
 * ✅ Настройка WiFi через веб-интерфейс (точка доступа)
 * 
 * ВАЖНО: Для первой загрузки этой прошивки нужен USB кабель!
 * После первой загрузки можно обновлять через WiFi (OTA).
 * 
 * НАСТРОЙКА WIFI:
 * - Если WiFi не настроен или не подключается, ESP32 создаст точку доступа
 * - Подключитесь к сети "ESP32-DMX-Setup" (пароль: dmx123456)
 * - Откройте http://192.168.4.1/wifi-setup
 * - Выберите сеть и введите пароль
 * - После настройки ESP32 перезагрузится и подключится к выбранной сети
 * - Переключите ноутбук на ту же сеть для работы с ESP32
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
 * Для настройки WiFi:
 * - GET  /wifi-setup - страница настройки WiFi
 * - GET  /api/wifi/scan - сканирование доступных сетей
 * - POST /api/wifi/save - сохранение настроек WiFi
 * - GET  /api/wifi/status - статус подключения WiFi
 * - POST /api/wifi/reset - сброс настроек WiFi
 * 
 * ====================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <SPIFFS.h>
#include <FS.h>

// ========== КОНФИГУРАЦИЯ ==========
// Настройки точки доступа для настройки WiFi
const char* ap_ssid = "ESP32-DMX-Setup";  // Имя точки доступа для настройки
const char* ap_password = "dmx123456";    // Пароль точки доступа (минимум 8 символов)

// Настройки WiFi (используются только если нет сохраненных настроек)
// ВРЕМЕННО для теста - потом будет удалено
const char* default_ssid = "Home";        // Название WiFi сети по умолчанию
const char* default_password = "123123123";                // Пароль от WiFi по умолчанию

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

// Переменные для WiFi настроек
Preferences preferences;
String saved_ssid = "";
String saved_password = "";
bool wifiConfigured = false;
bool isAPMode = false;

// ========== HTML ДЛЯ ВЕБ-ИНТЕРФЕЙСА (УЛУЧШЕННАЯ ВЕРСИЯ) ==========
#include "dmx-web-interface.h"
#include "dmx-equalizer-page.h"
const char* htmlPage = htmlPageImproved;

// ========== ФУНКЦИИ ДЛЯ РАБОТЫ С НАСТРОЙКАМИ WIFI ==========

// Загрузка сохраненных настроек WiFi
void loadWiFiConfig() {
  preferences.begin("wifi", false);
  saved_ssid = preferences.getString("ssid", "");
  saved_password = preferences.getString("password", "");
  preferences.end();
  
  if (saved_ssid.length() > 0) {
    Serial.println("[Config] Загружены сохраненные настройки WiFi:");
    Serial.printf("   SSID: %s\n", saved_ssid.c_str());
    Serial.printf("   Password: %s\n", saved_password.length() > 0 ? "***" : "(пустой)");
    wifiConfigured = true;
  } else {
    Serial.println("[Config] Сохраненные настройки WiFi не найдены");
    wifiConfigured = false;
  }
}

// Сохранение настроек WiFi
void saveWiFiConfig(String ssid, String password) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.end();
  
  saved_ssid = ssid;
  saved_password = password;
  wifiConfigured = true;
  
  Serial.println("[Config] Настройки WiFi сохранены");
}

// Подключение к WiFi
bool connectToWiFi(String ssid, String password) {
  Serial.println("[WiFi] ===== Подключение к WiFi =====");
  Serial.printf("[WiFi] SSID: %s\n", ssid.c_str());
  Serial.printf("[WiFi] Password длина: %d символов\n", password.length());
  
  // Отключаем AP если был включен
  WiFi.mode(WIFI_STA);
  delay(100);
  
  // Отключаемся от текущей сети если подключены
  WiFi.disconnect();
  delay(100);
  
  Serial.println("[WiFi] Начало подключения...");
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int attempts = 0;
  wl_status_t status = WiFi.status();
  
  while (status != WL_CONNECTED && attempts < 40) {
    delay(500);
    status = WiFi.status();
    
    // Выводим статус каждые 5 попыток
    if (attempts % 5 == 0) {
      const char* statusText = "";
      switch(status) {
        case WL_IDLE_STATUS: statusText = "IDLE"; break;
        case WL_NO_SSID_AVAIL: statusText = "NO_SSID"; break;
        case WL_SCAN_COMPLETED: statusText = "SCAN_COMPLETED"; break;
        case WL_CONNECTED: statusText = "CONNECTED"; break;
        case WL_CONNECT_FAILED: statusText = "CONNECT_FAILED"; break;
        case WL_CONNECTION_LOST: statusText = "CONNECTION_LOST"; break;
        case WL_DISCONNECTED: statusText = "DISCONNECTED"; break;
        default: statusText = "UNKNOWN"; break;
      }
      Serial.printf("[WiFi] Попытка %d/40, статус: %s\n", attempts, statusText);
    }
    
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    attempts++;
  }
  
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[OK] WiFi подключен успешно!");
    Serial.printf("[WiFi] IP адрес: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] MAC адрес: %s\n", WiFi.macAddress().c_str());
    Serial.printf("[WiFi] Сигнал: %d dBm\n", WiFi.RSSI());
    Serial.printf("[WiFi] Канал: %d\n", WiFi.channel());
    Serial.println("[WiFi] ===== Подключение успешно =====");
    isAPMode = false;
    return true;
  } else {
    Serial.println("[ERROR] Не удалось подключиться к WiFi");
    Serial.printf("[ERROR] Финальный статус: %d\n", WiFi.status());
    Serial.println("[ERROR] Возможные причины:");
    Serial.println("[ERROR]   - Неправильный пароль");
    Serial.println("[ERROR]   - Сеть недоступна (слишком далеко)");
    Serial.println("[ERROR]   - Неправильное название сети (SSID)");
    Serial.println("[WiFi] ===== Подключение не удалось =====");
    isAPMode = true;
    return false;
  }
}

// Запуск точки доступа для настройки
void startAPMode() {
  Serial.println("[AP] Запуск точки доступа для настройки...");
  
  WiFi.mode(WIFI_AP_STA);  // Режим AP+STA для возможности сканирования
  
  // Настройка статического IP для точки доступа
  IPAddress local_IP(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  
  // Запуск точки доступа с DHCP сервером
  WiFi.softAPConfig(local_IP, gateway, subnet);
  WiFi.softAP(ap_ssid, ap_password);
  
  // Настройка mDNS для режима AP (для доступа по имени)
  if (MDNS.begin("esp32-setup")) {
    Serial.println("[mDNS] mDNS запущен для режима настройки");
  }
  
  IPAddress IP = WiFi.softAPIP();
  Serial.println("========================================");
  Serial.println("[AP] Точка доступа запущена!");
  Serial.printf("[AP] SSID: %s\n", ap_ssid);
  Serial.printf("[AP] Password: %s\n", ap_password);
  Serial.printf("[AP] IP адрес: %s\n", IP.toString().c_str());
  Serial.println("[AP] Подключитесь к этой сети и откройте:");
  Serial.println("[AP]   http://192.168.4.1");
  Serial.println("[AP]   или http://esp32-setup.local");
  Serial.println("========================================");
  
  isAPMode = true;
  
  // Медленное мигание LED в режиме AP (индикация режима настройки)
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(300);
    digitalWrite(LED_PIN, LOW);
    delay(300);
  }
}

// Сканирование доступных WiFi сетей
String scanNetworks() {
  Serial.println("[WiFi] ===== НАЧАЛО СКАНИРОВАНИЯ СЕТЕЙ =====");
  
  wifi_mode_t currentMode = WiFi.getMode();
  Serial.printf("[WiFi] Текущий режим WiFi: %d (1=STA, 2=AP, 3=AP_STA)\n", currentMode);
  
  // В режиме AP_STA сканирование должно работать, но иногда нужно подождать
  // Очищаем предыдущие результаты сканирования
  WiFi.scanDelete();
  delay(200);
  
  // Запускаем асинхронное сканирование (true = async, true = showHidden)
  Serial.println("[WiFi] Запуск асинхронного сканирования...");
  int n = WiFi.scanNetworks(true, true);
  
  Serial.printf("[WiFi] Код запуска сканирования: %d\n", n);
  Serial.println("[WiFi] Ожидание завершения сканирования...");
  
  // Ждем завершения сканирования (максимум 10 секунд)
  int attempts = 0;
  while (n < 0 && attempts < 100) {
    delay(100);
    n = WiFi.scanComplete();
    if (attempts % 10 == 0) {
      Serial.printf("[WiFi] Ожидание... попытка %d/100\n", attempts);
    }
    attempts++;
  }
  
  Serial.printf("[WiFi] Результат сканирования: %d сетей\n", n);
  
  DynamicJsonDocument doc(16384);  // Увеличил размер для большого количества сетей
  JsonArray networks = doc.to<JsonArray>();
  
  if (n > 0) {
    Serial.printf("[WiFi] Обработка %d сетей...\n", n);
    for (int i = 0; i < n; i++) {
      JsonObject network = networks.createNestedObject();
      String ssid = WiFi.SSID(i);
      int rssi = WiFi.RSSI(i);
      wifi_auth_mode_t encryption = WiFi.encryptionType(i);
      int channel = WiFi.channel(i);
      
      // Проверяем, что SSID не пустой
      if (ssid.length() > 0) {
        network["ssid"] = ssid;
        network["rssi"] = rssi;
        network["encryption"] = (encryption == WIFI_AUTH_OPEN) ? "open" : "encrypted";
        network["channel"] = channel;
        
        Serial.printf("[WiFi] Сеть %d: %s (RSSI: %d, Channel: %d, Encrypted: %s)\n", 
                      i+1, ssid.c_str(), rssi, channel, 
                      (encryption == WIFI_AUTH_OPEN) ? "нет" : "да");
      } else {
        Serial.printf("[WiFi] Пропущена сеть %d (пустой SSID)\n", i+1);
      }
    }
    Serial.printf("[WiFi] Добавлено в JSON: %d сетей\n", networks.size());
  } else if (n == 0) {
    Serial.println("[WiFi] Сети не найдены (n=0)");
  } else {
    Serial.printf("[WiFi] Ошибка сканирования: код %d\n", n);
    Serial.println("[WiFi] Возможные причины:");
    Serial.println("[WiFi]   - Сканирование еще не завершено");
    Serial.println("[WiFi]   - Проблема с WiFi модулем");
  }
  
  String result;
  serializeJson(doc, result);
  Serial.printf("[WiFi] JSON размер: %d байт\n", result.length());
  if (result.length() > 0) {
    int previewLen = result.length() > 300 ? 300 : result.length();
    Serial.printf("[WiFi] JSON начало: %s\n", result.substring(0, previewLen).c_str());
  } else {
    Serial.println("[WiFi] JSON пустой!");
  }
  Serial.println("[WiFi] ===== СКАНИРОВАНИЕ ЗАВЕРШЕНО =====");
  
  return result;
}

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

// ========== ФУНКЦИИ ДЛЯ РАБОТЫ С ФАЙЛОВОЙ СИСТЕМОЙ ==========

// Инициализация SPIFFS
bool initSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] Ошибка монтирования файловой системы");
    return false;
  }
  Serial.println("[SPIFFS] Файловая система инициализирована");
  
  // Выводим информацию о файловой системе
  size_t totalBytes = SPIFFS.totalBytes();
  size_t usedBytes = SPIFFS.usedBytes();
  Serial.printf("[SPIFFS] Всего: %u байт, Использовано: %u байт, Свободно: %u байт\n", 
                totalBytes, usedBytes, totalBytes - usedBytes);
  
  return true;
}

// Чтение HTML файла из SPIFFS с fallback на константу
String readHTMLFile(const char* filename, const char* fallback) {
  if (SPIFFS.exists(filename)) {
    File file = SPIFFS.open(filename, "r");
    if (file) {
      String content = file.readString();
      file.close();
      Serial.printf("[SPIFFS] Загружен файл: %s (%d байт)\n", filename, content.length());
      return content;
    }
  }
  Serial.printf("[SPIFFS] Файл %s не найден, используется константа\n", filename);
  return String(fallback);
}

// Сохранение HTML файла в SPIFFS
bool saveHTMLFile(const char* filename, const String& content) {
  File file = SPIFFS.open(filename, "w");
  if (!file) {
    Serial.printf("[SPIFFS] Ошибка создания файла: %s\n", filename);
    return false;
  }
  
  size_t written = file.print(content);
  file.close();
  
  if (written == content.length()) {
    Serial.printf("[SPIFFS] Файл сохранен: %s (%d байт)\n", filename, written);
    return true;
  } else {
    Serial.printf("[SPIFFS] Ошибка записи файла: %s (записано %d из %d)\n", filename, written, content.length());
    return false;
  }
}

// ========== HTTP API HANDLERS ==========

void handleRoot() {
  String html = readHTMLFile("/index.html", htmlPage);
  server.send(200, "text/html", html);
}

void handleEqualizer() {
  String html = readHTMLFile("/equalizer.html", htmlEqualizerPage);
  server.send(200, "text/html", html);
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

// Глобальная переменная для хранения файла во время загрузки
File uploadFile;
bool uploadInProgress = false;
bool uploadResponseSent = false;

// Обработчик загрузки файлов
void handleFileUpload() {
  HTTPUpload& upload = server.upload();
  
  if (upload.status == UPLOAD_FILE_START) {
    uploadInProgress = true;
    uploadResponseSent = false;
    String filename = upload.filename;
    if (!filename.startsWith("/")) {
      filename = "/" + filename;
    }
    Serial.printf("[Upload] Начало загрузки: %s\n", filename.c_str());
    
    // Открываем файл для записи
    uploadFile = SPIFFS.open(filename, "w");
    if (!uploadFile) {
      Serial.printf("[Upload] Ошибка создания файла: %s\n", filename.c_str());
    }
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadFile) {
      size_t written = uploadFile.write(upload.buf, upload.currentSize);
      if (written != upload.currentSize) {
        Serial.printf("[Upload] Ошибка записи: записано %d из %d\n", written, upload.currentSize);
      }
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    uploadInProgress = false;
    
    // Отправляем ответ только один раз
    if (!uploadResponseSent) {
      uploadResponseSent = true;
      
      if (uploadFile) {
        uploadFile.close();
        Serial.printf("[Upload] Загрузка завершена: %s (%d байт)\n", upload.filename.c_str(), upload.totalSize);
        
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["filename"] = "/" + String(upload.filename);
        doc["size"] = upload.totalSize;
        
        String response;
        serializeJson(doc, response);
        
        // Отправляем ответ (ESP32 WebServer автоматически добавит Content-Length)
        server.sendHeader("Connection", "close");
        server.send(200, "application/json", response);
      } else {
        DynamicJsonDocument doc(512);
        doc["success"] = false;
        doc["error"] = "Не удалось создать файл";
        
        String response;
        serializeJson(doc, response);
        
        server.sendHeader("Connection", "close");
        server.send(500, "application/json", response);
      }
    }
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    uploadInProgress = false;
    if (uploadFile) {
      uploadFile.close();
    }
    Serial.println("[Upload] Загрузка прервана");
  }
}

// Список файлов
void handleFileList() {
  DynamicJsonDocument doc(2048);
  JsonArray files = doc.createNestedArray("files");
  
  File root = SPIFFS.open("/");
  File file = root.openNextFile();
  
  while (file) {
    JsonObject fileObj = files.createNestedObject();
    fileObj["name"] = String(file.name());
    fileObj["size"] = file.size();
    file = root.openNextFile();
  }
  
  doc["success"] = true;
  doc["count"] = files.size();
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Удаление файла
void handleFileDelete() {
  if (server.hasArg("plain")) {
    DynamicJsonDocument doc(512);
    deserializeJson(doc, server.arg("plain"));
    
    String filename = doc["filename"].as<String>();
    if (!filename.startsWith("/")) {
      filename = "/" + filename;
    }
    
    if (SPIFFS.exists(filename)) {
      if (SPIFFS.remove(filename)) {
        DynamicJsonDocument response(256);
        response["success"] = true;
        response["message"] = "Файл удален";
        
        String respStr;
        serializeJson(response, respStr);
        server.send(200, "application/json", respStr);
        Serial.printf("[Files] Файл удален: %s\n", filename.c_str());
      } else {
        server.send(500, "application/json", "{\"success\":false,\"error\":\"Ошибка удаления файла\"}");
      }
    } else {
      server.send(404, "application/json", "{\"success\":false,\"error\":\"Файл не найден\"}");
    }
  } else {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Не указан filename\"}");
  }
}

// Страница для загрузки файлов
void handleUploadPage() {
  String html = R"HTML(
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Загрузка файлов - ESP32 DMX</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;background:#1a1a1a;color:#fff;padding:20px}
        .container{max-width:800px;margin:0 auto}
        .header{text-align:center;margin-bottom:30px}
        .card{background:#2a2a2a;padding:20px;border-radius:10px;margin-bottom:20px;border:2px solid #444}
        .card h2{color:#00ff00;margin-bottom:15px}
        .upload-area{border:3px dashed #00ff00;border-radius:10px;padding:30px;text-align:center;cursor:pointer;transition:all 0.3s}
        .upload-area:hover{background:#333;border-color:#00cc00}
        .upload-area.dragover{background:#2a4a2a;border-color:#00ff00}
        input[type="file"]{display:none}
        button{background:#00ff00;color:#000;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;font-weight:bold;margin:5px}
        button:hover{background:#00cc00}
        .btn-danger{background:#ff4444;color:#fff}
        .btn-danger:hover{background:#cc0000}
        .file-list{margin-top:20px}
        .file-item{background:#1a1a1a;padding:10px;border-radius:5px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;border:1px solid #444}
        .file-name{font-weight:bold;color:#00ff00}
        .file-size{color:#888;font-size:12px}
        .status{background:#2a2a2a;padding:10px;border-radius:5px;margin-bottom:15px;font-size:12px}
        .status.success{border-left:4px solid #00ff00}
        .status.error{border-left:4px solid #ff4444}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📤 Загрузка файлов веб-интерфейса</h1>
            <p>Обновите HTML страницы без перепрошивки</p>
        </div>
        
        <div class="card">
            <h2>📤 Загрузить файл</h2>
            <div class="upload-area" id="upload-area" onclick="document.getElementById('file-input').click()">
                <p>Нажмите или перетащите файл сюда</p>
                <p style="font-size:12px;color:#888;margin-top:10px">
                    Поддерживаемые файлы: index.html, equalizer.html
                </p>
            </div>
            <input type="file" id="file-input" accept=".html">
            <div id="status"></div>
        </div>
        
        <div class="card">
            <h2>📁 Загруженные файлы</h2>
            <button onclick="loadFileList()">Обновить список</button>
            <div class="file-list" id="file-list">
                <p>Загрузка...</p>
            </div>
        </div>
        
        <div class="card">
            <h2>ℹ️ Информация</h2>
            <p style="font-size:12px;line-height:1.6">
                <strong>Как использовать:</strong><br>
                1. Экспортируйте HTML код из dmx-web-interface.h или dmx-equalizer-page.h<br>
                2. Сохраните как index.html или equalizer.html<br>
                3. Загрузите файл через форму выше<br>
                4. Страница будет обновлена без перепрошивки ESP32<br><br>
                <strong>Важно:</strong> Если файл не загружен, используется версия из прошивки (fallback)
            </p>
        </div>
    </div>
    
    <script>
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const statusDiv = document.getElementById('status');
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                uploadFile(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadFile(e.target.files[0]);
            }
        });
        
        async function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            
            showStatus('Загрузка файла ' + file.name + '...', 'info');
            
            try {
                const response = await fetch('/api/files/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showStatus('Файл успешно загружен: ' + data.filename + ' (' + data.size + ' байт)', 'success');
                    loadFileList();
                } else {
                    showStatus('Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'error');
                }
            } catch (error) {
                showStatus('Ошибка: ' + error.message, 'error');
            }
        }
        
        async function loadFileList() {
            try {
                const response = await fetch('/api/files/list');
                const data = await response.json();
                
                if (data.success) {
                    const listDiv = document.getElementById('file-list');
                    if (data.files.length === 0) {
                        listDiv.innerHTML = '<p style="color:#888">Нет загруженных файлов</p>';
                    } else {
                        listDiv.innerHTML = data.files.map(file => `
                            <div class="file-item">
                                <div>
                                    <div class="file-name">${file.name}</div>
                                    <div class="file-size">${file.size} байт</div>
                                </div>
                                <button class="btn-danger" onclick="deleteFile('${file.name}')">Удалить</button>
                            </div>
                        `).join('');
                    }
                }
            } catch (error) {
                document.getElementById('file-list').innerHTML = '<p style="color:#ff4444">Ошибка загрузки списка</p>';
            }
        }
        
        async function deleteFile(filename) {
            if (!confirm('Удалить файл ' + filename + '?')) return;
            
            try {
                const response = await fetch('/api/files/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({filename: filename})
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showStatus('Файл удален', 'success');
                    loadFileList();
                } else {
                    showStatus('Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'error');
                }
            } catch (error) {
                showStatus('Ошибка: ' + error.message, 'error');
            }
        }
        
        function showStatus(message, type) {
            statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 5000);
        }
        
        loadFileList();
    </script>
</body>
</html>
)HTML";
  
  server.send(200, "text/html", html);
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

// ========== API ДЛЯ НАСТРОЙКИ WIFI ==========

// Сканирование сетей
void handleScanNetworks() {
  Serial.println("\n[API] ===== ЗАПРОС НА СКАНИРОВАНИЕ СЕТЕЙ =====");
  
  // Проверяем режим WiFi
  wifi_mode_t currentMode = WiFi.getMode();
  Serial.printf("[API] Текущий режим WiFi: %d (0=OFF, 1=STA, 2=AP, 3=AP_STA)\n", currentMode);
  
  // В режиме AP_STA сканирование должно работать
  // Убеждаемся, что мы в режиме AP_STA
  if (currentMode == WIFI_AP) {
    Serial.println("[API] Переключение в режим AP_STA для сканирования");
    WiFi.mode(WIFI_AP_STA);
    delay(500);  // Даем время на переключение режима
  } else if (currentMode != WIFI_AP_STA && currentMode != WIFI_STA) {
    Serial.println("[API] Переключение в режим AP_STA");
    WiFi.mode(WIFI_AP_STA);
    delay(500);
  }
  
  String networks = scanNetworks();
  
  Serial.printf("[API] Отправка результата клиенту (размер: %d байт)\n", networks.length());
  
  // Отправляем ответ с правильными заголовками
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Content-Type", "application/json; charset=utf-8");
  server.setContentLength(networks.length());
  server.send(200, "application/json", networks);
  
  Serial.println("[API] ===== СКАНИРОВАНИЕ ЗАВЕРШЕНО =====");
}

// Сохранение настроек WiFi
void handleSaveWiFi() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    String ssid = doc["ssid"].as<String>();
    String password = doc["password"].as<String>();
    
    if (ssid.length() == 0) {
      server.send(400, "application/json", "{\"error\":\"SSID не может быть пустым\"}");
      return;
    }
    
    Serial.println("[API] ===== Сохранение настроек WiFi =====");
    Serial.printf("[API] SSID: %s\n", ssid.c_str());
    Serial.printf("[API] Password длина: %d\n", password.length());
    
    // Сохраняем настройки
    saveWiFiConfig(ssid, password);
    Serial.println("[API] Настройки сохранены в EEPROM");
    
    // Пытаемся подключиться
    Serial.println("[API] Попытка подключения к WiFi...");
    if (connectToWiFi(ssid, password)) {
      // Настройка mDNS после успешного подключения
      const char* mdnsHostname = "esp32-dmx";
      if (MDNS.begin(mdnsHostname)) {
        Serial.println("[mDNS] mDNS запущен");
      }
      
      // Настройка OTA
      ArduinoOTA.setHostname("esp32-dmx");
      if (strlen(ota_password) > 0) {
        ArduinoOTA.setPassword(ota_password);
      }
      ArduinoOTA.begin();
      
      DynamicJsonDocument response(512);
      response["success"] = true;
      response["message"] = "WiFi настроен успешно";
      response["ip"] = WiFi.localIP().toString();
      response["ssid"] = ssid;
      response["instruction"] = "Отключитесь от точки доступа ESP32 и подключитесь к сети: " + ssid;
      
      String responseStr;
      serializeJson(response, responseStr);
      server.send(200, "application/json", responseStr);
      
      // Перезагрузка через 3 секунды для применения настроек
      delay(3000);
      ESP.restart();
    } else {
      server.send(500, "application/json", "{\"error\":\"Не удалось подключиться к WiFi. Проверьте пароль.\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"Отсутствуют данные\"}");
  }
}

// Получение текущего статуса WiFi
void handleWiFiStatus() {
  DynamicJsonDocument doc(512);
  doc["connected"] = (WiFi.status() == WL_CONNECTED);
  doc["ap_mode"] = isAPMode;
  
  if (WiFi.status() == WL_CONNECTED) {
    doc["ssid"] = WiFi.SSID();
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
  } else {
    doc["ap_ip"] = WiFi.softAPIP().toString();
  }
  
  doc["saved_ssid"] = saved_ssid;
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Сброс настроек WiFi (возврат в режим настройки)
void handleResetWiFi() {
  Serial.println("[API] ===== СБРОС НАСТРОЕК WIFI =====");
  
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.end();
  
  saved_ssid = "";
  saved_password = "";
  wifiConfigured = false;
  
  Serial.println("[API] Настройки WiFi удалены из EEPROM");
  Serial.println("[API] ESP32 перезагрузится и запустит точку доступа");
  
  DynamicJsonDocument response(256);
  response["success"] = true;
  response["message"] = "Настройки сброшены. ESP32 перезагружается...";
  
  String responseStr;
  serializeJson(response, responseStr);
  server.send(200, "application/json", responseStr);
  
  delay(2000);  // Даем время на отправку ответа
  ESP.restart();
}

// HTML страница для настройки WiFi
const char* wifiSetupPage = R"WIFI_SETUP_PAGE(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Настройка WiFi - ESP32 DMX</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .status.info { background: #e3f2fd; color: #1976d2; }
        .status.success { background: #e8f5e9; color: #388e3c; }
        .status.error { background: #ffebee; color: #c62828; }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        select, input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        select:focus, input:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102,126,234,0.4); }
        button:active { transform: translateY(0); }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        .scan-btn {
            background: #4caf50;
            margin-bottom: 15px;
        }
        .networks-list {
            max-height: 200px;
            overflow-y: auto;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            margin-bottom: 15px;
        }
        .network-item {
            padding: 12px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: background 0.2s;
        }
        .network-item:hover { background: #f5f5f5; }
        .network-item:last-child { border-bottom: none; }
        .network-ssid { font-weight: 600; color: #333; }
        .network-info { font-size: 12px; color: #666; margin-top: 4px; }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .rssi-bar {
            display: inline-block;
            width: 60px;
            height: 4px;
            background: #e0e0e0;
            border-radius: 2px;
            margin-left: 10px;
            position: relative;
        }
        .rssi-bar::after {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            background: #4caf50;
            border-radius: 2px;
            width: var(--rssi-width);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Настройка WiFi</h1>
        <p class="subtitle">Выберите сеть для подключения ESP32</p>
        
        <div id="status"></div>
        
        <div class="form-group">
            <button class="scan-btn" id="scanBtn">Сканировать сети</button>
            <div id="networks" class="networks-list" style="display:none;"></div>
        </div>
        
        <form id="wifiForm" onsubmit="saveWiFi(event)">
            <div class="form-group">
                <label>Название сети (SSID):</label>
                <input type="text" id="ssid" name="ssid" required placeholder="Выберите сеть из списка или введите вручную">
            </div>
            
            <div class="form-group">
                <label>Пароль:</label>
                <input type="password" id="password" name="password" placeholder="Введите пароль сети">
            </div>
            
            <button type="submit">Сохранить и подключиться</button>
        </form>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <button onclick="resetWiFi()" style="background: #f44336;">Сбросить настройки WiFi</button>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">
                После сброса ESP32 перезагрузится и запустит точку доступа для настройки
            </p>
        </div>
    </div>
    
    <script>
        // Проверка загрузки скрипта
        console.log("WiFi setup script loaded");
        
        function showStatus(message, type) {
            const status = document.getElementById("status");
            status.className = "status " + type;
            status.innerHTML = message;
        }
        
        async function scanNetworks(event) {
            console.log("scanNetworks called");
            showStatus("Сканирование сетей... Подождите 10-15 секунд", "info");
            const btn = event ? event.target : document.getElementById("scanBtn");
            btn.disabled = true;
            
            try {
                console.log("Отправка запроса на /api/wifi/scan");
                const response = await fetch("/api/wifi/scan");
                console.log("Получен ответ, статус:", response.status);
                
                if (!response.ok) {
                    throw new Error("HTTP " + response.status + ": " + response.statusText);
                }
                
                const responseText = await response.text();
                console.log("Ответ сервера (первые 500 символов):", responseText.substring(0, 500));
                
                let networks;
                try {
                    networks = JSON.parse(responseText);
                    console.log("JSON распарсен успешно, тип:", typeof networks);
                    console.log("Это массив?", Array.isArray(networks));
                    console.log("Количество сетей:", networks.length);
                } catch (parseError) {
                    console.error("Ошибка парсинга JSON:", parseError);
                    console.error("Ответ сервера:", responseText);
                    throw new Error("Неверный формат ответа от сервера: " + parseError.message);
                }
                
                const networksDiv = document.getElementById("networks");
                networksDiv.style.display = "block";
                networksDiv.innerHTML = "";
                
                if (!Array.isArray(networks)) {
                    console.error("Ответ не является массивом:", networks);
                    showStatus("Ошибка: сервер вернул неверный формат данных", "error");
                    btn.disabled = false;
                    return;
                }
                
                if (networks.length === 0) {
                    networksDiv.innerHTML = "<div class=\"loading\">Сети не найдены. Проверьте, что WiFi роутер включен и находится рядом.</div>";
                    showStatus("Сети не найдены. Попробуйте ввести название сети вручную.", "info");
                } else {
                    console.log("Отображение " + networks.length + " сетей");
                    networks.forEach((network, index) => {
                        console.log("Сеть " + (index + 1) + ":", network);
                        const item = document.createElement("div");
                        item.className = "network-item";
                        item.onclick = () => {
                            document.getElementById("ssid").value = network.ssid || "";
                            document.getElementById("password").focus();
                        };
                        
                        const rssi = network.rssi || -100;
                        const rssiPercent = Math.min(100, Math.max(0, (rssi + 100) * 2));
                        const encryptionText = network.encryption === "encrypted" ? "Защищено" : "Открыто";
                        const ssid = network.ssid || "Без названия";
                        
                        item.innerHTML = "<div class=\"network-ssid\">" + ssid + "</div>" +
                            "<div class=\"network-info\">" +
                            "Сигнал: " + rssi + " dBm " +
                            "<span class=\"rssi-bar\" style=\"--rssi-width: " + rssiPercent + "%\"></span> " +
                            encryptionText +
                            "</div>";
                        networksDiv.appendChild(item);
                    });
                    showStatus("Найдено сетей: " + networks.length, "success");
                }
            } catch (error) {
                console.error("Ошибка сканирования:", error);
                showStatus("Ошибка сканирования: " + error.message + ". Проверьте консоль браузера (F12).", "error");
            } finally {
                btn.disabled = false;
            }
        }
        
        async function saveWiFi(event) {
            event.preventDefault();
            
            const ssid = document.getElementById("ssid").value;
            const password = document.getElementById("password").value;
            
            if (!ssid) {
                showStatus("Введите название сети", "error");
                return;
            }
            
            showStatus("Подключение к сети...", "info");
            const btn = event.target.querySelector("button[type=\"submit\"]");
            btn.disabled = true;
            
            try {
                const response = await fetch("/api/wifi/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ssid, password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const instruction = "WiFi настроен успешно!<br><br>" +
                        "<strong>Важно:</strong><br>" +
                        "1. ESP32 перезагружается и подключается к сети: <strong>" + result.ssid + "</strong><br>" +
                        "2. <strong>Отключитесь</strong> от точки доступа \"ESP32-DMX-Setup\"<br>" +
                        "3. <strong>Подключитесь</strong> к сети: <strong>" + result.ssid + "</strong><br>" +
                        "4. После подключения откройте: <strong>http://" + result.ip + "</strong> или <strong>http://esp32-dmx.local</strong>";
                    
                    showStatus(instruction, "success");
                    
                    let countdown = 5;
                    const countdownInterval = setInterval(() => {
                        countdown--;
                        if (countdown > 0) {
                            document.getElementById("status").innerHTML = instruction + "<br><br>Перезагрузка через " + countdown + " секунд...";
                        } else {
                            clearInterval(countdownInterval);
                            document.getElementById("status").innerHTML = instruction + "<br><br>ESP32 перезагружается. Подключитесь к сети " + result.ssid + " и откройте http://esp32-dmx.local";
                        }
                    }, 1000);
                } else {
                    showStatus("Ошибка: " + (result.error || "Неизвестная ошибка"), "error");
                    btn.disabled = false;
                }
            } catch (error) {
                showStatus("Ошибка: " + error.message, "error");
                btn.disabled = false;
            }
        }
        
        // Привязка обработчика кнопки сканирования
        document.addEventListener("DOMContentLoaded", function() {
            const scanBtn = document.getElementById("scanBtn");
            if (scanBtn) {
                scanBtn.addEventListener("click", scanNetworks);
                console.log("Scan button event listener attached");
            } else {
                console.error("Scan button not found!");
            }
        });
        
        async function resetWiFi() {
            if (!confirm("Вы уверены, что хотите сбросить настройки WiFi? ESP32 перезагрузится и запустит точку доступа.")) {
                return;
            }
            
            showStatus("Сброс настроек WiFi...", "info");
            
            try {
                const response = await fetch("/api/wifi/reset", {
                    method: "POST"
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus("Настройки сброшены. ESP32 перезагружается... Подключитесь к сети ESP32-DMX-Setup через 10 секунд.", "success");
                } else {
                    showStatus("Ошибка сброса: " + (result.error || "Неизвестная ошибка"), "error");
                }
            } catch (error) {
                showStatus("Ошибка: " + error.message, "error");
            }
        }
        
        window.addEventListener("load", async () => {
            try {
                const response = await fetch("/api/wifi/status");
                const status = await response.json();
                
                if (status.connected) {
                    showStatus("Подключено к: " + status.ssid + " (" + status.ip + ")<br><br>Для изменения настроек WiFi используйте кнопку \"Сбросить настройки WiFi\" ниже.", "success");
                } else if (status.ap_mode) {
                    showStatus("Режим настройки. IP точки доступа: " + status.ap_ip, "info");
                    const instruction = document.createElement("div");
                    instruction.className = "status info";
                    instruction.innerHTML = "<strong>Инструкция:</strong><br>" +
                        "1. Подключитесь к WiFi сети: <strong>ESP32-DMX-Setup</strong><br>" +
                        "2. Пароль: <strong>dmx123456</strong><br>" +
                        "3. Откройте: <strong>http://" + status.ap_ip + "</strong> или <strong>http://esp32-setup.local</strong>";
                    document.getElementById("status").parentNode.insertBefore(instruction, document.getElementById("status").nextSibling);
                }
                
                if (status.saved_ssid) {
                    document.getElementById("ssid").value = status.saved_ssid;
                }
            } catch (error) {
                console.error("Ошибка проверки статуса:", error);
            }
        });
    </script>
</body>
</html>
)WIFI_SETUP_PAGE";

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
  
  // Инициализация файловой системы SPIFFS
  initSPIFFS();
  
  // Загрузка сохраненных настроек WiFi
  loadWiFiConfig();
  
  // Попытка подключения к WiFi
  // ВАЖНО: Подключаемся ТОЛЬКО если есть сохраненные настройки
  // Не используем default_ssid для автоматического подключения
  bool connected = false;
  
  if (saved_ssid.length() > 0) {
    Serial.printf("[WiFi] Попытка подключения к сохраненной сети: %s\n", saved_ssid.c_str());
    connected = connectToWiFi(saved_ssid, saved_password);
  } else {
    Serial.println("[WiFi] Сохраненные настройки WiFi не найдены");
    Serial.println("[WiFi] Запуск режима настройки (точка доступа)");
  }
  
  // Если не удалось подключиться или нет сохраненных настроек, запускаем режим точки доступа
  if (!connected) {
    startAPMode();
  }
  
  // Настройка mDNS (только если подключены)
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    Serial.println("========================================");
    Serial.println("[WiFi] ПОДКЛЮЧЕНО К WIFI!");
    Serial.printf("[WiFi] SSID: %s\n", WiFi.SSID().c_str());
    Serial.printf("[WiFi] IP адрес: %s\n", ip.toString().c_str());
    Serial.printf("[WiFi] MAC адрес: %s\n", WiFi.macAddress().c_str());
    Serial.printf("[WiFi] Сигнал: %d dBm\n", WiFi.RSSI());
    
    const char* mdnsHostname = "esp32-dmx";
    if (MDNS.begin(mdnsHostname)) {
      Serial.println("[mDNS] mDNS запущен");
      Serial.print("[mDNS] Доступен по адресу: http://");
      Serial.print(mdnsHostname);
      Serial.println(".local");
      Serial.print("[mDNS] Или по IP: http://");
      Serial.println(ip.toString());
    } else {
      Serial.println("[mDNS] Ошибка запуска mDNS!");
      Serial.println("[mDNS] Используйте IP адрес: http://" + ip.toString());
    }
    Serial.println("========================================");
    
    // Быстрое мигание при успешном подключении
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
  }
  
  // Настройка OTA (используем то же имя хоста, что и для mDNS)
  ArduinoOTA.setHostname("esp32-dmx");
  
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
  server.on("/wifi-setup", []() {
    size_t pageLength = strlen(wifiSetupPage);
    Serial.printf("[HTTP] Отправка страницы wifi-setup, размер: %d байт\n", pageLength);
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.sendHeader("Pragma", "no-cache");
    server.sendHeader("Expires", "0");
    server.setContentLength(pageLength);
    server.send(200, "text/html; charset=utf-8");
    server.sendContent(wifiSetupPage);
  });
  server.on("/equalizer", handleEqualizer);
  
  // API для загрузки HTML файлов
  // POST обработчик пустой - ответ отправляется ТОЛЬКО в handleFileUpload при UPLOAD_FILE_END
  server.on("/api/files/upload", HTTP_POST, []() {
    // Не отправляем ответ здесь - ESP32 WebServer вызовет handleFileUpload для обработки загрузки
    // Ответ будет отправлен в handleFileUpload при статусе UPLOAD_FILE_END
  }, handleFileUpload);
  
  server.on("/api/files/list", HTTP_GET, handleFileList);
  server.on("/api/files/delete", HTTP_POST, handleFileDelete);
  server.on("/api/files/upload-page", HTTP_GET, handleUploadPage);
  server.on("/api/status", handleStatus);
  
  // API для настройки WiFi
  server.on("/api/wifi/scan", handleScanNetworks);
  server.on("/api/wifi/save", HTTP_POST, handleSaveWiFi);
  server.on("/api/wifi/status", handleWiFiStatus);
  server.on("/api/wifi/reset", HTTP_POST, handleResetWiFi);
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
  if (isAPMode) {
    Serial.println("[HTTP] Режим настройки WiFi: http://192.168.4.1/wifi-setup");
  } else {
    Serial.println("[HTTP] Веб-интерфейс: http://esp32-dmx.local");
    Serial.println("[HTTP] Эквалайзер: http://esp32-dmx.local/equalizer");
    Serial.println("[HTTP] Загрузка файлов: http://esp32-dmx.local/api/files/upload-page");
  }
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
  
  if (isAPMode) {
    Serial.println("РЕЖИМ НАСТРОЙКИ WIFI:");
    Serial.println("1. Подключитесь к WiFi сети: ESP32-DMX-Setup");
    Serial.println("2. Пароль: dmx123456");
    Serial.println("3. Откройте: http://192.168.4.1/wifi-setup");
    Serial.println("4. Выберите сеть и введите пароль");
    Serial.println("5. После настройки переключите ноутбук на выбранную сеть");
    Serial.println();
  } else {
    Serial.println("УПРАВЛЕНИЕ:");
    Serial.println("1. Веб-пульт: http://localhost:3000/dmx-control.html");
    Serial.println("2. Прямое управление: http://esp32-dmx.local");
    Serial.println("   Или по IP: http://" + WiFi.localIP().toString());
    Serial.println("3. Эквалайзер с командами: http://esp32-dmx.local/equalizer");
    Serial.println("4. Загрузка файлов интерфейса: http://esp32-dmx.local/api/files/upload-page");
    Serial.println("5. OTA обновления: http://esp32-dmx.local/update");
    Serial.println("   Или по IP: http://" + WiFi.localIP().toString() + "/update");
    Serial.println("4. Настройка WiFi: http://esp32-dmx.local/wifi-setup");
    Serial.println();
  }
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
  // MDNS.update() не требуется в ESP32 - mDNS работает автоматически после MDNS.begin()
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



