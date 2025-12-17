/**
 * Автоматически делает первую букву заглавной для всех элементов с шрифтом Caveat
 * Работает на всех страницах сайта
 */
(function() {
    'use strict';
    
    /**
     * Делает первую букву заглавной в тексте элемента
     */
    function capitalizeFirstLetter(text) {
        if (!text || text.length === 0) return text;
        // Находим первую букву (игнорируя пробелы и специальные символы)
        const firstLetterMatch = text.match(/[а-яёa-z]/i);
        if (!firstLetterMatch) return text;
        
        const firstLetterIndex = text.indexOf(firstLetterMatch[0]);
        return text.substring(0, firstLetterIndex) + 
               firstLetterMatch[0].toUpperCase() + 
               text.substring(firstLetterIndex + 1);
    }
    
    /**
     * Обновляет первую букву для элементов с шрифтом Caveat
     */
    function updateCaveatElements() {
        // Селекторы для элементов с шрифтом Caveat
        const caveatSelectors = [
            '.quiz-phrase',
            '.quiz-info-highlight',
            '.frame2-logo-section .subtitle',
            '.quiz-card.has-phrase .quiz-info-item',
            '.quiz-card.has-phrase .quiz-info-item span:last-child'
        ];
        
        // Исключаем элементы, которые содержат "по" (секунды) - они должны быть с маленькой буквы
        const excludeSelectors = [
            '.quiz-info-item span:contains("по")',
            '.quiz-info-item span:contains("По")'
        ];
        
        // Также ищем элементы с inline стилями, содержащими Caveat
        const allElements = document.querySelectorAll('*');
        allElements.forEach(element => {
            const style = window.getComputedStyle(element);
            const fontFamily = style.fontFamily;
            
            // Проверяем, используется ли шрифт Caveat
            if (fontFamily && fontFamily.includes('Caveat')) {
                // Пропускаем элементы, которые содержат "по" (секунды)
                const text = element.textContent;
                if (text && (text.includes('по ') || text.includes('По '))) {
                    return; // Не обрабатываем элементы с "по"
                }
                
                // Проверяем, не обрабатывали ли мы уже этот элемент
                if (!element.dataset.caveatCapitalized) {
                    if (text && text.trim().length > 0) {
                        // Проверяем, начинается ли текст уже с заглавной буквы
                        const firstChar = text.trim()[0];
                        if (firstChar && firstChar === firstChar.toLowerCase() && /[а-яёa-z]/.test(firstChar)) {
                            element.textContent = capitalizeFirstLetter(text);
                            element.dataset.caveatCapitalized = 'true';
                        } else {
                            element.dataset.caveatCapitalized = 'true';
                        }
                    }
                }
            }
        });
        
        // Обрабатываем элементы по селекторам
        caveatSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                // Пропускаем элементы, которые содержат "по" (секунды)
                const text = element.textContent;
                if (text && (text.includes('по ') || text.includes('По '))) {
                    return; // Не обрабатываем элементы с "по"
                }
                
                if (!element.dataset.caveatCapitalized) {
                    if (text && text.trim().length > 0) {
                        const firstChar = text.trim()[0];
                        if (firstChar && firstChar === firstChar.toLowerCase() && /[а-яёa-z]/.test(firstChar)) {
                            element.textContent = capitalizeFirstLetter(text);
                        }
                        element.dataset.caveatCapitalized = 'true';
                    }
                }
            });
        });
    }
    
    /**
     * Инициализация при загрузке страницы
     */
    function init() {
        // Обновляем сразу, если DOM уже загружен
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateCaveatElements();
                // Также обновляем после небольшой задержки (на случай динамического контента)
                setTimeout(updateCaveatElements, 100);
                setTimeout(updateCaveatElements, 500);
            });
        } else {
            updateCaveatElements();
            setTimeout(updateCaveatElements, 100);
            setTimeout(updateCaveatElements, 500);
        }
        
        // Наблюдаем за изменениями DOM для динамически добавляемых элементов
        const observer = new MutationObserver(() => {
            updateCaveatElements();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Запускаем инициализацию
    init();
    
    // Экспортируем функцию для ручного обновления (если нужно)
    window.updateCaveatCapitalization = updateCaveatElements;
})();

