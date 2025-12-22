# Развертывание на станции с Windows

Инструкция по использованию системы автоматического развертывания на Windows.

## Варианты использования

### Вариант 1: WSL (Windows Subsystem for Linux) - Рекомендуется

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
./scripts/deploy-local.sh pi
```

### Вариант 2: Git Bash

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
   ./scripts/deploy-local.sh pi
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
2. **Настройте SSH ключи** для удобства (не нужно вводить пароль каждый раз)
3. **Используйте Git Bash** как компромисс между удобством и совместимостью

## Сравнение вариантов

| Вариант | Удобство | Совместимость | Требования |
|---------|----------|---------------|------------|
| WSL | ⭐⭐ | ⭐⭐⭐ | WSL установка |
| Git Bash | ⭐⭐⭐ | ⭐⭐⭐ | Git for Windows |

## Примеры использования

### WSL

```bash
# В WSL терминале
cd /mnt/c/Users/YourName/Documents/together
./scripts/deploy-local.sh pi
```

### Git Bash

```bash
# В Git Bash
cd /c/Users/YourName/Documents/together
./scripts/deploy-local.sh pi
```

