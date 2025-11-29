# 📐 ШАБЛОН СТРУКТУРЫ СТРАНИЦЫ
## Единый стандарт для всех страниц проекта "ВМЕСТЕ"

**Эталонная страница:** `public/host.html`

---

## 🏗️ СТРУКТУРА HUB-ЗОН

Все страницы должны использовать единую структуру из 5 HUB-зон:

```
┌─────────────────────────────────────────┐
│  HUB1 (fixed, top: 0, z-index: 1001)   │ ← Кнопки, таймеры, статусы
├─────────────────────────────────────────┤
│  HUB2 (fixed, под HUB1, z-index: 1000)  │ ← Логотип + подпись (опционально)
├─────────────────────────────────────────┤
│  HUB3 (flex, основной контент)          │ ← Вся основная информация
│  ┌─────────────────────────────────┐   │
│  │  .container (z-index: 2)         │   │
│  │  - Ваш контент здесь             │   │
│  └─────────────────────────────────┘   │
│  [Парящие элементы (z-index: -1)]       │ ← Декоративные blob-ы
├─────────────────────────────────────────┤
│  HUB4 (fixed, над HUB5, z-index: 999)  │ ← Вспомогательные элементы
├─────────────────────────────────────────┤
│  HUB5 (fixed, bottom: 0, z-index: 999)  │ ← Глобальные элементы
└─────────────────────────────────────────┘
```

---

## 📋 ОБЯЗАТЕЛЬНАЯ HTML СТРУКТУРА

### 1. HEAD секция

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Название страницы</title>
    
    <!-- ОБЯЗАТЕЛЬНЫЕ CSS файлы -->
    <link rel="stylesheet" href="/styles/brand-style.css">
    <link rel="stylesheet" href="/styles/hub1.css">
    <link rel="stylesheet" href="/styles/hub2.css">
    
    <!-- Шрифты -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Days+One&family=Handlee&family=Kalam:wght@300;400;700&family=Open+Sans:wght@400;500;600;700&family=Montserrat:wght@400;600;700;800&family=Nunito:wght@400;600;700;800&family=Poppins:wght@400;600;700;800;900&family=Permanent+Marker&display=swap" rel="stylesheet">
    
    <!-- ОБЯЗАТЕЛЬНЫЕ JavaScript файлы -->
    <script src="/scripts/hub-common.js"></script>
    <script src="/scripts/hub1.js"></script>
    <script src="/scripts/hub2.js"></script>
    
    <style>
        /* Стили страницы (см. раздел CSS) */
    </style>
</head>
```

### 2. BODY структура

```html
<body class="with-hub">
    
    <!-- МОДАЛЬНЫЕ ОКНА (если нужны) -->
    <!-- Всегда в самом верху body, z-index: 10000+ -->
    <div id="modal" style="display: none; position: fixed; z-index: 10000;">
        <!-- Содержимое модального окна -->
    </div>

    <!-- HUB3: ОСНОВНАЯ ЗОНА КОНТЕНТА -->
    <div class="hub-zone hub3">
        <div class="container">
            <!-- ВСЯ ОСНОВНАЯ ИНФОРМАЦИЯ ЗДЕСЬ -->
            <!-- Карточки, текст, формы, вопросы и т.д. -->
        </div>
    </div>

    <!-- HUB4: НИЖНЯЯ ПОЛОСА (fixed, над HUB5) -->
    <div id="hub4" class="hub-zone hub4">
        <!-- Вспомогательные статусы, подсказки, маленькие карточки -->
    </div>

    <!-- HUB5: САМАЯ НИЖНЯЯ ПОЛОСА (fixed, внизу экрана) -->
    <div id="hub5" class="hub-zone hub5">
        <!-- "Правила хаба", ссылки, переключение режимов -->
    </div>

    <script>
        // Инициализация и обработчики (см. раздел JavaScript)
    </script>
