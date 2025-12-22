# 🌐 Настройка автозапуска браузера на станциях

Инструкция по настройке автоматического запуска браузера с нужной страницей при включении станции.

## 📋 Общая информация

Станции работают **БЕЗ локальных файлов** - все страницы загружаются с центрального сервера:
```
http://<IP_СЕРВЕРА>:3000/station.html
```

Например, если сервер на `192.168.1.10`:
```
http://192.168.1.10:3000/station.html
```

## 🪟 Windows

### Способ 1: Автозапуск через папку "Автозагрузка" (рекомендуется)

1. **Создайте ярлык браузера:**
   - Правой кнопкой на рабочем столе → Создать → Ярлык
   - Укажите путь к браузеру и URL:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=http://192.168.1.10:3000/station.html
   ```
   Или для Edge:
   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --app=http://192.168.1.10:3000/station.html
   ```

2. **Скопируйте ярлык в папку автозагрузки:**
   - Нажмите `Win + R`
   - Введите: `shell:startup`
   - Скопируйте ярлык в открывшуюся папку

3. **Настройте браузер:**
   - `--kiosk` - полноэкранный режим без панелей
   - `--app=URL` - режим приложения (без адресной строки)

### Способ 2: Через планировщик заданий

1. Откройте **Планировщик заданий** (`taskschd.msc`)
2. Создайте новое задание:
   - **Триггер:** При входе в систему
   - **Действие:** Запуск программы
   - **Программа:** Путь к браузеру
   - **Аргументы:** `--kiosk --app=http://192.168.1.10:3000/station.html`

### Способ 3: Через реестр (для опытных пользователей)

1. Откройте редактор реестра (`regedit`)
2. Перейдите к: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
3. Создайте новый строковый параметр
4. Имя: `StationBrowser`
5. Значение: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=http://192.168.1.10:3000/station.html`

## 🐧 Linux (Raspberry Pi / Ubuntu)

### Способ 1: Автозапуск через .bashrc или .profile

Добавьте в `~/.bashrc` или `~/.profile`:

```bash
# Автозапуск браузера для станции
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

# Ждем загрузки системы
sleep 5

# Запускаем браузер в полноэкранном режиме
chromium-browser --kiosk --app=http://192.168.1.10:3000/station.html &
```

### Способ 2: Автозапуск через systemd (рекомендуется для Raspberry Pi)

1. **Создайте сервисный файл:**
   ```bash
   sudo nano /etc/systemd/system/station-browser.service
   ```

2. **Добавьте содержимое:**
   ```ini
   [Unit]
   Description=Station Browser Autostart
   After=graphical.target

   [Service]
   Type=simple
   User=pi
   Environment="DISPLAY=:0"
   ExecStart=/usr/bin/chromium-browser --kiosk --app=http://192.168.1.10:3000/station.html
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=graphical.target
   ```

3. **Включите автозапуск:**
   ```bash
   sudo systemctl enable station-browser.service
   sudo systemctl start station-browser.service
   ```

### Способ 3: Автозапуск через autostart (для графического окружения)

1. Создайте файл `~/.config/autostart/station.desktop`:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Station Browser
   Exec=chromium-browser --kiosk --app=http://192.168.1.10:3000/station.html
   Hidden=false
   NoDisplay=false
   X-GNOME-Autostart-enabled=true
   ```

## 🍎 macOS

### Способ 1: Через "Элементы входа"

1. Откройте **Системные настройки** → **Пользователи и группы**
2. Выберите пользователя → **Элементы входа**
3. Нажмите **+** и добавьте приложение браузера
4. В аргументах укажите: `--kiosk --app=http://192.168.1.10:3000/station.html`

### Способ 2: Через AppleScript

1. Создайте AppleScript в **Автоматизация**:
   ```applescript
   tell application "Google Chrome"
       activate
       open location "http://192.168.1.10:3000/station.html"
   end tell
   ```

2. Сохраните как приложение и добавьте в автозагрузку

## ⚙️ Параметры браузера

### Chrome / Chromium

- `--kiosk` - полноэкранный режим
- `--app=URL` - режим приложения
- `--disable-infobars` - отключить информационные панели
- `--no-first-run` - пропустить первый запуск
- `--disable-session-crashed-bubble` - отключить уведомления о сбоях

**Полный пример:**
```bash
chromium-browser --kiosk --app=http://192.168.1.10:3000/station.html --disable-infobars --no-first-run
```

### Firefox

- `--kiosk` - полноэкранный режим
- `--url=URL` - открыть URL

**Пример:**
```bash
firefox --kiosk http://192.168.1.10:3000/station.html
```

### Edge (Windows)

- `--kiosk` - полноэкранный режим
- `--app=URL` - режим приложения

**Пример:**
```bash
msedge.exe --kiosk --app=http://192.168.1.10:3000/station.html
```

## 🔧 Настройка IP адреса сервера

Если IP адрес сервера изменится, обновите URL во всех местах:

1. В ярлыках автозагрузки
2. В systemd сервисах
3. В скриптах автозапуска

**Рекомендация:** Используйте статический IP для центрального сервера или настройте локальный DNS.

## 🆘 Устранение проблем

### Браузер не запускается автоматически

- Проверьте права доступа к файлам автозагрузки
- Убедитесь, что путь к браузеру правильный
- Проверьте логи системы (Linux: `journalctl -u station-browser`)

### Браузер запускается, но не открывает страницу

- Проверьте доступность сервера: `ping 192.168.1.10`
- Проверьте, что сервер запущен: `curl http://192.168.1.10:3000/station.html`
- Убедитесь, что URL правильный

### Браузер открывается в обычном режиме, а не в kiosk

- Проверьте параметры командной строки
- Убедитесь, что используется правильный браузер
- Попробуйте добавить `--start-fullscreen`

## 📝 Проверка работы

После настройки автозапуска:

1. Перезагрузите станцию
2. Браузер должен автоматически открыться
3. Страница должна загрузиться с сервера
4. Станция должна автоматически определиться и подключиться

## 🔄 Обновление URL

Если нужно изменить URL на всех станциях:

1. **Windows:** Обновите ярлыки в папке автозагрузки
2. **Linux (systemd):** Обновите файл сервиса и перезапустите:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart station-browser
   ```
3. **Linux (autostart):** Обновите файл `.desktop`

