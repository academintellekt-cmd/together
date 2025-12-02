# Шаблон структуры страницы с системой фреймов

## Базовая HTML-структура

Все страницы должны использовать следующую структуру:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Название страницы</title>
    
    <!-- Подключение стилей -->
    <link rel="stylesheet" href="/styles/base.css">
    <link rel="stylesheet" href="/styles/layout.css">
    <link rel="stylesheet" href="/styles/components.css">
    <link rel="stylesheet" href="/styles/brand-style.css">
    <!-- Дополнительные стили страницы -->
    
    <!-- Конфигурация видимости фреймов -->
    <script>
        window.pageLayoutConfig = {
            showFrame1: true,   // Панель кнопок
            showFrame2: true,   // Логотип + фраза
            showFrame4: true,   // Правила безопасности
            showFrame5: true    // Информация о создателе
        };
    </script>
</head>
<body>
    <div class="site-wrapper">
        <!-- HEADER: Frame 1 и Frame 2 -->
        <header class="site-header">
            <!-- Frame 1: Панель с кнопками -->
            <div class="frame frame-1" data-frame="controls">
                <!-- Содержимое Frame 1 будет создано через Frame1.js -->
            </div>

            <!-- Frame 2: Логотип + фраза -->
            <div class="frame frame-2" data-frame="logo">
                <!-- Содержимое Frame 2 будет создано через Frame2.js -->
            </div>
        </header>

        <!-- MAIN: Frame 3 -->
        <main class="site-main">
            <section class="frame frame-3" data-frame="content">
                <!-- Декоративный слой для парящих элементов -->
                <div class="frame-3-decor"></div>
                
                <!-- Контентный слой -->
                <div class="frame-3-content">
                    <!-- УНИКАЛЬНОЕ СОДЕРЖИМОЕ СТРАНИЦЫ -->
                    <!-- Здесь размещается контент конкретной страницы -->
                </div>
            </section>

            <!-- FOOTER: Frame 4 и Frame 5 -->
            <footer class="site-footer">
                <!-- Frame 4: Правила безопасности -->
                <section class="frame frame-4" data-frame="rules">
                    <p>Правила безопасности: Будьте внимательны и соблюдайте правила игры.</p>
                </section>

                <!-- Frame 5: Информация о создателе -->
                <section class="frame frame-5" data-frame="about">
                    <p>© 2024 ВМЕСТЕ. Все права защищены.</p>
                </section>
            </footer>
        </main>
    </div>

    <!-- Подключение скриптов -->
    <script src="/scripts/layout.js"></script>
    <script src="/scripts/frame-common.js"></script>
    <script src="/scripts/frame1.js"></script>
    <script src="/scripts/frame2.js"></script>
    <!-- Дополнительные скрипты страницы -->
    
    <script>
        // Инициализация Frame1 и Frame2
        document.addEventListener('DOMContentLoaded', () => {
            // Инициализация Frame1 (Frame 1)
            if (typeof Frame1 !== 'undefined') {
                Frame1.init({
                    showLogin: true,
                    showSettings: true,
                    showBack: false
                });
            }
            
            // Инициализация Frame2 (Frame 2)
            if (typeof Frame2 !== 'undefined') {
                Frame2.init({
                    showLogo: true,
                    showSubtitle: true
                });
            }
        });
    </script>
</body>
</html>
```

## Структура фреймов

### Frame 1 - Панель с кнопками
- **Класс**: `.frame.frame-1`
- **Функция**: Навигация, выбор режимов, основные действия
- **Поведение**: Всегда видим при прокрутке (sticky)
- **Содержимое**: Создается через `Frame1.js`

### Frame 2 - Логотип + фраза
- **Класс**: `.frame.frame-2`
- **Функция**: Идентификация проекта
- **Поведение**: Всегда видим при прокрутке (sticky), max-height: 20vh
- **Содержимое**: Создается через `Frame2.js`

### Frame 3 - Основной контент
- **Класс**: `.frame.frame-3`
- **Функция**: Главная рабочая область (квизы, вопросы, рейтинги)
- **Поведение**: Прокручиваемая область
- **Содержимое**: Уникальное для каждой страницы

### Frame 4 - Правила безопасности
- **Класс**: `.frame.frame-4`
- **Функция**: Правила безопасности
- **Поведение**: Всегда внизу страницы

### Frame 5 - Информация о создателе
- **Класс**: `.frame.frame-5`
- **Функция**: Информация о создателе и юридические данные
- **Поведение**: Всегда после Frame 4

## Управление видимостью фреймов

Используйте `window.pageLayoutConfig` для управления видимостью фреймов на конкретной странице:

```javascript
window.pageLayoutConfig = {
    showFrame1: true,   // Показать Frame 1
    showFrame2: false,  // Скрыть Frame 2
    showFrame4: true,   // Показать Frame 4
    showFrame5: true    // Показать Frame 5
};
```

## Адаптивность

Система автоматически адаптируется под разные размеры экранов:
- **Desktop**: min-width: 1024px
- **Tablet**: 768px - 1023px
- **Mobile**: max-width: 767px
