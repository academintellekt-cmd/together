/**
 * Общий скрипт для обновления года в Frame 5 на всех страницах
 * Автоматически обновляет год при загрузке страницы
 */
(function() {
    'use strict';
    
    /**
     * Обновляет год в Frame 5 на текущий год
     */
    function updateCopyrightYear() {
        const currentYear = new Date().getFullYear();
        const copyrightText = `© ${currentYear} ВМЕСТЕ. Все права защищены.`;
        
        // Ищем все возможные Frame 5 элементы
        const frame5Selectors = [
            '#frame5',
            '#hub5',
            '.frame-5',
            'section[data-frame="about"]'
        ];
        
        const frame5Elements = [];
        frame5Selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!frame5Elements.includes(el)) {
                    frame5Elements.push(el);
                }
            });
        });
        
        // Обновляем содержимое во всех найденных Frame 5
        frame5Elements.forEach(frame5 => {
            const p = frame5.querySelector('p');
            if (p) {
                // Обновляем только если содержит "ВМЕСТЕ" (чтобы не трогать кастомный контент)
                if (p.textContent.includes('ВМЕСТЕ')) {
                    p.textContent = copyrightText;
                }
            } else if (frame5.textContent.includes('ВМЕСТЕ')) {
                // Если нет параграфа, обновляем напрямую
                frame5.innerHTML = `<p>${copyrightText}</p>`;
            }
        });
    }
    
    /**
     * Инициализация при загрузке страницы
     */
    function init() {
        // Обновляем сразу, если DOM уже загружен
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateCopyrightYear);
        } else {
            updateCopyrightYear();
        }
        
        // Также обновляем после небольшой задержки (на случай, если Frame 5 создается динамически)
        setTimeout(updateCopyrightYear, 100);
        setTimeout(updateCopyrightYear, 500);
    }
    
    // Запускаем инициализацию
    init();
    
    // Экспортируем функцию для ручного обновления (если нужно)
    window.updateFrame5Copyright = updateCopyrightYear;
})();



