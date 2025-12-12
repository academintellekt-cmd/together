# Система фреймов - Документация

## Обзор

Единая система layout с 5 логическими фреймами для всех страниц сайта.

## Структура фреймов

### Frame 1 - Панель с кнопками
- **Назначение**: Выбор режимов, навигация, основные действия
- **Поведение**: Всегда видим при прокрутке (sticky)
- **Высота**: Динамическая, зависит от содержимого
- **Адаптивность**: 
  - Desktop: кнопки в одну строку с переносом
  - Mobile: горизонтальный скролл или перенос на две строки

### Frame 2 - Логотип + фраза
- **Назначение**: Идентификация проекта и короткое сообщение
- **Поведение**: Всегда видим при прокрутке (sticky)
- **Высота**: Максимум 20vh, адаптивно уменьшается на маленьких экранах
- **Содержимое**: Логотип (max-height: 60% от высоты фрейма) + текст

### Frame 3 - Основной контент
- **Назначение**: Главная рабочая область (квизы, вопросы, рейтинги)
- **Поведение**: Прокручиваемая область
- **Особенности**: 
  - Декоративные "парящие" элементы не мешают кликам (pointer-events: none)
  - Контентный слой с z-index выше декоративного

### Frame 4 - Правила безопасности
- **Назначение**: Правила безопасности
- **Поведение**: Всегда внизу страницы, после основного контента

### Frame 5 - Информация о создателе
- **Назначение**: Информация о создателе и юридические данные
- **Поведение**: Всегда после Frame 4

## Использование

### Базовая структура HTML

```html
<body>
    <div class="site-wrapper">
        <header class="site-header">
            <div class="frame frame-1" data-frame="controls">
                <!-- Frame 1 содержимое -->
            </div>
            <div class="frame frame-2" data-frame="logo">
                <!-- Frame 2 содержимое -->
            </div>
        </header>
        <main class="site-main">
            <section class="frame frame-3" data-frame="content">
                <div class="frame-3-decor"></div>
                <div class="frame-3-content">
                    <!-- Уникальный контент страницы -->
                </div>
            </section>
            <footer class="site-footer">
                <section class="frame frame-4" data-frame="rules">
                    <!-- Правила безопасности -->
                </section>
                <section class="frame frame-5" data-frame="about">
                    <!-- Информация о создателе -->
                </section>
            </footer>
        </main>
    </div>
</body>
```

### Управление видимостью фреймов

Используйте `window.pageLayoutConfig` для управления видимостью фреймов:

```javascript
window.pageLayoutConfig = {
    showFrame1: true,   // Показать Frame 1
    showFrame2: false,  // Скрыть Frame 2
    showFrame4: true,   // Показать Frame 4
    showFrame5: true    // Показать Frame 5
};
```

### Программное управление

```javascript
// Скрыть Frame 2
LayoutManager.setFrameVisibility(2, false);

// Показать Frame 2
LayoutManager.setFrameVisibility(2, true);

// Переключить видимость Frame 2
LayoutManager.toggleFrame(2);

// Проверить видимость Frame 2
const isVisible = LayoutManager.isFrameVisible(2);
```

## Файловая структура

```
/public
  /styles
    base.css        - Базовые стили (reset, шрифты, переменные, цвета)
    layout.css      - Сетка, размеры фреймов, адаптивность
    components.css  - Стили кнопок, карточек, декоративных элементов
  /scripts
    layout.js       - Логика скрытия фреймов, общие обработчики
```

## Адаптивность

Система автоматически адаптируется под разные размеры экранов:

- **Desktop**: min-width: 1024px
- **Tablet**: 768px - 1023px
- **Mobile**: max-width: 767px

### Особенности адаптивности

- Использование `clamp()` для плавного масштабирования размеров
- Избегание фиксированных высот (использование min-height, max-height, проценты и vh)
- Логотип скейлится по высоте, а не по ширине
- Frame 1 на мобильных может иметь горизонтальный скролл

## Интеграция с Frame1 и Frame2

Система фреймов использует Frame1 и Frame2:

- Frame1 - панель с кнопками (Frame 1)
- Frame2 - логотип и фраза (Frame 2)
- Старые страницы продолжают работать без изменений

## CSS переменные

Основные переменные определены в `base.css`:

```css
:root {
    --color-bg: #f2f2f2;
    --color-dark: #393639;
    --spacing-xs: 4px;
    --spacing-s: 8px;
    --spacing-m: 16px;
    --z-index-frame-1: 1001;
    --z-index-frame-2: 1000;
    /* ... и другие */
}
```

## Примеры использования

### Пример 1: Страница с скрытым Frame 2

```html
<script>
    window.pageLayoutConfig = {
        showFrame1: true,
        showFrame2: false,  // Скрываем логотип
        showFrame4: true,
        showFrame5: true
    };
</script>
```

### Пример 2: Страница только с контентом

```html
<script>
    window.pageLayoutConfig = {
        showFrame1: false,
        showFrame2: false,
        showFrame4: false,
        showFrame5: false
    };
</script>
```

## Миграция существующих страниц

Для миграции существующих страниц:

1. Подключите новые стили:
   ```html
   <link rel="stylesheet" href="/styles/base.css">
   <link rel="stylesheet" href="/styles/layout.css">
   <link rel="stylesheet" href="/styles/components.css">
   ```

2. Подключите layout.js:
   ```html
   <script src="/scripts/layout.js"></script>
   ```

3. Обновите HTML структуру согласно шаблону

4. Настройте видимость фреймов через `window.pageLayoutConfig`


