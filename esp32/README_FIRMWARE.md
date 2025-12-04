# ESP32 DMX Controller - Универсальная прошивка

## 📌 КАКУЮ ПРОШИВКУ ЗАЛИВАТЬ?

**ЕДИНСТВЕННАЯ ПРОШИВКА:** `dmx-controller-ota/dmx-controller-ota.ino`

Эта прошивка содержит ВСЕ функции:
- ✅ Управление 14 RGB DMX прожекторами
- ✅ Интеграция с веб-пультом
- ✅ OTA обновления
- ✅ Веб-интерфейс для прямого управления
- ✅ Все пресеты и эффекты
- ✅ Статус подключения

## 🚀 БЫСТРЫЙ СТАРТ

1. **Откройте прошивку:**
   ```
   esp32/dmx-controller-ota/dmx-controller-ota.ino
   ```

2. **Настройте WiFi** (строки 36-37):
   ```cpp
   const char* ssid = "ВАШ_WIFI_SSID";
   const char* password = "ВАШ_ПАРОЛЬ";
   ```

3. **Загрузите в ESP32** через Arduino IDE

4. **Проверьте IP адрес** в Serial Monitor (115200 baud)

5. **Используйте:**
   - Веб-пульт: http://localhost:3000/dmx-control.html
   - Прямое управление: http://[IP_ESP32]
   - OTA обновления: http://[IP_ESP32]/update

## 📡 ПОДКЛЮЧЕНИЕ

### MAX485 к ESP32:
- DI → GPIO13
- DE+RE → GPIO14
- VCC → 5V
- GND → GND

### MAX485 к DMX (XLR-3):
- A → Pin 2 (Data+)
- B → Pin 3 (Data-)
- GND → Pin 1 (GND)

## 🎮 УПРАВЛЕНИЕ

### 14 RGB прожекторов:
- Игрок 0: каналы 1, 2, 3 (R, G, B)
- Игрок 1: каналы 4, 5, 6 (R, G, B)
- Игрок 2: каналы 7, 8, 9 (R, G, B)
- ... до игрока 13 (каналы 40, 41, 42)

### Пресеты:
- all-off - все выключено
- all-white - все белое
- rainbow - радуга
- pulse-green - пульсация зеленого
- pulse-red - пульсация красного
- wave-forward/wave-backward - волны
- stage-bright/stage-soft/stage-dynamic - сцена
- final-show - финальное шоу

## ⚙️ НАСТРОЙКИ

В начале файла прошивки можно изменить:
- WiFi SSID и пароль
- OTA пароль (для безопасности)
- TEST_MODE (true = без реального DMX, только логирование)

## 📝 ПРИМЕЧАНИЯ

- Для первой загрузки нужен USB кабель
- После первой загрузки можно обновлять через WiFi (OTA)
- Если цвета не меняются, поменяйте местами A и B на MAX485
- IP адрес ESP32 будет показан в Serial Monitor после подключения к WiFi

