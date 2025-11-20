@echo off
echo ========================================
echo  Запуск сервера квиза
echo ========================================
echo.

cd /d "%~dp0"

:: Остановка старого сервера если запущен
echo Проверка порта 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
    echo Останавливаю старый сервер (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: Проверка наличия node
where node >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден!
    echo Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js найден: 
node --version
echo.

:: Проверка node_modules
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить зависимости
        pause
        exit /b 1
    )
)

:: Запуск сервера с nodemon если доступен
if exist "node_modules\.bin\nodemon.cmd" (
    echo Запуск сервера с автоматической перезагрузкой...
    echo Хост: http://localhost:3000/host.html
    echo Игроки: http://localhost:3000/player.html
    echo.
    echo Для остановки нажмите Ctrl+C
    echo.
    node_modules\.bin\nodemon.cmd server.js
) else (
    echo Запуск сервера...
    echo Хост: http://localhost:3000/host.html
    echo Игроки: http://localhost:3000/player.html
    echo.
    echo Для остановки нажмите Ctrl+C
    echo.
    node server.js
)

pause


