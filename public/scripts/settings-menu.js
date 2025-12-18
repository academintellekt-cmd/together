/**
 * Общий скрипт для меню настроек
 * Используется на всех страницах сайта
 */

// Пароль для настроек
const SETTINGS_PASSWORD = '1234';
const SETTINGS_STORAGE_KEY = 'settingsPasswordEntered';
let settingsPasswordEntered = false;

// Проверка пароля из localStorage
if (localStorage.getItem(SETTINGS_STORAGE_KEY) === 'true') {
    settingsPasswordEntered = true;
}

// Функции для работы с меню настроек
function openSettingsMenu() {
    if (!settingsPasswordEntered) {
        // Показываем модальное окно для ввода пароля
        const modal = document.getElementById('settingsPasswordModal');
        if (modal) {
            modal.classList.add('active');
            const input = document.getElementById('settingsPasswordInput');
            if (input) input.focus();
        }
    } else {
        // Открываем меню напрямую
        const menu = document.getElementById('settingsMenu');
        const overlay = document.getElementById('settingsMenuOverlay');
        if (menu) menu.classList.add('open');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSettingsMenu() {
    const menu = document.getElementById('settingsMenu');
    const overlay = document.getElementById('settingsMenuOverlay');
    if (menu) menu.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

function checkSettingsPassword() {
    const passwordInput = document.getElementById('settingsPasswordInput');
    const errorDiv = document.getElementById('settingsPasswordError');
    
    if (!passwordInput || !errorDiv) return;
    
    const password = passwordInput.value;
    
    if (password === SETTINGS_PASSWORD) {
        settingsPasswordEntered = true;
        localStorage.setItem(SETTINGS_STORAGE_KEY, 'true');
        const modal = document.getElementById('settingsPasswordModal');
        if (modal) modal.classList.remove('active');
        passwordInput.value = '';
        errorDiv.classList.remove('show');
        // Открываем меню после успешной проверки пароля
        openSettingsMenu();
    } else {
        errorDiv.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function closeSettingsPasswordModal() {
    const modal = document.getElementById('settingsPasswordModal');
    const passwordInput = document.getElementById('settingsPasswordInput');
    const errorDiv = document.getElementById('settingsPasswordError');
    
    if (modal) modal.classList.remove('active');
    if (passwordInput) passwordInput.value = '';
    if (errorDiv) errorDiv.classList.remove('show');
}

// Инициализация обработчиков для меню настроек
function initSettingsMenu() {
    // Обработчик для кнопки закрытия меню
    const closeBtn = document.getElementById('settingsMenuClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsMenu);
    }
    
    // Обработчик для оверлея (закрытие при клике вне меню)
    const overlay = document.getElementById('settingsMenuOverlay');
    if (overlay) {
        overlay.addEventListener('click', closeSettingsMenu);
    }
    
    // Обработчик для кнопки "Войти" в модальном окне пароля
    const submitBtn = document.getElementById('settingsPasswordSubmit');
    if (submitBtn) {
        submitBtn.addEventListener('click', checkSettingsPassword);
    }
    
    // Обработчик для кнопки "Назад" в модальном окне пароля
    const backBtn = document.getElementById('settingsPasswordBack');
    if (backBtn) {
        backBtn.addEventListener('click', closeSettingsPasswordModal);
    }
    
    // Обработчик Enter в поле пароля
    const passwordInput = document.getElementById('settingsPasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                checkSettingsPassword();
            }
        });
    }
    
    // Обработчик Escape для закрытия меню
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const menu = document.getElementById('settingsMenu');
            const modal = document.getElementById('settingsPasswordModal');
            if (menu && menu.classList.contains('open')) {
                closeSettingsMenu();
            }
            if (modal && modal.classList.contains('active')) {
                closeSettingsPasswordModal();
            }
        }
    });
}

