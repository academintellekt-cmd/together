/**
 * LAYOUT.JS - Управление видимостью фреймов
 * Логика скрытия фреймов, общие обработчики
 * Интегрирован с Frame1 и Frame2
 */

const LayoutManager = {
    /**
     * Инициализация системы layout
     * Применяет конфигурацию видимости фреймов из window.pageLayoutConfig
     */
    init() {
        // Ждем загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Используем requestAnimationFrame для гарантии, что все элементы уже отрисованы
                requestAnimationFrame(() => {
                    this.setupFrameIntegration();
                    this.applyFrameVisibility();
                });
            });
        } else {
            // Используем requestAnimationFrame для гарантии, что все элементы уже отрисованы
            requestAnimationFrame(() => {
                this.setupFrameIntegration();
                this.applyFrameVisibility();
            });
        }
    },
    
    /**
     * Настраивает интеграцию с Frame1 и Frame2
     */
    setupFrameIntegration() {
        const body = document.body;
        const hasOldStructure = body.classList.contains('with-frames') || document.querySelector('.frame-zone');
        
        if (!hasOldStructure) {
            // Новая структура уже используется
            return;
        }
        
        // Создаем новую структуру фреймов
        if (!document.querySelector('.site-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'site-wrapper';
            
            // Создаем header
            const header = document.createElement('header');
            header.className = 'site-header';
            
            // Создаем Frame 1
            const frame1 = document.createElement('div');
            frame1.className = 'frame frame-1';
            frame1.setAttribute('data-frame', 'controls');
            frame1.id = 'frame1-container';
            
            // Создаем Frame 2
            const frame2 = document.createElement('div');
            frame2.className = 'frame frame-2';
            frame2.setAttribute('data-frame', 'logo');
            frame2.id = 'frame2-container';
            
            header.appendChild(frame1);
            header.appendChild(frame2);
            
            // Создаем main
            const main = document.createElement('main');
            main.className = 'site-main';
            
            // Создаем Frame 3
            const frame3 = document.createElement('section');
            frame3.className = 'frame frame-3';
            frame3.setAttribute('data-frame', 'content');
            
            // Контентный слой (декоративный слой удален)
            const content = document.createElement('div');
            content.className = 'frame-3-content';
            
            // Перемещаем содержимое frame3 в frame-3-content
            // Ищем старую структуру: frame-zone.frame3, frame-3, или hub-zone.hub3
            const frame3Old = document.querySelector('.frame-zone.frame3, .frame-3, .hub-zone.hub3');
            if (frame3Old) {
                const container = frame3Old.querySelector('.container');
                if (container) {
                    // Сохраняем ID и классы контейнера на content
                    if (container.id) {
                        content.id = container.id;
                    }
                    // Сохраняем классы контейнера, добавляя их к frame-3-content
                    const containerClasses = container.className.split(' ').filter(c => c && c !== 'container');
                    if (containerClasses.length > 0) {
                        content.className += ' ' + containerClasses.join(' ');
                    }
                    // Сохраняем inline стили контейнера
                    if (container.style.cssText) {
                        content.style.cssText = container.style.cssText;
                    }
                    // Перемещаем содержимое контейнера
                    while (container.firstChild) {
                        content.appendChild(container.firstChild);
                    }
                } else {
                    // Перемещаем все содержимое frame3
                    while (frame3Old.firstChild) {
                        content.appendChild(frame3Old.firstChild);
                    }
                }
                // Удаляем старый frame3
                frame3Old.remove();
            }
            
            frame3.appendChild(content);
            main.appendChild(frame3);
            
            // Создаем footer
            const footer = document.createElement('footer');
            footer.className = 'site-footer';
            
            // Создаем Frame 4
            const frame4 = document.createElement('section');
            frame4.className = 'frame frame-4';
            frame4.setAttribute('data-frame', 'rules');
            frame4.id = 'frame4';
            // Ищем старый frame4 по разным ID (frame4, hub4)
            const frame4Old = document.getElementById('frame4') || document.getElementById('hub4');
            if (frame4Old && frame4Old !== frame4) {
                // Перемещаем содержимое frame4
                while (frame4Old.firstChild) {
                    frame4.appendChild(frame4Old.firstChild);
                }
                // Если frame4 пуст, добавляем стандартный текст
                if (!frame4.textContent.trim()) {
                    frame4.innerHTML = '<p>Правила безопасности: Будьте внимательны и соблюдайте правила игры.</p>';
                }
                frame4Old.remove();
            } else {
                frame4.innerHTML = '<p>Правила безопасности: Будьте внимательны и соблюдайте правила игры.</p>';
            }
            
            // Создаем Frame 5
            const frame5 = document.createElement('section');
            frame5.className = 'frame frame-5';
            frame5.setAttribute('data-frame', 'about');
            frame5.id = 'frame5';
            // Ищем старый frame5 по разным ID (frame5, hub5)
            const frame5Old = document.getElementById('frame5') || document.getElementById('hub5');
            if (frame5Old && frame5Old !== frame5) {
                // Перемещаем содержимое frame5
                while (frame5Old.firstChild) {
                    frame5.appendChild(frame5Old.firstChild);
                }
                // Если frame5 пуст, добавляем стандартный текст
                if (!frame5.textContent.trim()) {
                    frame5.innerHTML = '<p>© 2024 ВМЕСТЕ. Все права защищены.</p>';
                }
                frame5Old.remove();
            } else {
                frame5.innerHTML = '<p>© 2024 ВМЕСТЕ. Все права защищены.</p>';
            }
            
            footer.appendChild(frame4);
            footer.appendChild(frame5);
            
            // Проверяем, есть ли уже footer.site-footer в main
            const existingFooterInMain = main.querySelector('footer.site-footer');
            if (existingFooterInMain) {
                // Если footer уже есть в main, заменяем его содержимое
                existingFooterInMain.replaceWith(footer);
            } else {
                // Если footer нет в main, добавляем его
                main.appendChild(footer);
            }
            
            // Перемещаем все остальные элементы (модальные окна и т.д.) в body
            const bodyChildren = Array.from(body.children);
            bodyChildren.forEach(child => {
                if (!child.classList.contains('site-wrapper')) {
                    // Оставляем модальные окна и другие элементы в body
                    // Они должны быть вне site-wrapper для правильного z-index
                }
            });
            
            // Добавляем структуру в body
            wrapper.appendChild(header);
            wrapper.appendChild(main);
            body.appendChild(wrapper);
            
            // Добавляем класс для структуры фреймов
            body.classList.add('with-frames');
        }
        
        // Если Frame1 существует, перемещаем его в Frame 1 контейнер
        const frame1 = document.getElementById('frame1');
        const frame1Container = document.getElementById('frame1-container');
        if (frame1 && frame1Container && !frame1Container.contains(frame1)) {
            frame1Container.appendChild(frame1);
        }
        
        // Если Frame2 существует, перемещаем его в Frame 2 контейнер
        const frame2 = document.getElementById('frame2');
        const frame2Container = document.getElementById('frame2-container');
        if (frame2 && frame2Container && !frame2Container.contains(frame2)) {
            frame2Container.appendChild(frame2);
        }
    },
    
    /**
     * Применяет видимость фреймов на основе конфигурации
     */
    applyFrameVisibility() {
        const config = window.pageLayoutConfig || {};
        
        // Применяем видимость для каждого фрейма
        // По умолчанию все фреймы видимы, если не указано иное
        // Frame 1 может создаваться динамически через Frame1.init(), поэтому применяем видимость только если он должен быть видимым
        if (config.showFrame1 !== false) {
            this.setFrameVisibility(1, true);
        } else {
            this.setFrameVisibility(1, false);
        }
        
        // Frame 2 может не существовать, если showFrame2 === false
        if (config.showFrame2 !== false) {
            this.setFrameVisibility(2, true);
        } else {
            this.setFrameVisibility(2, false);
        }
        
        this.setFrameVisibility(4, config.showFrame4 !== false);
        this.setFrameVisibility(5, config.showFrame5 !== false);
        
        // Frame 3 всегда видим (основной контент)
        // Но можно добавить поддержку, если понадобится
        if (config.showFrame3 === false) {
            this.setFrameVisibility(3, false);
        }
        
        // Обновляем позиции sticky элементов после применения видимости
        this.updateStickyPositions();
    },
    
    /**
     * Устанавливает видимость конкретного фрейма
     * @param {number} frameNumber - Номер фрейма (1-5)
     * @param {boolean} isVisible - Видимость фрейма
     */
    setFrameVisibility(frameNumber, isVisible) {
        // Пробуем найти фрейм по новому классу
        let frame = document.querySelector(`.frame-${frameNumber}`);
        
        // Если не найден, пробуем найти по ID
        if (!frame) {
            if (frameNumber === 1) {
                frame = document.getElementById('frame1');
            } else if (frameNumber === 2) {
                frame = document.getElementById('frame2');
            } else if (frameNumber === 4) {
                frame = document.getElementById('frame4') || document.getElementById('hub4');
            } else if (frameNumber === 5) {
                frame = document.getElementById('frame5') || document.getElementById('hub5');
            }
        }
        
        // Если фрейм не найден, это нормально - фреймы могут создаваться асинхронно
        if (!frame) {
            // Не выдаем предупреждение - фреймы могут создаваться позже через Frame1.init() или Frame2.init()
            return;
        }
        
        // Используем класс is-hidden для скрытия
        frame.classList.toggle('is-hidden', !isVisible);
        
        // Обновляем позицию sticky элементов после изменения видимости
        if (frameNumber === 1 || frameNumber === 2) {
            this.updateStickyPositions();
        }
    },
    
    /**
     * Обновляет позиции sticky элементов после изменения видимости фреймов
     */
    updateStickyPositions() {
        const frame1 = document.querySelector('.frame-1') || document.getElementById('frame1');
        const frame2 = document.querySelector('.frame-2') || document.getElementById('frame2');
        
        // Если Frame 2 не существует, ничего не делаем
        if (!frame2) return;
        
        // Если Frame 1 не существует или скрыт, Frame 2 должен быть на top: 0
        if (!frame1 || frame1.classList.contains('is-hidden') || frame1.offsetHeight === 0) {
            frame2.style.top = '0';
        } else {
            // Используем requestAnimationFrame для точного измерения высоты
            requestAnimationFrame(() => {
                const frame1Height = frame1.offsetHeight || 0;
                frame2.style.top = `${frame1Height}px`;
            });
        }
        
        // Также обновляем через FrameCommon, если он доступен
        if (typeof FrameCommon !== 'undefined' && FrameCommon.updateFrame2Position) {
            FrameCommon.updateFrame2Position();
        }
    },
    
    /**
     * Получает текущую видимость фрейма
     * @param {number} frameNumber - Номер фрейма (1-5)
     * @returns {boolean} - Видимость фрейма
     */
    isFrameVisible(frameNumber) {
        let frame = document.querySelector(`.frame-${frameNumber}`);
        
        if (!frame) {
            if (frameNumber === 1) frame = document.getElementById('frame1');
            else if (frameNumber === 2) frame = document.getElementById('frame2');
            else if (frameNumber === 4) frame = document.getElementById('frame4') || document.getElementById('hub4');
            else if (frameNumber === 5) frame = document.getElementById('frame5') || document.getElementById('hub5');
        }
        
        if (!frame) return false;
        
        return !frame.classList.contains('is-hidden');
    },
    
    /**
     * Переключает видимость фрейма
     * @param {number} frameNumber - Номер фрейма (1-5)
     */
    toggleFrame(frameNumber) {
        const isVisible = this.isFrameVisible(frameNumber);
        this.setFrameVisibility(frameNumber, !isVisible);
    },
    
    /**
     * Управление видимостью footer при прокрутке
     */
    initScrollHideFooter() {
        let lastScrollTop = 0;
        let scrollTimeout = null;
        const footer = document.querySelector('.site-footer');
        
        if (!footer) return;
        
        const handleScroll = () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollDelta = scrollTop - lastScrollTop;
            
            // Если прокручиваем вниз более чем на 10px, скрываем footer
            if (scrollDelta > 10) {
                footer.classList.add('hidden-on-scroll');
            } 
            // Если прокручиваем вверх или в самом верху, показываем footer
            else if (scrollDelta < -10 || scrollTop < 50) {
                footer.classList.remove('hidden-on-scroll');
            }
            
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
            
            // Очищаем таймер
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            // Если прокрутка остановилась, показываем footer через небольшую задержку
            scrollTimeout = setTimeout(() => {
                if (scrollTop < 50) {
                    footer.classList.remove('hidden-on-scroll');
                }
            }, 500);
        };
        
        // Обработчик прокрутки с throttling
        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        };
        
        window.addEventListener('scroll', onScroll, { passive: true });
        
        // Показываем footer при загрузке страницы, если мы вверху
        if (window.pageYOffset < 50) {
            footer.classList.remove('hidden-on-scroll');
        }
    }
};

// Автоматическая инициализация при загрузке скрипта
LayoutManager.init();

// Инициализация скрытия footer при прокрутке после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        requestAnimationFrame(() => {
            LayoutManager.initScrollHideFooter();
        });
    });
} else {
    requestAnimationFrame(() => {
        LayoutManager.initScrollHideFooter();
    });
}

// Экспорт для использования в других скриптах
if (typeof window !== 'undefined') {
    window.LayoutManager = LayoutManager;
}

