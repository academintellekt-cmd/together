# 🚀 Быстрый старт ESP32 DMX Controller

Краткая инструкция для быстрого начала работы.

## ⚡ За 5 минут

### 1. Подготовка (2 минуты)

1. **Откройте Arduino IDE**
2. **Установите поддержку ESP32** (если еще не установлено):
   - File → Preferences → Additional Board Manager URLs
   - Добавьте: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → найдите "esp32" → Install

3. **Установите библиотеку ArduinoJson** (ОБЯЗАТЕЛЬНО!):
   - Tools → Manage Libraries → найдите "ArduinoJson" → Install (версия 6.x)
   - Если не нашли, см. подробную инструкцию: `esp32/INSTALL_LIBRARIES.md`

### 2. Настройка WiFi (1 минута)

1. Откройте файл `esp32/dmx-controller.ino`
2. Найдите строки около 20-й строки:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Замените на ваши данные WiFi

### 3. Прошивка (2 минуты)

1. **Подключите ESP32 через USB**
2. В Arduino IDE:
   - **Tools → Board → ESP32 Arduino → ESP32 Dev Module**
   - **Tools → Port → [выберите ваш COM порт]**
3. Нажмите **Upload** (стрелка вправо)
4. Если зависло на "Connecting...", нажмите и удерживайте кнопку **BOOT** на ESP32
5. Откройте **Serial Monitor** (Tools → Serial Monitor, скорость 115200)

### 4. Проверка

В Serial Monitor вы увидите:
```
✅ WiFi подключен!
📱 IP адрес: 192.168.1.XXX
```

**Запишите IP адрес!**

### 5. Тестирование

1. Откройте браузер: `http://[IP_ESP32]`
2. Вы увидите веб-интерфейс с визуализацией каналов
3. Попробуйте кнопку "✨ Тестовый паттерн"

### 6. Интеграция с Node.js

1. Откройте `server/dmx/dmx-config.json`
2. Измените:
   ```json
   {
     "interface": {
       "type": "esp32",
       "host": "192.168.1.XXX",
       "port": 80
     }
   }
   ```
   (Замените XXX на IP вашего ESP32)

3. Установите зависимость:
   ```bash
   npm install axios
   ```

4. Запустите сервер:
   ```bash
   npm start
   ```

5. Откройте: `http://localhost:3000/dmx-control.html`

## ✅ Готово!

Теперь вы можете управлять DMX через ESP32!

## 🔧 Подключение MAX485 (когда будет DMX оборудование)

```
MAX485 → ESP32:
- VCC → 3.3V
- GND → GND
- DI → GPIO0
- DE+RE → GPIO2
- RO → GPIO15 (не используется)

MAX485 → DMX:
- A (A+) → DMX Data+ (Pin 2)
- B (B-) → DMX Data- (Pin 3)
- GND → DMX GND (Pin 1)
```

После подключения измените в коде:
```cpp
#define TEST_MODE false
```

И загрузите прошивку заново.

---

**Подробная инструкция:** см. `esp32/README.md`

