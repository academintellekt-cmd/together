/**
 * LAYOUT.JS - Управление видимостью фреймов
 * Логика скрытия фреймов, общие обработчики
 * Интегрирован с Hub1 и Hub2 для обратной совместимости
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
                    this.setupHubIntegration();
                    this.applyFrameVisibility();
                });
            });
        } else {
            // Используем requestAnimationFrame для гарантии, что все элементы уже отрисованы
            requestAnimationFrame(() => {
                this.setupHubIntegration();
                this.applyFrameVisibility();
            });
        }
    },
    
    /**
     * Настраивает интеграцию с Hub1 и Hub2 для обратной совместимости
     * Автоматически преобразует старую структуру Hub в новую систему фреймов
     */
    setupHubIntegration() {
        // Если используется старая система Hub, преобразуем её в новую структуру фреймов
        const body = document.body;
        const hasOldStructure = body.classList.contains('with-hub') || document.querySelector('.hub-zone');
        
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
            
            // Создаем Frame 1 (для Hub1)
            const frame1 = document.createElement('div');
            frame1.className = 'frame frame-1';
            frame1.setAttribute('data-frame', 'controls');
            frame1.id = 'hub1-container';
            
            // Создаем Frame 2 (для Hub2)
            const frame2 = document.createElement('div');
            frame2.className = 'frame frame-2';
            frame2.setAttribute('data-frame', 'logo');
            frame2.id = 'hub2-container';
            
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
            
            // Перемещаем содержимое hub3 в frame-3-content
            const hub3 = document.querySelector('.hub-zone.hub3, .hub3');
            if (hub3) {
                const container = hub3.querySelector('.container');
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
                    // Перемещаем все содержимое hub3
                    while (hub3.firstChild) {
                        content.appendChild(hub3.firstChild);
                    }
                }
                // Удаляем старый hub3
                hub3.remove();
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
            const hub4 = document.getElementById('hub4');
            if (hub4) {
                // Перемещаем содержимое hub4
                while (hub4.firstChild) {
                    frame4.appendChild(hub4.firstChild);
                }
                // Если hub4 пуст, добавляем стандартный текст
                if (!frame4.textContent.trim()) {
                    frame4.innerHTML = '<p>Правила безопасности: Будьте внимательны и соблюдайте правила игры.</p>';
                }
                hub4.remove();
            } else {
                frame4.innerHTML = '<p>Правила безопасности: Будьте внимательны и соблюдайте правила игры.</p>';
            }
            
            // Создаем Frame 5
            const frame5 = document.createElement('section');
            frame5.className = 'frame frame-5';
            frame5.setAttribute('data-frame', 'about');
            const hub5 = document.getElementById('hub5');
            if (hub5) {
                // Перемещаем содержимое hub5
                while (hub5.firstChild) {
                    frame5.appendChild(hub5.firstChild);
                }
                // Если hub5 пуст, добавляем стандартный текст
                if (!frame5.textContent.trim()) {
                    frame5.innerHTML = '<p>© 2024 ВМЕСТЕ. Все права защищены.</p>';
                }
                hub5.remove();
            } else {
                frame5.innerHTML = '<p>© 2024 ВМЕСТЕ. Все права защищены.</p>';
            }
            
            footer.appendChild(frame4);
            footer.appendChild(frame5);
            main.appendChild(footer);
            
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
            
            // Удаляем старый класс
            body.classList.remove('with-hub');
        }
        
        // Если Hub1 существует, перемещаем его в Frame 1
        const hub1 = document.getElementById('hub1');
        const hub1Container = document.getElementById('hub1-container');
        if (hub1 && hub1Container && !hub1Container.contains(hub1)) {
            hub1Container.appendChild(hub1);
        }
        
        // Если Hub2 существует, перемещаем его в Frame 2
        const hub2 = document.getElementById('hub2');
        const hub2Container = document.getElementById('hub2-container');
        if (hub2 && hub2Container && !hub2Container.contains(hub2)) {
            hub2Container.appendChild(hub2);
        }
    },
    
    /**
     * Применяет видимость фреймов на основе конфигурации
     */
    applyFrameVisibility() {
        const config = window.pageLayoutConfig || {};
        
        // Применяем видимость для каждого фрейма
        // По умолчанию все фреймы видимы, если не указано иное
        this.setFrameVisibility(1, config.showFrame1 !== false);
        this.setFrameVisibility(2, config.showFrame2 !== false);
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
        
        // Если не найден, пробуем найти по старой системе Hub
        if (!frame) {
            if (frameNumber === 1) {
                frame = document.getElementById('hub1');
            } else if (frameNumber === 2) {
                frame = document.getElementById('hub2');
            } else if (frameNumber === 4) {
                frame = document.getElementById('hub4');
            } else if (frameNumber === 5) {
                frame = document.getElementById('hub5');
            }
        }
        
        if (!frame) {
            console.warn(`Frame ${frameNumber} not found`);
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
        const frame1 = document.querySelector('.frame-1') || document.getElementById('hub1');
        const frame2 = document.querySelector('.frame-2') || document.getElementById('hub2');
        
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
        
        // Также обновляем через HubCommon, если он доступен (для старой системы Hub)
        if (typeof HubCommon !== 'undefined' && HubCommon.updateHub2Position) {
            HubCommon.updateHub2Position();
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
            if (frameNumber === 1) frame = document.getElementById('hub1');
            else if (frameNumber === 2) frame = document.getElementById('hub2');
            else if (frameNumber === 4) frame = document.getElementById('hub4');
            else if (frameNumber === 5) frame = document.getElementById('hub5');
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
    }
};

// Автоматическая инициализация при загрузке скрипта
LayoutManager.init();

// Экспорт для использования в других скриптах
if (typeof window !== 'undefined') {
    window.LayoutManager = LayoutManager;
}

