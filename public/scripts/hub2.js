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
        
        // Инициализируем HubCommon если еще не инициализирован
        if (!HubCommon._initialized) {
            HubCommon.init();
        }
        
        // Создаем Hub2 если его нет
        if (!document.getElementById('hub2')) {
            this.createHub2();
        }
        
        // Обновляем позицию Hub2 относительно Hub1
        HubCommon.updateHub2Position();
        
        // Адаптируем размер логотипа
        HubCommon.adaptLogoSize();
        
        // Адаптируем размер фразы под логотип
        setTimeout(() => {
            HubCommon.adaptSubtitleToLogo();
        }, 100);
        
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
     * Инициализирует обработчики событий
     */
    initEventHandlers() {
        // Обработчики resize теперь управляются через HubCommon.initResizeHandlers()
        
        // Обновляем при загрузке изображения логотипа
        const logo = document.querySelector('.hub2-logo-section .logo');
        if (logo) {
            if (logo.complete) {
                HubCommon.adaptLogoSize();
                setTimeout(() => {
                    HubCommon.adaptSubtitleToLogo();
                }, 50);
            } else {
                logo.addEventListener('load', () => {
                    HubCommon.adaptLogoSize();
                    setTimeout(() => {
                        HubCommon.adaptSubtitleToLogo();
                    }, 50);
                }, { once: true });
                logo.addEventListener('error', () => {
                    HubCommon.adaptLogoSize();
                    setTimeout(() => {
                        HubCommon.adaptSubtitleToLogo();
                    }, 50);
                }, { once: true });
            }
        }
    }
};