</body>
</html>
```

**ВАЖНО:**
- HUB1 и HUB2 создаются автоматически через `hub1.js` и `hub2.js` (не нужно добавлять вручную)
- Всегда используйте `id="hub4"` и `id="hub5"` для нижних зон
- Модальные окна должны быть в самом верху `<body>`

---

## 🎨 ОБЯЗАТЕЛЬНЫЕ CSS СТИЛИ

### 1. Базовые стили body

```css
body {
    font-family: 'Montserrat', sans-serif;
    min-height: 100vh;
    background: #f2f2f2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 0 20px 20px 20px;
    position: relative;
    /* padding-bottom будет обновляться динамически через JavaScript для HUB4/HUB5 */
}
```

### 2. Базовый класс HUB-зон

```css
/* Базовый класс для любой HUB-зоны */
.hub-zone {
    width: 100%;
    box-sizing: border-box;
}
```

### 3. HUB3 — основная зона контента

```css
/* HUB3 — основная зона контента */
.hub3 {
    flex: 1 0 auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}

/* Внутренний контейнер внутри HUB3 */
.hub3 > .container {
    margin: 0 auto;
    max-width: 800px; /* Настройте под вашу страницу */
    width: 100%;
    text-align: center;
    position: relative;
    z-index: 2; /* Ниже Hub1 (1001), Hub2 (1000), HUB4/HUB5 (999), но выше парящих элементов (z-index: -1) */
}
```

### 4. HUB4 и HUB5 — нижние полосы

```css
/* HUB4 и HUB5 — нижние полосы, фиксированные снизу (как HUB1/HUB2 сверху) */
.hub4,
.hub5 {
    position: fixed;
    left: 0;
    right: 0;
    background: var(--hub1-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: var(--hub1-padding);
    min-height: auto;
    box-sizing: border-box;
    width: 100%;
    z-index: 999; /* Ниже HUB1 (1001) и HUB2 (1000), но выше парящих элементов (z-index: -1) */
    transition: bottom 0.3s ease;
    will-change: bottom;
}

/* HUB5 — самая нижняя полоса (фиксирована внизу) */
.hub5 {
    bottom: 0;
}

/* HUB4 — над HUB5 (bottom будет рассчитываться динамически через JavaScript) */
.hub4 {
    bottom: auto; /* Устанавливается динамически через JavaScript в hub-common.js */
}
```

### 5. Парящие элементы

```css
/* Парящие элементы */
body::before {
    content: '';
    position: fixed;
    /* top устанавливается динамически через JavaScript */
    left: -50px;
    width: 200px;
    height: 200px;
    background: #d6fbbf; /* Парящий элемент */
    border-radius: 50% 40% 60% 30%;
    opacity: 0.9;
    z-index: -1; /* Ниже HUB1 (1001), HUB2 (1000), HUB4/HUB5 (999) и контента HUB3 (2), но выше фона */
    animation: wobble 6s ease-in-out infinite;
    pointer-events: none;
}

body::after {
    content: '';
    position: fixed;
    /* bottom устанавливается динамически через JavaScript */
    right: -80px;
    width: 250px;
    height: 250px;
    background: #fececd; /* Парящий элемент */
    border-radius: 40% 50% 30% 60%;
    opacity: 0.9;
    z-index: -1; /* Ниже HUB1 (1001), HUB2 (1000), HUB4/HUB5 (999) и контента HUB3 (2), но выше фона */
    animation: wobble 8s ease-in-out infinite reverse;
    pointer-events: none;
}

@keyframes wobble {
    0%, 100% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(5deg) scale(1.1); }
    50% { transform: rotate(-5deg) scale(0.9); }
    75% { transform: rotate(3deg) scale(1.05); }
}
```

### 6. Адаптивные стили для HUB4 и HUB5

```css
/* Адаптивные стили для HUB4 и HUB5 (соответствуют HUB1) */
@media (min-width: 1024px) {
    .hub4, .hub5 {
        padding: 15px 40px;
    }
}

@media (max-width: 1023px) and (min-width: 769px) {
    .hub4, .hub5 {
        padding: 15px 30px;
    }
}

@media (max-width: 768px) {
    .hub4, .hub5 {
        padding: 12px 15px;
    }
}

@media (max-width: 480px) {
    .hub4, .hub5 {
        padding: 10px 12px;
    }
}

