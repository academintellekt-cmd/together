/**
 * Общие функции для Frame1 и Frame2
 * Оптимизированная версия с улучшенными алгоритмами и правилами вызовов
 */

const FrameCommon = {
    // Флаги для предотвращения множественных вызовов
    _initialized: false,
    _resizeHandlerAttached: false,
    _positionUpdateScheduled: false,
    _subtitleUpdateScheduled: false,
    
    // Кэш для элементов
    _logo: null,
    _subtitle: null,
    _frame1: null,
    _frame2: null,
    
    /**
     * Инициализация общего модуля
     * Вызывается один раз при загрузке страницы
     */
    init() {
        if (this._initialized) return;
        
        // Кэшируем элементы
        this._logo = document.querySelector('.frame2-logo-section .logo');
        this._subtitle = document.querySelector('.frame2-logo-section .subtitle');
        this._frame1 = document.getElementById('frame1');
        this._frame2 = document.getElementById('frame2');
        
        // Инициализируем обработчики resize один раз
        if (!this._resizeHandlerAttached) {
            this.initResizeHandlers();
            this._resizeHandlerAttached = true;
        }
        
        // Первоначальная настройка после загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.scheduleInitialUpdate();
            });
        } else {
            this.scheduleInitialUpdate();
        }
        
        this._initialized = true;
    },
    
    /**
     * Планирует первоначальное обновление с задержкой для гарантии отрисовки
     */
    scheduleInitialUpdate() {
        // Используем requestAnimationFrame для гарантии правильной отрисовки
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.updateFrame2Position();
                this.adaptLogoSize();
                // Небольшая задержка перед адаптацией подзаголовка, чтобы логотип успел обновиться
                setTimeout(() => {
                    this.adaptSubtitleToLogo();
                }, 100);
                this.applyCharacterColor();
            });
        });
    },
    
    /**
     * Адаптирует размер логотипа
     * Теперь использует только фиксированные значения из CSS (без адаптивности)
     */
    adaptLogoSize() {
        const logo = this._logo || document.querySelector('.frame2-logo-section .logo');
        if (!logo) return;
        
        // Обновляем кэш
        this._logo = logo;
        
        // Отменяем предыдущий запланированный вызов
        if (this._logoUpdateTimeout) {
            clearTimeout(this._logoUpdateTimeout);
        }
        
        // Планируем обновление с debounce
        this._logoUpdateTimeout = setTimeout(() => {
            this._performLogoSizeAdjustment(logo);
        }, 50);
    },
    
    /**
     * Выполняет фактическую корректировку размера логотипа
     * Использует фиксированное значение из CSS переменной (без адаптивности)
     */
    _performLogoSizeAdjustment(logo) {
        // Удаляем inline стили, чтобы использовалось значение из CSS
        logo.style.maxHeight = '';
        
        // Принудительный reflow для применения CSS изменений
        void logo.offsetWidth;
        
        // Не устанавливаем inline стили - используем только CSS
        // Размер логотипа теперь полностью управляется через CSS без адаптивности
    },
    
    /**
     * Адаптирует размер фразы под ширину логотипа (для Frame2)
     * Оптимизированный алгоритм с debounce
     */
    adaptSubtitleToLogo() {
        // Проверяем наличие элементов
        const logo = this._logo || document.querySelector('.frame2-logo-section .logo');
        const subtitle = this._subtitle || document.querySelector('.frame2-logo-section .subtitle');
        
        if (!logo || !subtitle) return;
        
        // Обновляем кэш
        this._logo = logo;
        this._subtitle = subtitle;
        
        // Отменяем предыдущий запланированный вызов
        if (this._subtitleUpdateTimeout) {
            clearTimeout(this._subtitleUpdateTimeout);
        }
        
        // Планируем обновление с debounce
        this._subtitleUpdateTimeout = setTimeout(() => {
            this._performSubtitleAdjustment(logo, subtitle);
        }, 50);
    },
    
    /**
     * Выполняет фактическую корректировку размера подзаголовка
     */
    _performSubtitleAdjustment(logo, subtitle) {
        const logoWidth = logo.offsetWidth;
        if (logoWidth === 0) {
            // Если логотип еще не загружен, ждем
            if (!logo.complete) {
                logo.addEventListener('load', () => this.adaptSubtitleToLogo(), { once: true });
                logo.addEventListener('error', () => this.adaptSubtitleToLogo(), { once: true });
            }
            return;
        }
        
        // Получаем текущий размер шрифта из CSS
        const computedStyle = window.getComputedStyle(subtitle);
        const baseFontSize = parseFloat(computedStyle.fontSize) || 50;
        
        // Бинарный поиск оптимального размера
        let minFontSize = Math.max(10, baseFontSize * 0.3);
        let maxFontSize = Math.min(200, baseFontSize * 2);
        let bestFontSize = baseFontSize;
        const tolerance = 2;
        const maxIterations = 20;
        
        for (let i = 0; i < maxIterations; i++) {
            const testFontSize = (minFontSize + maxFontSize) / 2;
            subtitle.style.fontSize = testFontSize + 'px';
            
            // Принудительный reflow
            void subtitle.offsetWidth;
            
            const subtitleWidth = subtitle.scrollWidth;
            const diff = Math.abs(subtitleWidth - logoWidth);
            
            if (diff < tolerance) {
                bestFontSize = testFontSize;
                break;
            } else if (subtitleWidth < logoWidth) {
                minFontSize = testFontSize;
                bestFontSize = testFontSize;
            } else {
                maxFontSize = testFontSize;
            }
        }
        
        // Устанавливаем размер с небольшим отступом для читаемости
        subtitle.style.fontSize = (bestFontSize * 0.98) + 'px';
    },
    
    /**
     * Обновляет позицию Frame2 относительно Frame1
     * Оптимизированная версия с использованием CSS Grid (sticky positioning)
     */
    updateFrame2Position() {
        // Отменяем предыдущий запланированный вызов
        if (this._positionUpdateTimeout) {
            clearTimeout(this._positionUpdateTimeout);
        }
        
        // Планируем обновление с debounce
        this._positionUpdateTimeout = setTimeout(() => {
            this._performPositionUpdate();
        }, 50);
    },
    
    /**
     * Выполняет фактическое обновление позиции
     */
    _performPositionUpdate() {
        const frame1 = this._frame1 || document.getElementById('frame1');
        const frame2 = this._frame2 || document.getElementById('frame2');
        
        if (!frame1 || !frame2) {
            // Обновляем кэш для следующего вызова
            this._frame1 = frame1;
            this._frame2 = frame2;
            return;
        }
        
        // Обновляем кэш
        this._frame1 = frame1;
        this._frame2 = frame2;
        
        // Используем getBoundingClientRect для точного измерения
        const frame1Rect = frame1.getBoundingClientRect();
        const frame1Height = frame1Rect.height;
        
        // Устанавливаем top для Frame2 (для sticky positioning)
        // В CSS Grid это должно работать автоматически, но на всякий случай обновляем
        if (frame2.style.top !== frame1Height + 'px') {
            frame2.style.top = frame1Height + 'px';
        }
        
        // После обновления позиции frame2, обновляем размер логотипа
        // чтобы он не перекрывался с frame1
        const logo = this._logo || document.querySelector('.frame2-logo-section .logo');
        if (logo) {
            this.adaptLogoSize();
        }
    },
    
    /**
     * Инициализирует обработчики изменения размера окна
     * Оптимизированная версия с debounce и единым обработчиком
     */
    initResizeHandlers() {
        if (this._resizeHandlerAttached) return;
        
        let resizeTimeout;
        const resizeHandler = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Обновляем кэш элементов
                this._logo = document.querySelector('.frame2-logo-section .logo');
                this._subtitle = document.querySelector('.frame2-logo-section .subtitle');
                this._frame1 = document.getElementById('frame1');
                this._frame2 = document.getElementById('frame2');
                
                // Обновляем позиции и размеры
                this.updateFrame2Position();
                // Сначала обновляем размер логотипа
                this.adaptLogoSize();
                // Затем адаптируем подзаголовок под новый размер логотипа
                setTimeout(() => {
                    this.adaptSubtitleToLogo();
                }, 50);
            }, 150); // Увеличенный debounce для лучшей производительности
        };
        
        window.addEventListener('resize', resizeHandler, { passive: true });
        this._resizeHandlerAttached = true;
    },
    
    /**
     * Применяет цвет выбранного персонажа к кнопкам
     * Оптимизированная версия с кэшированием
     */
    applyCharacterColor() {
        const savedColor = localStorage.getItem('selectedCharacterColor');
        if (!savedColor) return;
        
        const buttons = document.querySelectorAll('.frame1-button:not([data-no-color])');
        buttons.forEach(button => {
            if (!button.dataset.noColor) {
                button.style.background = savedColor;
            }
        });
    },
    
    /**
     * Обновляет все позиции и размеры
     * Удобный метод для вызова после динамических изменений
     */
    refresh() {
        this.updateFrame2Position();
        this.adaptLogoSize();
        setTimeout(() => {
            this.adaptSubtitleToLogo();
        }, 50);
    },
    
};

