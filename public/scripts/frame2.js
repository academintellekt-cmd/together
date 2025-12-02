/**
 * Frame2 - Меню с логотипом
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