@media (max-width: 360px) {
    .hub4, .hub5 {
        padding: 10px 10px;
    }
}
```

---

## 📊 Z-INDEX ИЕРАРХИЯ (ОБЯЗАТЕЛЬНО СОБЛЮДАТЬ)

```
HUB1:           1001  (самый верхний, fixed, top: 0)
HUB2:           1000  (fixed, под HUB1)
HUB4/HUB5:      999   (fixed, снизу экрана)
Контент HUB3:   2     (в потоке документа)
Парящие:        -1    (fixed, декоративные элементы)
Фон:            0     (по умолчанию)
```

**Правило:** Парящие элементы НЕ должны перекрывать HUB1, HUB2, HUB4, HUB5.

---

## 🔧 ОБЯЗАТЕЛЬНЫЙ JAVASCRIPT КОД

### 1. Инициализация HUB1 и HUB2

```javascript
// Инициализация Hub1 и Hub2 после загрузки скриптов
(function() {
    function initHubs() {
        try {
            // Проверяем, что скрипты загружены
            if (typeof Hub1 === 'undefined' || typeof Hub2 === 'undefined' || typeof HubCommon === 'undefined') {
                console.warn('Hub скрипты еще не загружены, повторная попытка через 100мс...');
                setTimeout(initHubs, 100);
                return;
            }
            
            console.log('Инициализация Hub1 и Hub2...');
            
            // Инициализация Hub1 (настройте под вашу страницу)
            Hub1.init({
                showLogin: false,      // Показывать кнопку "Войти"?
                showJoystick: false,   // Показывать "Настройки джойстика"?
                showBack: false,       // Показывать кнопку "Назад"?
                backUrl: '/index.html' // URL для кнопки "Назад"
                // Добавьте другие опции по необходимости
            });
            
            // Инициализация Hub2 (если нужен логотип)
            Hub2.init();
            
            // Обновление позиций - ждем полной отрисовки
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        HubCommon.updateHub2Position();
                        HubCommon.updateHub4Position();
                        HubCommon.updateContentPadding('.hub3 > .container');
                        HubCommon.updateFloatingElementsPosition();
                        HubCommon.updateBodyPaddingBottom();
                        HubCommon.adaptSubtitleToLogo();
                        
                        console.log('Hub1 и Hub2 успешно инициализированы');
                    });
                });
            });
        } catch (error) {
            console.error('Ошибка при инициализации Hub:', error);
        }
    }
    
    // Запускаем инициализацию после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initHubs, 200);
        });
    } else {
        setTimeout(initHubs, 200);
    }
})();
```

### 2. Обработчик изменения размера окна

```javascript
// Обновляем позицию при изменении размера окна
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (typeof HubCommon !== 'undefined') {
            HubCommon.updateHub2Position();
            HubCommon.updateHub4Position();
            HubCommon.updateContentPadding('.hub3 > .container');
            HubCommon.updateFloatingElementsPosition();
            HubCommon.updateBodyPaddingBottom();
        }
    }, 100);
});
```

### 3. Обновление позиций при изменении контента

Если контент загружается динамически, вызывайте обновление после загрузки:

```javascript
// После динамической загрузки контента
HubCommon.updateHub2Position();
HubCommon.updateHub4Position();
HubCommon.updateContentPadding('.hub3 > .container');
HubCommon.updateFloatingElementsPosition();
HubCommon.updateBodyPaddingBottom();
```

---

## 📐 ПРАВИЛА ПОЗИЦИОНИРОВАНИЯ

### HUB1 и HUB2 (автоматически через hub1.js и hub2.js)
- HUB1: `position: fixed, top: 0`
- HUB2: `position: fixed, top: [высота HUB1]` (устанавливается через `HubCommon.updateHub2Position()`)

### HUB3 (основной контент)
- `position: relative` (в потоке документа)
- `padding-top` устанавливается автоматически через `HubCommon.updateContentPadding()` 
- Селектор по умолчанию: `.hub3 > .container`

### HUB4 и HUB5 (фиксированные снизу)
- HUB5: `position: fixed, bottom: 0`
- HUB4: `position: fixed, bottom: [высота HUB5]` (устанавливается через `HubCommon.updateHub4Position()`)
- `body.paddingBottom` устанавливается автоматически через `HubCommon.updateBodyPaddingBottom()`

### Парящие элементы
- `body::before`: `top` устанавливается через `HubCommon.updateFloatingElementsPosition()`
- `body::after`: `bottom` устанавливается через `HubCommon.updateFloatingElementsPosition()` (на уровне начала HUB4)

---

## 🎯 ПРАВИЛА АДАПТИВНОСТИ

### Breakpoints (используются везде одинаково)

```css
/* Desktop */
@media (min-width: 1024px) { }

