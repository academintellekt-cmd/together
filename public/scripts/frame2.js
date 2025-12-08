/**
 * Frame2 - Меню с логотипом или никнеймами игроков
 * Используется на всех страницах
 */

const Frame2 = {
    config: {
        showLogo: true,
        showSubtitle: true
    },
    
    /**
     * Инициализация Frame2
     */
    init(config = {}) {
        this.config = { ...this.config, ...config };
        
        // Инициализируем FrameCommon если еще не инициализирован
        if (!FrameCommon._initialized) {
            FrameCommon.init();
        }
        
        // Создаем Frame2 если его нет
        if (!document.getElementById('frame2')) {
            this.createFrame2();
        }
        
        // Обновляем позицию Frame2 относительно Frame1
        FrameCommon.updateFrame2Position();
        
        // Адаптируем размер логотипа
        FrameCommon.adaptLogoSize();
        
        // Адаптируем размер фразы под логотип
        setTimeout(() => {
            FrameCommon.adaptSubtitleToLogo();
        }, 100);
        
        // Инициализируем обработчики
        this.initEventHandlers();
    },
    
    /**
     * Добавляет иконку игрока (для multiplayer)
     */
    addPlayerIcon(playerId, name, status = 'waiting') {
        const content = document.querySelector('.frame2-content');
        if (!content) return;
        
        // Создаем контейнер для игроков, если его нет
        let playersContainer = document.getElementById('frame2-players-container');
        if (!playersContainer) {
            playersContainer = document.createElement('div');
            playersContainer.id = 'frame2-players-container';
            playersContainer.className = 'frame2-players-container';
            
            // Убираем логотип и подзаголовок, если они есть
            const logoSection = content.querySelector('.frame2-logo-section');
            if (logoSection) {
                logoSection.style.display = 'none';
            }
            
            content.appendChild(playersContainer);
        }
        
        // Проверяем, не существует ли уже иконка для этого игрока
        const existingIcon = document.getElementById(`frame2-player-${playerId}`);
        if (existingIcon) {
            // Обновляем существующую иконку
            existingIcon.textContent = name;
            existingIcon.className = `frame2-player-icon ${status}`;
            return;
        }
        
        const icon = document.createElement('div');
        icon.className = `frame2-player-icon ${status}`;
        icon.id = `frame2-player-${playerId}`;
        icon.textContent = name;
        icon.dataset.playerId = playerId;
        
        playersContainer.appendChild(icon);
    },
    
    /**
     * Удаляет иконку игрока
     */
    removePlayerIcon(playerId) {
        const icon = document.getElementById(`frame2-player-${playerId}`);
        if (icon) {
            icon.remove();
            
            // Если игроков не осталось, показываем логотип обратно
            const playersContainer = document.getElementById('frame2-players-container');
            if (playersContainer && playersContainer.children.length === 0) {
                const content = document.querySelector('.frame2-content');
                const logoSection = content?.querySelector('.frame2-logo-section');
                if (logoSection) {
                    logoSection.style.display = 'flex';
                }
                playersContainer.remove();
            }
        }
    },
    
    /**
     * Обновляет статус игрока
     */
    updatePlayerStatus(playerId, status) {
        const icon = document.getElementById(`frame2-player-${playerId}`);
        if (icon) {
            icon.className = `frame2-player-icon ${status}`;
        }
    },
    
    /**
     * Очищает всех игроков
     */
    clearPlayers() {
        const playersContainer = document.getElementById('frame2-players-container');
        if (playersContainer) {
            playersContainer.innerHTML = '';
            const content = document.querySelector('.frame2-content');
            const logoSection = content?.querySelector('.frame2-logo-section');
            if (logoSection) {
                logoSection.style.display = 'flex';
            }
            playersContainer.remove();
        }
    },
    
    /**
     * Создает HTML структуру Frame2
     */
    createFrame2() {
        const frame2 = document.createElement('div');
        frame2.id = 'frame2';
        frame2.className = 'frame2';
        
        const content = document.createElement('div');
        content.className = 'frame2-content';
        
        const logoSection = document.createElement('div');
        logoSection.className = 'frame2-logo-section';
        
        if (this.config.showLogo) {
            const logo = document.createElement('img');
            logo.src = '/images/logo.png';
            logo.alt = 'ВМЕСТЕ';
            logo.className = 'logo';
            logoSection.appendChild(logo);
        }
        
        if (this.config.showSubtitle) {
            const subtitle = document.createElement('p');
            subtitle.className = 'subtitle';
            subtitle.textContent = 'хорошие люди объединяются играми';
            logoSection.appendChild(subtitle);
        }
        
        content.appendChild(logoSection);
        frame2.appendChild(content);
        
        // Ищем контейнер для Frame2 или создаем его
        const frame2Container = document.getElementById('frame2-container');
        if (frame2Container) {
            frame2Container.appendChild(frame2);
        } else {
            // Вставляем после Frame1, если он есть
            const frame1 = document.getElementById('frame1');
            if (frame1) {
                frame1.parentNode.insertBefore(frame2, frame1.nextSibling);
            } else {
                document.body.insertBefore(frame2, document.body.firstChild);
            }
        }
    },
    
    /**
     * Инициализирует обработчики событий
     */
    initEventHandlers() {
        // Обработчики resize теперь управляются через FrameCommon.initResizeHandlers()
        
        // Обновляем при загрузке изображения логотипа
        const logo = document.querySelector('.frame2-logo-section .logo');
        if (logo) {
            if (logo.complete) {
                FrameCommon.adaptLogoSize();
                setTimeout(() => {
                    FrameCommon.adaptSubtitleToLogo();
                }, 50);
            } else {
                logo.addEventListener('load', () => {
                    FrameCommon.adaptLogoSize();
                    setTimeout(() => {
                        FrameCommon.adaptSubtitleToLogo();
                    }, 50);
                }, { once: true });
                logo.addEventListener('error', () => {
                    FrameCommon.adaptLogoSize();
                    setTimeout(() => {
                        FrameCommon.adaptSubtitleToLogo();
                    }, 50);
                }, { once: true });
            }
        }
    }
};


