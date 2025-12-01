/**
 * Hub1 - Меню с кнопками
 * Используется на всех страницах
 */

const Hub1 = {
    config: {
        showLogin: false,
        showJoystick: false,
        showSettings: false,
        showBack: false,
        backUrl: '/index.html',
        customButtons: []
    },
    
    /**
     * Инициализация Hub1
     */
    init(config = {}) {
        this.config = { ...this.config, ...config };
        
        // Создаем Hub1 если его нет
        if (!document.getElementById('hub1')) {
            this.createHub1();
        }
        
        // Инициализируем компоненты
        if (this.config.showLogin) {
            this.initCharacterMenu();
        }
        
        // Применяем цвет персонажа
        HubCommon.applyCharacterColor();
        
        // Обновляем позицию Hub2
        HubCommon.updateHub2Position();
        
        // Инициализируем обработчики
        this.initEventHandlers();
    },
    
    /**
     * Создает HTML структуру Hub1
     */
    createHub1() {
        const hub1 = document.createElement('div');
        hub1.id = 'hub1';
        hub1.className = 'hub1';
        
        const content = document.createElement('div');
        content.className = 'hub1-content';
        
        const actions = document.createElement('div');
        actions.className = 'hub1-actions';
        
        const actionsLeft = document.createElement('div');
        actionsLeft.className = 'hub1-actions-left';
        actionsLeft.id = 'hub1-actions-left';
        
        const actionsRight = document.createElement('div');
        actionsRight.className = 'hub1-actions-right';
        actionsRight.id = 'hub1-actions-right';
        
        // Добавляем кнопки в зависимости от конфигурации
        if (this.config.showBack) {
            const backButton = this.createButton('← Назад', this.config.backUrl);
            actionsLeft.appendChild(backButton);
        }
        
        if (this.config.showLogin) {
            const loginButton = this.createLoginButton();
            actionsLeft.appendChild(loginButton);
        }
        
        if (this.config.showSettings) {
            const settingsButton = this.createButton('⚙️ Настройки', '/settings.html');
            actionsRight.appendChild(settingsButton);
        }
        
        // Обратная совместимость: showJoystick теперь ведет на настройки
        if (this.config.showJoystick) {
            const settingsButton = this.createButton('⚙️ Настройки', '/settings.html');
            actionsRight.appendChild(settingsButton);
        }
        
        // Добавляем пользовательские кнопки
        this.config.customButtons.forEach(buttonConfig => {
            const button = this.createButton(buttonConfig.text, buttonConfig.url, buttonConfig.className);
            if (buttonConfig.position === 'right') {
                actionsRight.appendChild(button);
            } else {
                actionsLeft.appendChild(button);
            }
        });
        
        actions.appendChild(actionsLeft);
        actions.appendChild(actionsRight);
        content.appendChild(actions);
        hub1.appendChild(content);
        
        document.body.insertBefore(hub1, document.body.firstChild);
    },
    
    /**
     * Создает кнопку
     */
    createButton(text, url, className = '') {
        const button = document.createElement('a');
        button.href = url;
        button.className = `hub1-button ${className}`;
        button.textContent = text;
        return button;
    },
    
    /**
     * Создает кнопку входа с меню персонажей
     */
    createLoginButton() {
        const menu = document.createElement('div');
        menu.className = 'hub1-character-menu';
        
        const button = document.createElement('a');
        button.href = '#';
        button.className = 'hub1-button';
        button.id = 'hub1-login-button';
        button.textContent = 'Войти';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'hub1-character-menu-dropdown';
        dropdown.id = 'hub1-character-menu-dropdown';
        
        menu.appendChild(button);
        menu.appendChild(dropdown);
        
        return menu;
    },
    
    /**
     * Инициализирует меню персонажей
     */
    initCharacterMenu() {
        const characters = [
            { id: 'happy', name: 'Радость', color: '#abf67c', position: 0, emotion: 'happy' },
            { id: 'wink', name: 'Подмигивашка', color: '#c77cf6', position: 1, emotion: 'wink' },
            { id: 'smile', name: 'Улыбка', color: '#f67cab', position: 2, emotion: 'smile' },
            { id: 'grumpy', name: 'Хмурик', color: '#7cabf6', position: 3, emotion: 'grumpy' },
            { id: 'sad', name: 'Грустинка', color: '#7ce8f6', position: 4, emotion: 'sad' },
            { id: 'surprised', name: 'Удивлёнка', color: '#f68a7c', position: 5, emotion: 'surprised' },
            { id: 'laugh', name: 'Смешинка', color: '#f2f67c', position: 6, emotion: 'laugh' },
            { id: 'thoughtful', name: 'Думалка', color: '#8a7cf6', position: 7, emotion: 'thoughtful' }
        ];
        
        const loginButton = document.getElementById('hub1-login-button');
        const dropdown = document.getElementById('hub1-character-menu-dropdown');
        
        if (!loginButton || !dropdown) return;
        
        let selectedCharacterId = localStorage.getItem('selectedCharacter') || 'happy';
        
        // Создаем опции персонажей
        characters.forEach(char => {
            const option = document.createElement('div');
            option.className = 'hub1-character-option' + (char.id === selectedCharacterId ? ' selected' : '');
            option.dataset.characterId = char.id;
            
            const preview = document.createElement('div');
            preview.className = 'character-preview';
            const charSVG = this.createCharacterSVG(char.color, char.emotion, 32);
            preview.appendChild(charSVG);
            
            option.appendChild(preview);
            
            option.addEventListener('click', () => {
                selectedCharacterId = char.id;
                loginButton.style.background = char.color;
                localStorage.setItem('selectedCharacterColor', char.color);
                localStorage.setItem('selectedCharacter', char.id);
                
                document.querySelectorAll('.hub1-character-option').forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.dataset.characterId === char.id) {
                        opt.classList.add('selected');
                    }
                });
                
                dropdown.classList.remove('active');
            });
            
            dropdown.appendChild(option);
        });
        
        // Устанавливаем цвет по умолчанию
        const defaultChar = characters.find(c => c.id === selectedCharacterId);
        if (defaultChar) {
            loginButton.style.background = defaultChar.color;
        }
        
        // Сохраняем ссылку на menu для обработчика
        const menu = loginButton.closest('.hub1-character-menu');
        
        // Обработчик клика на кнопку
        loginButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        
        // Закрытие при клике вне меню
        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    },
    
    /**
     * Создает SVG персонажа (упрощенная версия)
     */
    createCharacterSVG(color, emotion, size = 100) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', '-10 -10 120 120');
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50');
        circle.setAttribute('cy', '50');
        circle.setAttribute('r', '50');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#000');
        circle.setAttribute('stroke-width', '3');
        svg.appendChild(circle);
        
        // Простая мордочка
        const face = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        face.setAttribute('stroke', '#000');
        face.setAttribute('stroke-width', '6');
        face.setAttribute('fill', 'none');
        face.setAttribute('stroke-linecap', 'round');
        
        const eye1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye1.setAttribute('cx', '35');
        eye1.setAttribute('cy', '35');
        eye1.setAttribute('r', '4');
        eye1.setAttribute('fill', '#000');
        face.appendChild(eye1);
        
        const eye2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye2.setAttribute('cx', '65');
        eye2.setAttribute('cy', '35');
        eye2.setAttribute('r', '4');
        eye2.setAttribute('fill', '#000');
        face.appendChild(eye2);
        
        const mouth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mouth.setAttribute('d', 'M 30 58 Q 50 68 70 58');
        face.appendChild(mouth);
        
        svg.appendChild(face);
        return svg;
    },
    
    /**
     * Добавляет кнопку динамически
     */
    addButton(text, url, position = 'left', className = '') {
        const actionsLeft = document.getElementById('hub1-actions-left');
        const actionsRight = document.getElementById('hub1-actions-right');
        
        const button = this.createButton(text, url, className);
        
        if (position === 'right' && actionsRight) {
            actionsRight.appendChild(button);
        } else if (actionsLeft) {
            actionsLeft.appendChild(button);
        }
        
        HubCommon.applyCharacterColor();
    },
    
    /**
     * Добавляет иконку игрока (для multiplayer)
     */
    addPlayerIcon(playerId, name, status = 'waiting') {
        const actionsLeft = document.getElementById('hub1-actions-left');
        if (!actionsLeft) return;
        
        const icon = document.createElement('div');
        icon.className = `hub1-player-icon ${status}`;
        icon.id = `hub1-player-${playerId}`;
        icon.textContent = name;
        icon.dataset.playerId = playerId;
        
        actionsLeft.appendChild(icon);
        
        // Обновляем высоту Hub1
        this.updateHeight();
    },
    
    /**
     * Удаляет иконку игрока
     */
    removePlayerIcon(playerId) {
        const icon = document.getElementById(`hub1-player-${playerId}`);
        if (icon) {
            icon.remove();
            this.updateHeight();
        }
    },
    
    /**
     * Обновляет статус игрока
     */
    updatePlayerStatus(playerId, status) {
        const icon = document.getElementById(`hub1-player-${playerId}`);
        if (icon) {
            icon.className = `hub1-player-icon ${status}`;
        }
    },
    
    /**
     * Обновляет высоту Hub1 и позицию Hub2
     */
    updateHeight() {
        const hub1 = document.getElementById('hub1');
        if (hub1) {
            // Высота обновится автоматически, нужно обновить позицию Hub2
            HubCommon.updateHub2Position();
            HubCommon.updateContentPadding();
            HubCommon.updateFloatingElementsPosition();
        }
    },
    
    /**
     * Инициализирует обработчики событий
     */
    initEventHandlers() {
        // Обновляем при изменении размера окна
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Сбрасываем флаг, чтобы разрешить обновление при resize
                HubCommon._positionInitialized = false;
                HubCommon._lastCorrectMarginTop = null;
                
                console.log('resize (hub1.js): обновляем позиции после изменения размера окна');
                
                this.updateHeight();
            }, 100);
        });
        
        // Обновляем при загрузке (только если позиция еще не была установлена)
        // Это предотвращает перезапись правильной позиции
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    // Проверяем, не была ли позиция уже установлена правильно
                    if (!HubCommon._positionInitialized) {
                        this.updateHeight();
                    }
                }, 300);
            });
        } else {
            setTimeout(() => {
                // Проверяем, не была ли позиция уже установлена правильно
                if (!HubCommon._positionInitialized) {
                    this.updateHeight();
                }
            }, 300);
        }
    }
};