// Функция для добавления кнопки меню в Frame1
function addMenuButton() {
    const hub1ActionsRight = document.getElementById('frame1-actions-right');
    if (hub1ActionsRight) {
        // Проверяем, не добавлена ли уже кнопка
        let menuButton = document.getElementById('settings-menu-button');
        if (!menuButton) {
            menuButton = document.createElement('button');
            menuButton.id = 'settings-menu-button';
            menuButton.className = 'menu-button frame1-button';
            menuButton.innerHTML = '<span>☰</span> <span>Меню</span>';
            menuButton.addEventListener('click', openSettingsMenu);
            hub1ActionsRight.appendChild(menuButton);
        }
    }
}

// Управление режимом игры (локальный/глобальный)
const MODE_STORAGE_KEY = 'gameMode';
const MODE_LOCAL = 'local';
const MODE_GLOBAL = 'global';

function getCurrentMode() {
    return localStorage.getItem(MODE_STORAGE_KEY) || MODE_GLOBAL;
}

function setMode(mode) {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    updateModeUI();
    // Уведомляем сервер о смене режима (опционально)
    fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
    }).catch(err => console.error('Ошибка отправки режима на сервер:', err));
}

function updateModeUI() {
    const mode = getCurrentMode();
    const switchEl = document.getElementById('mode-toggle-switch');
    const textEl = document.getElementById('current-mode-text');
    
    if (switchEl) {
        switchEl.checked = mode === MODE_LOCAL;
    }
    
    if (textEl) {
        const modeText = mode === MODE_LOCAL ? 'Локальный' : 'Глобальный';
        textEl.innerHTML = `Текущий режим: <strong>${modeText}</strong>`;
    }
}

// Проверка доступности локального режима
async function checkLocalModeAvailability() {
    try {
        const response = await fetch('/api/mode');
        const data = await response.json();
        
        const toggleSwitch = document.getElementById('mode-toggle-switch');
        const modeCard = document.getElementById('mode-toggle-card');
        
        if (data.mode === 'unavailable') {
            // Локальный режим недоступен - делаем переключатель неактивным
            if (toggleSwitch) {
                toggleSwitch.disabled = true;
            }
            if (modeCard) {
                modeCard.classList.add('disabled');
            }
        } else {
            // Локальный режим доступен
            if (toggleSwitch) {
                toggleSwitch.disabled = false;
            }
            if (modeCard) {
                modeCard.classList.remove('disabled');
            }
        }
    } catch (error) {
        console.error('Ошибка проверки режима:', error);
        // В случае ошибки считаем, что локальный режим недоступен
        const toggleSwitch = document.getElementById('mode-toggle-switch');
        const modeCard = document.getElementById('mode-toggle-card');
        if (toggleSwitch) toggleSwitch.disabled = true;
        if (modeCard) modeCard.classList.add('disabled');
    }
}

// Инициализация переключателя режима
function initModeToggle() {
    const toggleSwitch = document.getElementById('mode-toggle-switch');
    if (!toggleSwitch) {
        // Элемент еще не загружен, попробуем позже
        setTimeout(initModeToggle, 100);
        return;
    }
    
    // Устанавливаем начальное состояние
    updateModeUI();
    
    // Обработчик изменения переключателя
    toggleSwitch.addEventListener('change', function(e) {
        const newMode = e.target.checked ? MODE_LOCAL : MODE_GLOBAL;
        setMode(newMode);
    });
    
    // Проверяем доступность локального режима
    checkLocalModeAvailability();
}

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSettingsMenu();
        initModeToggle();
        // Добавляем кнопку меню после инициализации Frame1
        setTimeout(addMenuButton, 500);
    });
} else {
    initSettingsMenu();
    initModeToggle();
    setTimeout(addMenuButton, 500);
}

// Экспортируем функции для глобального доступа
window.openSettingsMenu = openSettingsMenu;
window.closeSettingsMenu = closeSettingsMenu;
window.checkSettingsPassword = checkSettingsPassword;
window.closeSettingsPasswordModal = closeSettingsPasswordModal;
window.addMenuButton = addMenuButton;
window.getCurrentMode = getCurrentMode;
window.setMode = setMode;

