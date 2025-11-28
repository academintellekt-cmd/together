/**
 * Hub2 - Меню с логотипом
 * Используется на всех страницах
 */

const Hub2 = {
    config: {
        showLogo: true,
        showSubtitle: true
    },
    
    /**
     * Инициализация Hub2
     */
    init(config = {}) {
        this.config = { ...this.config, ...config };
        
        // Создаем Hub2 если его нет
        if (!document.getElementById('hub2')) {
            this.createHub2();
        }
        
        // Обновляем позицию и связанные элементы
        this.updatePosition();
        
        // Адаптируем размер фразы
        HubCommon.adaptSubtitleToLogo();
        
        // Инициализируем обработчики
        this.initEventHandlers();
    },
    
    /**
     * Создает HTML структуру Hub2
     */
    createHub2() {
        const hub2 = document.createElement('div');
        hub2.id = 'hub2';
        hub2.className = 'hub2';
        
        const content = document.createElement('div');
        content.className = 'hub2-content';
        
        const logoSection = document.createElement('div');
        logoSection.className = 'hub2-logo-section';
        
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
        hub2.appendChild(content);
        
        // Вставляем после Hub1, если он есть
        const hub1 = document.getElementById('hub1');
        if (hub1) {
            hub1.parentNode.insertBefore(hub2, hub1.nextSibling);
        } else {
            document.body.insertBefore(hub2, document.body.firstChild);
        }
    },
    
    /**
     * Обновляет позицию Hub2 и связанные элементы
     */
    updatePosition() {
        HubCommon.updateHub2Position();
        HubCommon.updateContentPadding();
        HubCommon.updateFloatingElementsPosition();
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
                
                console.log('resize (hub2.js): обновляем позиции после изменения размера окна');
                
                this.updatePosition();
                HubCommon.adaptSubtitleToLogo();
            }, 100);
        });
        
        // Обновляем при загрузке (только если позиция еще не была установлена)
        // Это предотвращает перезапись правильной позиции
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    // Проверяем, не была ли позиция уже установлена правильно
                    if (!HubCommon._positionInitialized) {
                        this.updatePosition();
                    }
                    HubCommon.adaptSubtitleToLogo();
                }, 300);
            });
        } else {
            setTimeout(() => {
                // Проверяем, не была ли позиция уже установлена правильно
                if (!HubCommon._positionInitialized) {
                    this.updatePosition();
                }
                HubCommon.adaptSubtitleToLogo();
            }, 300);
        }
        
        // Обновляем при загрузке изображения логотипа
        window.addEventListener('load', () => {
            HubCommon.adaptSubtitleToLogo();
        });
    }
};

