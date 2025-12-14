/**
 * Frame1 - Меню с кнопками
 * Используется на всех страницах
 */

const Frame1 = {
    config: {
        showLogin: false,
        showJoystick: false,
        showSettings: false,
        showBack: false,
        backUrl: '/index.html',
        customButtons: []
    },
    
    /**
     * Инициализация Frame1
     */
    init(config = {}) {
        this.config = { ...this.config, ...config };
        
        // Инициализируем FrameCommon если еще не инициализирован
        if (!FrameCommon._initialized) {
            FrameCommon.init();
        }
        
        // Создаем Frame1 если его нет
        if (!document.getElementById('frame1')) {
            this.createFrame1();
        }
        
        // Инициализируем компоненты
        if (this.config.showLogin) {
            this.initCharacterMenu();
        }
        
        // Применяем цвет персонажа
        FrameCommon.applyCharacterColor();
        
        // Обновляем позицию Frame2 после создания Frame1
        FrameCommon.updateFrame2Position();
        
        // Инициализируем обработчики
        this.initEventHandlers();
    },
    
    /**
     * Создает HTML структуру Frame1
     */
    createFrame1() {
        const frame1 = document.createElement('div');
        frame1.id = 'frame1';
        frame1.className = 'frame1';
        
        const content = document.createElement('div');
        content.className = 'frame1-content';
        
        const actions = document.createElement('div');
        actions.className = 'frame1-actions';
        
        const actionsLeft = document.createElement('div');
        actionsLeft.className = 'frame1-actions-left';
        actionsLeft.id = 'frame1-actions-left';
        
        const actionsRight = document.createElement('div');
        actionsRight.className = 'frame1-actions-right';
        actionsRight.id = 'frame1-actions-right';
        
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
        frame1.appendChild(content);
        
        // Ищем контейнер для Frame1 или создаем его
        const frame1Container = document.getElementById('frame1-container');
        if (frame1Container) {
            frame1Container.appendChild(frame1);
        } else {
            document.body.insertBefore(frame1, document.body.firstChild);
        }
    },
    
    /**
     * Создает кнопку
     */
    createButton(text, url, className = '') {
        const button = document.createElement('a');
        
        // Если url === 'back' или 'history.back', используем history.back()
        if (url === 'back' || url === 'history.back') {
            button.href = '#';
            button.className = `frame1-button ${className}`;
            button.textContent = text;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    // Если истории нет, используем referrer или переходим на главную
                    const referrer = document.referrer;
                    if (referrer && referrer !== window.location.href) {
                        window.location.href = referrer;
                    } else {
                        window.location.href = '/index.html';
                    }
                }
            });
        } else {
            button.href = url;
            button.className = `frame1-button ${className}`;
            button.textContent = text;
        }
        
        return button;
    },
    
    /**
     * Создает кнопку входа с меню персонажей
     */
    createLoginButton() {
        const menu = document.createElement('div');
        menu.className = 'frame1-character-menu';
        
        const button = document.createElement('a');
        button.href = '#';
        button.className = 'frame1-button';
        button.id = 'frame1-login-button';
        button.textContent = 'Войти';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'frame1-character-menu-dropdown';
        dropdown.id = 'frame1-character-menu-dropdown';
        
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
        
        const loginButton = document.getElementById('frame1-login-button');
        const dropdown = document.getElementById('frame1-character-menu-dropdown');
        
        if (!loginButton || !dropdown) return;
        
        let selectedCharacterId = localStorage.getItem('selectedCharacter') || 'happy';
        
        // Создаем опции персонажей
        characters.forEach(char => {
            const option = document.createElement('div');
            option.className = 'frame1-character-option' + (char.id === selectedCharacterId ? ' selected' : '');
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
                
                document.querySelectorAll('.frame1-character-option').forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.dataset.characterId === char.id) {
                        opt.classList.add('selected');
                    }
                });
                
                dropdown.classList.remove('active');
            });
            
            dropdown.appendChild(option);
        });
        
        // Перемещаем dropdown в body, чтобы он был вне stacking context Frame1
        // Это гарантирует, что dropdown будет поверх всех элементов
        document.body.appendChild(dropdown);
        
        // Устанавливаем цвет по умолчанию
        const defaultChar = characters.find(c => c.id === selectedCharacterId);
        if (defaultChar) {
            loginButton.style.background = defaultChar.color;
        }
        
        // Сохраняем ссылку на menu для обработчика
        const menu = loginButton.closest('.frame1-character-menu');
        
        // Функция для обновления позиции dropdown при использовании position: fixed
        const updateDropdownPosition = () => {
            if (dropdown.classList.contains('active')) {
                // Используем requestAnimationFrame для гарантии правильного позиционирования
                requestAnimationFrame(() => {
                    const buttonRect = loginButton.getBoundingClientRect();
                    dropdown.style.top = `${buttonRect.bottom + 10}px`;
                    dropdown.style.left = `${buttonRect.left}px`;
                    // Убеждаемся, что z-index установлен
                    dropdown.style.zIndex = '9999';
                });
            }
        };
        
        // Обработчик клика на кнопку
        loginButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wasActive = dropdown.classList.contains('active');
            dropdown.classList.toggle('active');
            if (dropdown.classList.contains('active') && !wasActive) {
                // Обновляем позицию сразу и после небольшой задержки для надежности
                updateDropdownPosition();
                setTimeout(updateDropdownPosition, 10);
            }
        });
        
        // Обновляем позицию при прокрутке и изменении размера окна
        window.addEventListener('scroll', updateDropdownPosition, true);
        window.addEventListener('resize', updateDropdownPosition);
        
        // Закрытие при клике вне меню
        // Теперь проверяем и кнопку, и dropdown, так как dropdown в body
        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target) && !dropdown.contains(e.target)) {
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
        const actionsLeft = document.getElementById('frame1-actions-left');
        const actionsRight = document.getElementById('frame1-actions-right');
        
        const button = this.createButton(text, url, className);
        
        if (position === 'right' && actionsRight) {
            actionsRight.appendChild(button);
        } else if (actionsLeft) {
            actionsLeft.appendChild(button);
        }
        
        FrameCommon.applyCharacterColor();
    },
    
    /**
     * Добавляет иконку игрока (для multiplayer)
     */
    addPlayerIcon(playerId, name, status = 'waiting') {
        const actionsLeft = document.getElementById('frame1-actions-left');
        if (!actionsLeft) return;
        
        const icon = document.createElement('div');
        icon.className = `frame1-player-icon ${status}`;
        icon.id = `frame1-player-${playerId}`;
        icon.textContent = name;
        icon.dataset.playerId = playerId;
        
        actionsLeft.appendChild(icon);
        
        // Обновляем высоту Frame1
        this.updateHeight();
    },
    
    /**
     * Удаляет иконку игрока
     */
    removePlayerIcon(playerId) {
        const icon = document.getElementById(`frame1-player-${playerId}`);
        if (icon) {
            icon.remove();
            this.updateHeight();
        }
    },
    
    /**
     * Обновляет статус игрока
     */
    updatePlayerStatus(playerId, status) {
        const icon = document.getElementById(`frame1-player-${playerId}`);
        if (icon) {
            icon.className = `frame1-player-icon ${status}`;
        }
    },
    
    /**
     * Обновляет высоту Frame1 и позицию Frame2
     */
    updateHeight() {
        const frame1 = document.getElementById('frame1');
        if (frame1) {
            // Высота обновится автоматически, нужно обновить позицию Frame2
            FrameCommon.updateFrame2Position();
        }
    },
    
    /**
     * Инициализирует обработчики событий
     */
    initEventHandlers() {
        // Обработчики resize теперь управляются через FrameCommon.initResizeHandlers()
        // Дополнительные обработчики можно добавить здесь при необходимости
        
        // Обработчик прокрутки отключен - фрейм всегда виден и непрозрачен
    }
};


