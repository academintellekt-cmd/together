# Развертывание на станции с Windows

Инструкция по использованию системы автоматического развертывания на Windows.

## Варианты использования

### Вариант 1: PowerShell скрипт (рекомендуется для Windows)

Используйте PowerShell версию скрипта развертывания.

**Требования:**
- Windows 10/11 с PowerShell 5.1 или выше
- Git for Windows (для команды `tar`)
- SSH клиент (встроен в Windows 10/11 или через OpenSSH)

**Использование:**

```powershell
# Базовое использование (SSH ключи)
.\scripts\deploy-to-stations.ps1

# С указанием пользователя
.\scripts\deploy-to-stations.ps1 -Username pi

# С паролем
.\scripts\deploy-to-stations.ps1 -Username pi -Password raspberry

# С пользовательским путем
.\scripts\deploy-to-stations.ps1 -Username pi -Password raspberry -StationPath "/home/pi/together"
```

**Если скрипт заблокирован:**

```powershell
# Разрешите выполнение скриптов (один раз, от администратора)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Затем запустите скрипт
.\scripts\deploy-to-stations.ps1
```

### Вариант 2: WSL (Windows Subsystem for Linux)

Используйте оригинальный bash скрипт через WSL.

**Требования:**
- WSL установлен и настроен
- Linux дистрибутив (Ubuntu рекомендуется)

**Установка WSL:**

```powershell
# В PowerShell от администратора
wsl --install

# Перезагрузите компьютер
```

**Использование:**

```bash
# В WSL терминале
cd /mnt/c/Users/YourName/Documents/together
./scripts/deploy-to-stations.sh pi
```

### Вариант 3: Git Bash

Используйте Git Bash для запуска bash скриптов.

**Требования:**
- Git for Windows установлен

**Использование:**

1. Откройте Git Bash
2. Перейдите в директорию проекта:
   ```bash
   cd /c/Users/YourName/Documents/together
   ```
3. Запустите скрипт:
   ```bash
   ./scripts/deploy-to-stations.sh pi
   ```

## Установка необходимых инструментов

### 1. Git for Windows

**Скачайте и установите:**
- https://git-scm.com/download/win

Git Bash включает необходимые Unix-утилиты (`tar`, `ssh`, `scp`).

### 2. OpenSSH (если не установлен)

**Windows 10/11:**
OpenSSH обычно уже установлен. Проверьте:

```powershell
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH*'
```

Если не установлен:

```powershell
# В PowerShell от администратора
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### 3. PuTTY (альтернатива для SSH с паролем)

Если нужна поддержка паролей без sshpass:

**Скачайте и установите:**
- https://www.putty.org/

Добавьте PuTTY в PATH или используйте полный путь к `pscp.exe` и `plink.exe`.

### 4. sshpass для Windows (опционально)

Для использования паролей в PowerShell:

**Скачайте:**
- https://github.com/keimpx/sshpass-win32/releases

Распакуйте и добавьте в PATH.

## Настройка SSH ключей на Windows

### Генерация SSH ключа

```powershell
# В PowerShell
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Ключ будет создан в: C:\Users\YourName\.ssh\id_rsa
```

### Копирование ключа на станции

```powershell
# Для каждой станции
ssh-copy-id pi@192.168.1.21
ssh-copy-id pi@192.168.1.22
# ... и так далее
```

**Если ssh-copy-id недоступен:**

```powershell
# Вручную скопируйте содержимое ключа
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh pi@192.168.1.21 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

## Использование через веб-интерфейс

Веб-интерфейс работает так же, как на Linux/macOS:

1. Запустите сервер:
   ```powershell
   npm start
   ```

2. Откройте в браузере:
   ```
   http://localhost:3000/station-deploy.html
   ```

3. Заполните форму и нажмите "Развернуть"

## Проверка подключения

### Проверка ping

```powershell
Test-Connection 192.168.1.21
```

### Проверка SSH порта

```powershell
Test-NetConnection -ComputerName 192.168.1.21 -Port 22
```

### Проверка SSH подключения

```powershell
ssh pi@192.168.1.21
```

## Устранение проблем

### Ошибка "tar не найден"

**Решение:**
- Установите Git for Windows (включает tar)
- Или используйте WSL

### Ошибка "ssh не найден"

**Решение:**
```powershell
# Установите OpenSSH
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### Ошибка "Execution Policy"

**Решение:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Проблемы с путями в PowerShell

PowerShell использует обратные слеши. Если возникают проблемы:

```powershell
# Используйте прямые слеши или экранируйте
cd C:/Users/YourName/Documents/together
```

### Проблемы с кодировкой

Если возникают проблемы с кириллицей:

```powershell
# Установите UTF-8 кодировку
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
```

## Рекомендации

1. **Используйте WSL** для максимальной совместимости с bash скриптами
2. **Или используйте PowerShell скрипт** для нативной Windows поддержки
3. **Настройте SSH ключи** для удобства (не нужно вводить пароль каждый раз)
4. **Используйте Git Bash** как компромисс между удобством и совместимостью

## Сравнение вариантов

| Вариант | Удобство | Совместимость | Требования |
|---------|----------|---------------|------------|
| PowerShell | ⭐⭐⭐ | ⭐⭐ | Git, OpenSSH |
| WSL | ⭐⭐ | ⭐⭐⭐ | WSL установка |
| Git Bash | ⭐⭐⭐ | ⭐⭐⭐ | Git for Windows |

## Примеры использования

### PowerShell

```powershell
# Перейдите в директорию проекта
cd C:\Users\YourName\Documents\together

# Запустите развертывание
.\scripts\deploy-to-stations.ps1 -Username pi
```

### WSL

```bash
# В WSL терминале
cd /mnt/c/Users/YourName/Documents/together
./scripts/deploy-to-stations.sh pi
```

### Git Bash

```bash
# В Git Bash
cd /c/Users/YourName/Documents/together
./scripts/deploy-to-stations.sh pi
```

