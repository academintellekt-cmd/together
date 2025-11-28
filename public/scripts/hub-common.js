/**
 * Общие функции для Hub1 и Hub2
 */

const HubCommon = {
    // Флаг для отслеживания, была ли позиция уже установлена правильно
    _positionInitialized: false,
    _lastCorrectMarginTop: null,
    
    /**
     * Обновляет позицию Hub2 относительно Hub1
     */
    updateHub2Position() {
        const hub1 = document.getElementById('hub1');
        const hub2 = document.getElementById('hub2');
        
        if (hub1 && hub2) {
            const hub1Height = hub1.offsetHeight;
            hub2.style.top = hub1Height + 'px';
        } else if (hub2 && !hub1) {
            // Если Hub1 нет, Hub2 вверху
            hub2.style.top = '0px';
        }
    },
    
    /**
     * Обновляет отступ контента страницы относительно Hub меню
     * Контент начинается СРАЗУ после Hub2, без промежутка
     * Использует ту же логику, что и updateFloatingElementsPosition для синхронизации
     */
    updateContentPadding(containerSelector = '.container') {
        const hub1 = document.getElementById('hub1');
        const hub2 = document.getElementById('hub2');
        const container = document.querySelector(containerSelector);
        
        if (!container) {
            console.warn('updateContentPadding: контейнер не найден:', containerSelector);
            return;
        }
        
        // Проверяем, что Hub1 и Hub2 уже инициализированы
        if (!hub1 || !hub2) {
            console.warn('updateContentPadding: Hub1 или Hub2 еще не инициализированы, пропускаем');
            return;
        }
        
        // Проверяем, что Hub1 и Hub2 имеют высоту (не скрыты)
        const hub1Height = hub1.offsetHeight || hub1.getBoundingClientRect().height;
        const hub2Height = hub2.offsetHeight || hub2.getBoundingClientRect().height;
        if (hub1Height === 0 || hub2Height === 0) {
            console.warn('updateContentPadding: Hub1 или Hub2 имеют нулевую высоту, пропускаем');
            return;
        }
        
        // Ждем следующего кадра для точного расчета высоты
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                let totalHeight = 0;
                
                // Используем getBoundingClientRect() для более точного расчета
                if (hub1 && hub1.style.display !== 'none') {
                    const hub1Rect = hub1.getBoundingClientRect();
                    const hub1Height = hub1Rect.height || hub1.offsetHeight;
                    totalHeight += hub1Height;
                }
                
                if (hub2 && hub2.style.display !== 'none') {
                    const hub2Rect = hub2.getBoundingClientRect();
                    const hub2Height = hub2Rect.height || hub2.offsetHeight;
                    totalHeight += hub2Height;
                }
                
                console.log('updateContentPadding: totalHeight =', totalHeight, 'hub1:', hub1?.getBoundingClientRect().height, 'hub2:', hub2?.getBoundingClientRect().height);
                
                // БЕЗ дополнительного отступа - контент начинается сразу после Hub2
                // Используем ту же высоту, что и для парящего элемента
                // Для .quizzes-section используем margin-top вместо padding-top, чтобы переместить весь элемент
                if (containerSelector === '.quizzes-section') {
                    // Сохраняем текущее значение margin-top для отслеживания изменений
                    const currentMarginTop = parseFloat(container.style.marginTop) || 0;
                    const newMarginTop = totalHeight;
                    
                    // Логируем изменение margin-top
                    if (Math.abs(currentMarginTop - newMarginTop) > 1) {
                        console.log('updateContentPadding: изменяем margin-top с', currentMarginTop, 'на', newMarginTop);
                    }
                    
                    // Используем margin-top для перемещения всего элемента вниз
                    container.style.setProperty('margin-top', newMarginTop + 'px', 'important');
                    container.style.setProperty('padding-top', '0', 'important');
                    container.style.setProperty('margin-bottom', '0', 'important');
                    
                    // Добавляем наблюдатель за изменениями стилей для отладки
                    if (!container._marginTopObserver) {
                        container._marginTopObserver = true;
                        const observer = new MutationObserver((mutations) => {
                            mutations.forEach((mutation) => {
                                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                                    const observedMarginTop = parseFloat(container.style.marginTop) || 0;
                                    if (Math.abs(observedMarginTop - newMarginTop) > 1 && this._positionInitialized) {
                                        console.warn('updateContentPadding: ОБНАРУЖЕНО ИЗМЕНЕНИЕ margin-top! Было:', newMarginTop, 'Стало:', observedMarginTop);
                                        console.trace('Стек вызовов:');
                                        // Восстанавливаем правильную позицию
                                        container.style.setProperty('margin-top', newMarginTop + 'px', 'important');
                                    }
                                }
                            });
                        });
                        observer.observe(container, { attributes: true, attributeFilter: ['style'] });
                    }
                    
                    // Устанавливаем top для quizzes-section::before через динамический стиль
                    let style = document.getElementById('dynamic-quizzes-before-position');
                    if (!style) {
                        style = document.createElement('style');
                        style.id = 'dynamic-quizzes-before-position';
                        document.head.appendChild(style);
                    }
                    style.textContent = `
                        .quizzes-section::before {
                            top: 0 !important; /* Относительно quizzes-section, который уже сдвинут на margin-top */
                        }
                    `;
                    
                    // Убеждаемся, что внутренний контейнер не имеет отступов
                    const innerContainer = container.querySelector('.container');
                    if (innerContainer) {
                        innerContainer.style.setProperty('margin-top', '0', 'important');
                        innerContainer.style.setProperty('padding-top', '0', 'important');
                        innerContainer.style.setProperty('margin-bottom', '0', 'important');
                        innerContainer.style.setProperty('padding-bottom', '0', 'important');
                        innerContainer.style.setProperty('min-height', '0', 'important');
                    }
                    
                    // Убеждаемся, что loading и error не занимают место
                    const loading = container.querySelector('#loading');
                    const error = container.querySelector('#error');
                    if (loading) {
                        loading.style.setProperty('display', 'none', 'important');
                        loading.style.setProperty('margin', '0', 'important');
                        loading.style.setProperty('padding', '0', 'important');
                        loading.style.setProperty('height', '0', 'important');
                        loading.style.setProperty('min-height', '0', 'important');
                    }
                    if (error) {
                        error.style.setProperty('display', 'none', 'important');
                        error.style.setProperty('margin', '0', 'important');
                        error.style.setProperty('padding', '0', 'important');
                        error.style.setProperty('height', '0', 'important');
                        error.style.setProperty('min-height', '0', 'important');
                    }
                    
                    // Убеждаемся, что quizzes-grid не имеет отступов и начинается сразу
                    const grid = container.querySelector('#quizzes-grid');
                    if (grid) {
                        grid.style.setProperty('margin-top', '0', 'important');
                        grid.style.setProperty('padding-top', '0', 'important');
                        grid.style.setProperty('margin-bottom', '0', 'important');
                        grid.style.setProperty('padding-bottom', '0', 'important');
                    }
                    
                    // Проверяем позицию всех элементов
                    const containerRect = container.getBoundingClientRect();
                    const expectedTop = totalHeight;
                    const actualTop = containerRect.top;
                    const gridRect = grid ? grid.getBoundingClientRect() : null;
                    const firstCard = grid ? grid.querySelector('.quiz-card:first-child') : null;
                    const firstCardRect = firstCard ? firstCard.getBoundingClientRect() : null;
                    
                    console.log('updateContentPadding: expectedTop =', expectedTop, 'actualTop =', actualTop, 'diff =', Math.abs(expectedTop - actualTop));
                    console.log('updateContentPadding: grid top =', gridRect?.top, 'firstCard top =', firstCardRect?.top);
                    
                    // Если карточка все еще ниже, чем нужно, корректируем margin-top
                    if (firstCardRect && Math.abs(firstCardRect.top - expectedTop) > 2) {
                        const correction = firstCardRect.top - expectedTop;
                        console.warn('updateContentPadding: карточка ниже на', correction, 'px, корректируем margin-top...');
                        const newMarginTop = totalHeight - correction;
                        container.style.setProperty('margin-top', newMarginTop + 'px', 'important');
                        console.log('updateContentPadding: новый margin-top =', newMarginTop);
                        this._lastCorrectMarginTop = newMarginTop;
                        this._positionInitialized = true;
                    } else if (firstCardRect && Math.abs(firstCardRect.top - expectedTop) <= 2) {
                        // Позиция правильная - сохраняем и блокируем дальнейшие обновления
                        this._lastCorrectMarginTop = totalHeight;
                        this._positionInitialized = true;
                        console.log('updateContentPadding: позиция правильная, блокируем дальнейшие обновления');
                    }
                    
                    // Если позиция уже была установлена правильно, не перезаписываем ее
                    // НО только если это не изменение размера окна (флаг был сброшен)
                    // Проверяем, изменилась ли высота Hub - если да, нужно обновить позицию
                    if (this._positionInitialized && this._lastCorrectMarginTop !== null && firstCardRect) {
                        const currentMarginTop = parseFloat(container.style.marginTop) || 0;
                        const firstCardTop = firstCardRect.top;
                        const expectedTopFromMargin = this._lastCorrectMarginTop;
                        const diff = Math.abs(firstCardTop - expectedTopFromMargin);
                        
                        // Проверяем, изменилась ли высота Hub
                        const heightDiff = Math.abs(totalHeight - this._lastCorrectMarginTop);
                        
                        // Если высота Hub изменилась (изменение размера окна), нужно обновить позицию
                        if (heightDiff > 5) {
                            console.log('updateContentPadding: высота Hub изменилась на', heightDiff, 'px, обновляем позицию');
                            // Продолжаем обновление позиции
                        } else if (diff < 5 && Math.abs(currentMarginTop - this._lastCorrectMarginTop) < 5) {
                            // Позиция все еще правильная и высота не изменилась - пропускаем обновление
                            console.log('updateContentPadding: позиция уже правильная, пропускаем обновление (diff =', diff, 'px, heightDiff =', heightDiff, 'px)');
                            return;
                        }
                    }
                } else {
                    // Для других контейнеров используем padding-top
                    container.style.setProperty('padding-top', totalHeight + 'px', 'important');
                    container.style.setProperty('margin-top', '0', 'important');
                }
            });
        });
    },
    
    /**
     * Обновляет позицию парящего элемента (body::before)
     * Парящий элемент ВСЕГДА находится ниже Hub2
     */
    updateFloatingElementsPosition() {
        const hub1 = document.getElementById('hub1');
        const hub2 = document.getElementById('hub2');
        
        let totalHeight = 0;
        
        if (hub1 && hub1.style.display !== 'none') {
            totalHeight += hub1.offsetHeight;
        }
        
        if (hub2 && hub2.style.display !== 'none') {
            totalHeight += hub2.offsetHeight;
        }
        
        // Парящий элемент начинается сразу после Hub2 (без отступа)
        const floatingTop = totalHeight;
        
        // Создаем или обновляем стиль для парящего элемента
        let style = document.getElementById('dynamic-floating-position');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-floating-position';
            document.head.appendChild(style);
        }
        style.textContent = `
            body::before {
                top: ${floatingTop}px !important;
                z-index: -1 !important; /* Всегда ниже Hub2 (z-index: 1000) и контента (z-index: 1) */
            }
        `;
    },
    
    /**
     * Адаптирует размер фразы под ширину логотипа (для Hub2)
     */
    adaptSubtitleToLogo() {
        const logo = document.querySelector('.hub2-logo-section .logo');
        const subtitle = document.querySelector('.hub2-logo-section .subtitle');
        
        if (!logo || !subtitle) return;
        
        function adjustSize() {
            const logoWidth = logo.offsetWidth;
            if (logoWidth === 0) return;
            
            const baseFontSize = parseFloat(window.getComputedStyle(subtitle).fontSize) || 50;
            
            let minFontSize = 10;
            let maxFontSize = 200;
            let bestFontSize = baseFontSize;
            const tolerance = 2;
            
            for (let i = 0; i < 20; i++) {
                const testFontSize = (minFontSize + maxFontSize) / 2;
                subtitle.style.fontSize = testFontSize + 'px';
                
                void subtitle.offsetWidth;
                
                const subtitleWidth = subtitle.scrollWidth;
                
                if (Math.abs(subtitleWidth - logoWidth) < tolerance) {
                    bestFontSize = testFontSize;
                    break;
                } else if (subtitleWidth < logoWidth) {
                    minFontSize = testFontSize;
                    bestFontSize = testFontSize;
                } else {
                    maxFontSize = testFontSize;
                }
            }
            
            subtitle.style.fontSize = (bestFontSize * 0.98) + 'px';
        }
        
        if (logo.complete) {
            adjustSize();
        } else {
            logo.addEventListener('load', adjustSize, { once: true });
            logo.addEventListener('error', adjustSize, { once: true });
        }
        
        setTimeout(adjustSize, 100);
    },
    
    /**
     * Инициализирует обработчики изменения размера окна
     */
    initResizeHandlers() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // При изменении размера окна всегда обновляем позиции
                // Сбрасываем флаг, чтобы разрешить обновление
                this._positionInitialized = false;
                this._lastCorrectMarginTop = null;
                
                console.log('resize: обновляем позиции после изменения размера окна');
                
                // Обновляем позиции в правильном порядке
                this.updateHub2Position();
                // Используем requestAnimationFrame для гарантии правильной отрисовки
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this.updateContentPadding();
                        this.updateFloatingElementsPosition();
                        this.adaptSubtitleToLogo();
                    });
                });
            }, 100);
        });
    },
    
    /**
     * Применяет цвет выбранного персонажа к кнопкам
     */
    applyCharacterColor() {
        const savedColor = localStorage.getItem('selectedCharacterColor');
        if (savedColor) {
            const buttons = document.querySelectorAll('.hub1-button');
            buttons.forEach(button => {
                // Применяем только если кнопка не имеет специального цвета
                if (!button.dataset.noColor) {
                    button.style.background = savedColor;
                }
            });
        }
    }
};