/* Tablet */
@media (max-width: 1023px) and (min-width: 769px) { }

/* Mobile */
@media (max-width: 768px) { }

/* Small Mobile */
@media (max-width: 480px) { }

/* Very Small */
@media (max-width: 360px) { }
```

### Адаптивные размеры

Используйте `clamp()` для плавного масштабирования:
```css
font-size: clamp(16px, 4vw, 24px);
padding: clamp(12px, 3vw, 20px);
```

---

## ✅ ЧЕКЛИСТ ПРИ СОЗДАНИИ НОВОЙ СТРАНИЦЫ

- [ ] Подключены все обязательные CSS: `brand-style.css`, `hub1.css`, `hub2.css`
- [ ] Подключены все обязательные JS: `hub-common.js`, `hub1.js`, `hub2.js`
- [ ] Body имеет класс `with-hub`
- [ ] HUB3 обернут в `<div class="hub-zone hub3">` с внутренним `.container`
- [ ] HUB4 и HUB5 добавлены с `id="hub4"` и `id="hub5"`
- [ ] Все CSS стили для HUB-зон скопированы из шаблона
- [ ] Z-index соответствует иерархии (HUB1: 1001, HUB2: 1000, HUB4/HUB5: 999, контент: 2, парящие: -1)
- [ ] Парящие элементы имеют правильные z-index (-1)
- [ ] Инициализация HUB1/HUB2 добавлена в JavaScript
- [ ] Обработчик resize добавлен
- [ ] Все функции `HubCommon.*` вызываются в правильном порядке
- [ ] Адаптивные стили для HUB4/HUB5 добавлены
- [ ] Протестировано на разных размерах экрана

---

## 🔄 ОПЦИОНАЛЬНЫЕ HUB-ЗОНЫ

### Если HUB2 не нужен (например, на `solo.html`):
```javascript
// Просто не вызывайте Hub2.init()
Hub1.init({ /* опции */ });
// Hub2.init(); // НЕ вызывать
```

### Если HUB4/HUB5 нужно скрыть:
```css
.hub4, .hub5 {
    display: none;
}
```
Или через JavaScript:
```javascript
document.getElementById('hub4').style.display = 'none';
document.getElementById('hub5').style.display = 'none';
```

---

## 📝 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

### Пример 1: Простая страница с выбором (как `index.html`)

```html
<body class="with-hub">
    <div class="hub-zone hub3">
        <div class="container">
            <div id="quizzes-grid" class="quizzes-grid">
                <!-- Карточки квизов -->
            </div>
        </div>
    </div>
    
    <div id="hub4" class="hub-zone hub4"></div>
    <div id="hub5" class="hub-zone hub5"></div>
</body>
```

### Пример 2: Страница без HUB2 (как `solo.html`)

```html
<body class="with-hub">
    <div class="hub-zone hub3">
        <div class="container">
            <!-- Контент -->
        </div>
    </div>
    
    <div id="hub4" class="hub-zone hub4"></div>
    <div id="hub5" class="hub-zone hub5"></div>
</body>
```

```javascript
// В JavaScript не вызывайте Hub2.init()
Hub1.init({ /* опции */ });
```

---

## 🚫 ЧАСТЫЕ ОШИБКИ (ИЗБЕГАЙТЕ!)

1. ❌ **Неправильный z-index** — парящие элементы перекрывают HUB-зоны
2. ❌ **Отсутствие id у HUB4/HUB5** — JavaScript не может их найти
3. ❌ **Неправильный селектор в updateContentPadding()** — должен быть `.hub3 > .container`
4. ❌ **Забыли вызвать updateHub4Position()** — HUB4 не позиционируется правильно
5. ❌ **Статичный top для body::before** — должен быть динамическим
6. ❌ **Отсутствие адаптивных стилей** — HUB4/HUB5 не адаптируются на мобильных

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ РЕСУРСЫ

- **Эталонная страница:** `public/host.html`
- **Общие функции:** `public/scripts/hub-common.js`
- **HUB1 стили:** `public/styles/hub1.css`
- **HUB2 стили:** `public/styles/hub2.css`
- **Брендовые стили:** `public/styles/brand-style.css`

---

**Последнее обновление:** 2024 (на основе `host.html`)
**Версия:** 1.0

