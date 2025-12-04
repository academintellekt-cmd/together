# ESP32 DMX Controller

## 📁 Структура папки

- **`dmx-controller-ota/dmx-controller-ota.ino`** - Единственная прошивка для ESP32 (загружайте эту!)
- **`README_FIRMWARE.md`** - Подробная инструкция по использованию прошивки
- **`CONNECTION_DIAGRAM.md`** - Схема подключения ESP32 + MAX485 + DMX
- **`data.docx`** - Документация прожектора LM70S (карта каналов)

## 🚀 Быстрый старт

1. Откройте `dmx-controller-ota/dmx-controller-ota.ino` в Arduino IDE
2. Настройте WiFi (строки 73-74)
3. Загрузите в ESP32
4. Используйте веб-пульт: http://localhost:3000/dmx-control.html

Подробности в `README_FIRMWARE.md`

