# Правила форматирования карточек квизов

Этот документ описывает универсальную структуру, стили, шрифты и отступы для карточек квизов, которые используются на всех страницах проекта.

## Быстрый старт

1. Подключите стили: `<link rel="stylesheet" href="/styles/quiz-card.css">`
2. Используйте базовую структуру с `.quiz-card` и `.quiz-card-content`
3. Задавайте цвет через inline стиль: `style="background: #abf67c;"`
4. Для карточек с фразой добавьте класс `.has-phrase`
5. Для карточек режимов используйте класс `.mode-card` с `.solo` или `.multiplayer`

## Основные типы карточек

- **Обычная карточка**: с иконкой, заголовком, описанием и блоком информации
- **Карточка с фразой**: с классом `.has-phrase`, содержит `.quiz-phrase` в стиле Caveat
- **Карточка режима**: с классом `.mode-card`, использует `.quiz-info-highlight` вместо `.quiz-info`

## Подключение стилей

В `<head>` вашего HTML файла добавьте:

```html
<link rel="stylesheet" href="/styles/quiz-card.css">
```

## Структура карточки

### Базовая структура

```html
<div class="quiz-card" style="background: #abf67c;">
    <div class="quiz-card-content">
        <!-- Контент карточки -->
    </div>
    <!-- Опционально: блок информации -->
</div>
```

## Элементы карточки и их стили

### 1. Контейнер карточки (`.quiz-card`)

**Стили:**
- `background`: задается через inline стиль `style="background: #цвет;"`
- `border-radius`: `clamp(12px, 2.5vw, 25px)` - адаптивный скругление углов
- `padding`: `clamp(18px, 4vw, 28px) clamp(16px, 3.5vw, 24px)` - адаптивные отступы внутри карточки
- `box-shadow`: `0 6px 0px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)` - тень карточки
- `min-height`: `auto` - карточка подстраивается под содержимое
- `text-decoration`: `none` - нет подчеркивания

### 2. Контейнер контента (`.quiz-card-content`)

**Стили:**
- `display`: `flex`
- `flex-direction`: `column`
- `align-items`: `center`
- `justify-content`: `center`
- `padding-top`: `clamp(12px, 3vw, 20px)` - отступ сверху для контента
- `width`: `100%`

**Назначение:** Обертка для всего контента карточки (иконка, заголовок, описание, фраза)

### 3. Иконка (`.quiz-icon`) - опционально

**Стили:**
- `font-size`: `clamp(36px, 8vw, 56px)` - размер эмодзи-иконки
- `width`: `clamp(36px, 8vw, 56px)`
- `height`: `clamp(56px, 10vw, 72px)`
- `margin-bottom`: `clamp(10px, 2.5vw, 16px)` - отступ снизу
- `display`: `flex` - для центрирования SVG
- `align-items`: `center`
- `justify-content`: `center`
- Анимация: покачивание (iconFloat)

**Использование:**
```html
<!-- Эмодзи иконка -->
<span class="quiz-icon">🎯</span>

<!-- SVG иконка -->
<div class="quiz-icon">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <!-- SVG содержимое -->
    </svg>
</div>

<!-- SVG иконка в стиле "от руки маркером" (hand-drawn-icon) -->
<svg class="hand-drawn-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <!-- SVG с stroke-width и stroke-linecap="round" для эффекта маркера -->
</svg>
```

**SVG иконки в стиле "от руки маркером":**
- Класс: `.hand-drawn-icon`
- Размер: `width: 32px; height: 32px;` (или адаптивный через CSS)
- Стиль: `stroke-width: 3.5-4`, `stroke-linecap: round`, `stroke-linejoin: round`
- Цвет: `stroke="#000"` (черный)
- Использование: Для иконок в блоке `.quiz-info` (вопросы, часы) и других декоративных элементов

**Пример SVG иконки вопроса:**
```html
<svg class="hand-drawn-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <text x="20" y="32" 
          font-family="Kalam, cursive" 
          font-size="36" 
          font-weight="700"
          fill="#000" 
          text-anchor="middle">?</text>
</svg>
```

**Пример SVG иконки часов:**
```html
<svg class="hand-drawn-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 6 Q 11 6, 7 10 Q 5.5 11.5, 5.5 16 Q 5.5 20.5, 9 24 Q 10.5 25.5, 16 25.5 Q 21.5 25.5, 25 22 Q 26.5 20.5, 26.5 16 Q 26.5 11.5, 23 8 Q 21.5 6.5, 16 6" 
          stroke="#000" stroke-width="4" fill="none" 
          stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="16" x2="16" y2="10" 
          stroke="#000" stroke-width="3.5" 
          stroke-linecap="round"/>
    <line x1="16" y1="16" x2="21" y2="21" 
          stroke="#000" stroke-width="3.5" 
          stroke-linecap="round"/>
</svg>
```

### 4. Заголовок (`.quiz-title`) - обязательно

**Шрифт:** `Days One`, sans-serif
**Размер:** `clamp(20px, 4vw, 30px)` - адаптивный
**Вес:** `700` (жирный)
**Цвет:** `#373639`
**Отступы:**
- `margin-bottom`: `clamp(6px, 1.5vw, 12px)`
- `padding`: `0 clamp(8px, 2vw, 14px)` - горизонтальные отступы
**Выравнивание:** по центру
**Перенос:** автоматический (`word-wrap: break-word`)

**Использование:**
```html
<div class="quiz-title">Название квиза</div>
```

### 5. Подзаголовок (`.quiz-subtitle`) - опционально

**Шрифт:** `Days One`, sans-serif
**Размер:** `clamp(18px, 3.5vw, 22px)` - адаптивный
**Вес:** `400` (обычный)
**Цвет:** `#373639`
**Отступы:**
- `margin-top`: `8px`
- `margin-bottom`: `clamp(6px, 1.5vw, 12px)`
**Выравнивание:** по центру
**Перенос:** автоматический

**Использование:**
```html
<div class="quiz-subtitle">Подзаголовок</div>
```

### 6. Описание (`.quiz-description`) - опционально

**Шрифт:** `Days One`, sans-serif
**Размер:** `clamp(18px, 3.5vw, 22px)` - адаптивный
**Вес:** `400` (обычный)
**Цвет:** `#373639`
**Непрозрачность:** `0.85`
**Отступы:**
- `margin-bottom`: `10px`
**Выравнивание:** по центру
**Перенос:** автоматический, может занимать несколько строк
**Line-height:** `1.4`

**Использование:**
```html
<div class="quiz-description">Описание квиза</div>
```

### 7. Фраза в стиле Caveat (`.quiz-phrase`) - опционально

**Шрифт:** `Caveat`, cursive
**Размер:** `clamp(20px, 3.5vw, 28px)` - адаптивный
**Вес:** `400` (обычный)
**Цвет:** `#354fba` (синий)
**Отступы:**
- `margin`: `clamp(20px, 4vw, 35px) 0 clamp(8px, 2vw, 10px) 0`
**Трансформация:** `rotate(-2deg)` - небольшой поворот
**Выравнивание:** по центру

**Использование:**
```html
<div class="quiz-phrase">девушки тоже братишки</div>
```

### 8. Выделенная информация (`.quiz-info-highlight`) - опционально

**Шрифт:** `Caveat`, cursive
**Размер:** `clamp(20px, 3.5vw, 28px)` - адаптивный
**Вес:** `400` (обычный)
**Цвет:** `#354fba` (синий)
**Отступы:**
- `margin-top`: `clamp(12px, 2.5vw, 16px)`
- `margin-bottom`: `clamp(8px, 2vw, 12px)` - отступ снизу для карточек без `.quiz-info`
**Выравнивание:** по центру
**Назначение:** Для выделения важной информации (количество вопросов, QR-код и т.д.)
**Расположение:** Внутри `.quiz-card-content`, после `.quiz-description`

**Использование:**
```html
<div class="quiz-info-highlight">15 вопросов из 150</div>
<!-- или -->
<div class="quiz-info-highlight">QR-код для подключения</div>
```

### 9. Блок информации (`.quiz-info`) - опционально

**Шрифт:** `Days One`, sans-serif (или `Caveat` для карточек с фразой)
**Размер:** `clamp(16px, 3vw, 20px)` - адаптивный
**Вес:** `600` (полужирный)
**Отступы:**
- `padding-top`: `clamp(6px, 1.5vw, 12px)`
- `margin-top`: `auto` - прижимается к низу
**Граница:** `border-top: 3px solid #000` (кроме карточек с фразой)
**Расположение:** внизу карточки, flex с `justify-content: space-around`
**Назначение:** Отображает метаинформацию о квизе (количество вопросов, время)

**Использование:**
```html
<div class="quiz-info">
    <div class="quiz-info-item">
        <span class="quiz-info-icon">❓</span>
        <span>15 вопросов</span>
    </div>
    <div class="quiz-info-item">
        <span class="quiz-info-icon">⏱</span>
        <span>~30 сек</span>
    </div>
</div>
```

**С SVG иконками:**
```html
<div class="quiz-info">
    <div class="quiz-info-item">
        <svg class="hand-drawn-icon" viewBox="0 0 40 40">
            <!-- SVG иконка вопроса -->
        </svg>
        <span>15 из 150</span>
    </div>
    <div class="quiz-info-item">
        <svg class="hand-drawn-icon" viewBox="0 0 32 32">
            <!-- SVG иконка часов -->
        </svg>
        <span>по 15 сек</span>
    </div>
</div>
```

**Примечание:** Карточки могут не иметь блока `.quiz-info`, если используется `.quiz-info-highlight` для отображения информации.

## Примеры карточек

### Пример 1: Простая карточка с иконкой и описанием

```html
<div class="quiz-card" style="background: #abf67c;">
    <div class="quiz-card-content">
        <span class="quiz-icon">🎯</span>
        <div class="quiz-title">Название квиза</div>
        <div class="quiz-description">Описание квиза</div>
    </div>
    <div class="quiz-info">
        <div class="quiz-info-item">
            <span class="quiz-info-icon">❓</span>
            <span>15 вопросов</span>
        </div>
        <div class="quiz-info-item">
            <span class="quiz-info-icon">⏱</span>
            <span>~30 сек</span>
        </div>
    </div>
</div>
```

### Пример 2: Карточка с фразой в стиле Caveat

```html
<div class="quiz-card has-phrase" style="background: #abf67c;">
    <div class="quiz-card-content">
        <div class="quiz-title">ЧЕМПИОНАТ ГНУ</div>
        <div class="quiz-subtitle">цели братишек</div>
        <div class="quiz-phrase">девушки тоже братишки</div>
    </div>
    <div class="quiz-info">
        <div class="quiz-info-item">
            <span class="quiz-info-icon">❓</span>
            <span>15 из 150</span>
        </div>
        <div class="quiz-info-item">
            <span class="quiz-info-icon">⏱</span>
            <span>по 15 сек</span>
        </div>
    </div>
</div>
```

### Пример 3: Карточка с выделенной информацией (для режимов)

```html
<div class="quiz-card mode-card solo" style="background: #ABF67C;">
    <div class="quiz-card-content">
        <div class="quiz-icon">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <!-- SVG иконка -->
            </svg>
        </div>
        <div class="quiz-title">Одиночная игра</div>
        <div class="quiz-description">
            Играй один и соревнуйся с другими в рейтинге
        </div>
        <div class="quiz-info-highlight">
            15 вопросов из 150
        </div>
    </div>
</div>
```

**Примечание:** Класс `.mode-card` используется для карточек режимов игры. Дополнительные классы `.solo` и `.multiplayer` задают цвет карточки.

### Пример 4: Карточка без блока информации (для настроек)

```html
<a href="/settings.html" class="quiz-card" style="background: #abf67c;">
    <div class="quiz-card-content">
        <span class="quiz-icon">🎮</span>
        <div class="quiz-title">Джойстик</div>
        <div class="quiz-description">Настройка джойстика и геймпада</div>
    </div>
</a>
```

## Отступы от краев экрана

Контейнер с карточками должен иметь отступы:

```css
.quizzes-grid,
.mode-cards,
.settings-grid {
    padding: 0 clamp(16px, 4vw, 24px); /* Отступы от краев экрана */
    max-width: 800px; /* Максимальная ширина сетки карточек */
    margin: 0 auto; /* Центрирование */
    width: 100%;
}
```

**Отступы:**
- Минимум: `16px` с каждой стороны
- Максимум: `24px` с каждой стороны
- Адаптивно: `4vw` (4% от ширины экрана)

## Шрифты

### Основные шрифты

1. **Days One** - используется для:
   - `.quiz-title` (заголовок)
   - `.quiz-subtitle` (подзаголовок)
   - `.quiz-description` (описание)
   - `.quiz-info` (информация внизу)

2. **Caveat** - используется для:
   - `.quiz-phrase` (фраза с поворотом)
   - `.quiz-info-highlight` (выделенная информация)
   - `.quiz-info` (только для карточек с классом `.has-phrase`)

### Размеры шрифтов (адаптивные)

- **Заголовок**: `clamp(20px, 4vw, 30px)`
- **Подзаголовок**: `clamp(18px, 3.5vw, 22px)`
- **Описание**: `clamp(18px, 3.5vw, 22px)`
- **Фраза**: `clamp(20px, 3.5vw, 28px)`
- **Выделенная информация**: `clamp(20px, 3.5vw, 28px)`
- **Информация внизу**: `clamp(16px, 3vw, 20px)`

### На узких экранах (≤480px)

Размеры увеличиваются для лучшей читаемости:
- **Заголовок**: `clamp(22px, 5vw, 28px)`
- **Подзаголовок**: `clamp(20px, 4.5vw, 24px)`
- **Описание**: `clamp(20px, 4.5vw, 24px)`
- **Информация**: `clamp(18px, 4vw, 22px)`

## Цвета

### Цвет текста

- **Основной текст**: `#373639` (темно-серый) - для `.quiz-title`, `.quiz-subtitle`, `.quiz-description`
- **Фраза и выделенная информация**: `#354fba` (синий) - для `.quiz-phrase` и `.quiz-info-highlight`
- **Информация внизу**: `#000` (черный) - для `.quiz-info-item` (кроме карточек с `.has-phrase`)
- **Информация внизу (с фразой)**: `#393639` (темно-серый) - для `.quiz-info-item` в карточках с `.has-phrase`

### Цвета карточек (задаются через inline стиль)

**Стандартные цвета:**
- Зеленый: `#abf67c` или `#ABF67C` - для первой карточки и режима solo
- Розовый: `#f68a7c` или `#F68A7C` - для второй карточки и режима multiplayer
- Оранжевый: `#fb906b`
- Другие цвета по необходимости

**Специальные тени для цветных карточек:**
- Зеленая карточка: `box-shadow: 0 6px 0px rgba(47, 185, 93, 0.3), 0 8px 16px rgba(47, 185, 93, 0.1)`
- Розовая карточка: `box-shadow: 0 6px 0px rgba(250, 87, 52, 0.3), 0 8px 16px rgba(250, 87, 52, 0.1)`

**При наведении:**
- Зеленая: `background: rgba(171, 246, 124, 0.9)`
- Розовая: `background: rgba(246, 138, 124, 0.9)`

## Расположение элементов

### Порядок элементов в `.quiz-card-content`:

1. Иконка (`.quiz-icon`) - опционально
2. Заголовок (`.quiz-title`) - обязательно
3. Подзаголовок (`.quiz-subtitle`) - опционально
4. Описание (`.quiz-description`) - опционально
5. Фраза (`.quiz-phrase`) - опционально (только для карточек с `.has-phrase`)
6. Выделенная информация (`.quiz-info-highlight`) - опционально (обычно для карточек режимов)

**Важно:** `.quiz-phrase` и `.quiz-info-highlight` не используются одновременно в одной карточке.

### Блок информации (`.quiz-info`)

Располагается вне `.quiz-card-content`, внизу карточки:
- Прижимается к низу через `margin-top: auto`
- Имеет границу сверху (кроме карточек с `.has-phrase`)
- Содержит элементы информации (вопросы, время)

## Специальные классы

### `.has-phrase`

Добавляется к `.quiz-card`, если есть фраза в стиле Caveat (`.quiz-phrase`). Меняет стиль `.quiz-info`:
- Шрифт: `Caveat` вместо `Days One`
- Размер: `clamp(24px, 4vw, 30px)`
- Убирает границу сверху (`border-top: none`)
- Убирает отступ сверху (`padding-top: 0`)

**Использование:**
```html
<div class="quiz-card has-phrase" style="background: #abf67c;">
    <div class="quiz-card-content">
        <div class="quiz-title">ЧЕМПИОНАТ ГНУ</div>
        <div class="quiz-subtitle">цели братишек</div>
        <div class="quiz-phrase">девушки тоже братишки</div>
    </div>
    <div class="quiz-info">
        <!-- Информация в стиле Caveat -->
    </div>
</div>
```

### `.mode-card`

Используется для карточек режимов игры (на странице выбора режима). Может иметь дополнительные классы:
- `.solo` - одиночная игра (зеленый фон `#ABF67C`)
- `.multiplayer` - мультиплеер (розовый фон `#F68A7C`)

**Стили:**
- Цвет текста: `#373639` для всех элементов
- Обычно используется без блока `.quiz-info`, вместо него `.quiz-info-highlight`

**Использование:**
```html
<div class="quiz-card mode-card solo" onclick="selectMode('solo')">
    <div class="quiz-card-content">
        <div class="quiz-icon">
            <svg>...</svg>
        </div>
        <div class="quiz-title">Одиночная игра</div>
        <div class="quiz-description">Описание режима</div>
        <div class="quiz-info-highlight">15 вопросов из 150</div>
    </div>
</div>
```

## Специальные стили для главной страницы

### Первая карточка (`.quiz-card:nth-child(1)`)

На главной странице первая карточка имеет специальные стили:

**Цвет и тени:**
- Фон: `#abf67c` (зеленый)
- Тень: `0 6px 0px rgba(47, 185, 93, 0.3), 0 8px 16px rgba(47, 185, 93, 0.1)`

**Особенности:**
- Иконка `.quiz-icon` скрыта (`display: none`)
- Обычно содержит фразу в стиле Caveat (`.quiz-phrase`)
- Имеет класс `.has-phrase`
- Использует SVG иконки в блоке `.quiz-info` (вопрос и часы)

**Пример:**
```html
<div class="quiz-card has-phrase" style="background: #abf67c;">
    <div class="quiz-card-content">
        <div class="quiz-title">ЧЕМПИОНАТ ГНУ</div>
        <div class="quiz-subtitle">цели братишек</div>
        <div class="quiz-phrase">девушки тоже братишки</div>
    </div>
    <div class="quiz-info">
        <div class="quiz-info-item">
            <svg class="hand-drawn-icon">...</svg>
            <span>15 из 150</span>
        </div>
        <div class="quiz-info-item">
            <svg class="hand-drawn-icon">...</svg>
            <span>по 15 сек</span>
        </div>
    </div>
</div>
```

### Вторая карточка (`.quiz-card:nth-child(2)`)

На главной странице вторая карточка имеет розовый стиль:

**Цвет и тени:**
- Фон: `#f68a7c` (розовый)
- Тень: `0 6px 0px rgba(250, 87, 52, 0.3), 0 8px 16px rgba(250, 87, 52, 0.1)`

**Особенности:**
- Иконка `.quiz-icon` скрыта (`display: none`)
- Цвет текста: `#373639` для всех элементов

## Адаптивность

### Планшеты (769px - 1023px)
- Карточки: `padding: 20px 15px`
- Без фиксированного соотношения сторон

### Мобильные (≤768px)
- Карточки: `padding: clamp(16px, 4vw, 24px) clamp(14px, 3.5vw, 20px)`

### Узкие экраны (≤480px)
- Увеличенные размеры шрифтов
- Карточки подстраиваются под содержимое
- Отступы адаптируются

## Важные особенности

1. **Нет подчеркивания**: Все элементы имеют `text-decoration: none`
2. **Текст полностью влезает**: Убраны ограничения `white-space: nowrap` и `text-overflow: ellipsis`
3. **Автоматический перенос**: Длинные слова переносятся на новую строку (`word-wrap: break-word`, `overflow-wrap: break-word`)
4. **Адаптивные отступы**: Все отступы используют `clamp()` для плавного масштабирования
5. **Центрирование**: Все тексты выровнены по центру (`text-align: center`)
6. **Карточка подстраивается**: Нет фиксированной высоты, карточка растягивается под содержимое (`min-height: auto`)
7. **SVG иконки**: Поддерживаются как эмодзи, так и SVG иконки (включая стиль "от руки маркером" с классом `.hand-drawn-icon`)
8. **Цвет фона**: Задается через inline стиль `style="background: #цвет;"` для каждой карточки
9. **Специальные стили**: Первая и вторая карточки на главной странице имеют фиксированные цвета (зеленый и розовый)
10. **Карточки режимов**: Используют класс `.mode-card` и могут не иметь блока `.quiz-info`

## Создание карточки через JavaScript

### Простая карточка с иконкой и описанием

```javascript
const card = document.createElement('div');
card.className = 'quiz-card';
card.style.background = '#abf67c'; // Цвет карточки

const cardHTML = `
    <div class="quiz-card-content">
        <span class="quiz-icon">🎯</span>
        <div class="quiz-title">${quiz.name}</div>
        <div class="quiz-description">${quiz.description}</div>
        ${quiz.hasHighlight ? `<div class="quiz-info-highlight">${quiz.highlight}</div>` : ''}
    </div>
    ${quiz.hasInfo ? `
    <div class="quiz-info">
        <div class="quiz-info-item">
            <span class="quiz-info-icon">❓</span>
            <span>${questionCount} вопросов</span>
        </div>
        <div class="quiz-info-item">
            <span class="quiz-info-icon">⏱</span>
            <span>~${avgTime} сек</span>
        </div>
    </div>
    ` : ''}
`;

card.innerHTML = cardHTML;
```

### Карточка с фразой в стиле Caveat

```javascript
const card = document.createElement('div');
card.className = 'quiz-card has-phrase';
card.style.background = '#abf67c';

const questionIcon = `<svg class="hand-drawn-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <text x="20" y="32" 
          font-family="Kalam, cursive" 
          font-size="36" 
          font-weight="700"
          fill="#000" 
          text-anchor="middle">?</text>
</svg>`;

const clockIcon = `<svg class="hand-drawn-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 6 Q 11 6, 7 10 Q 5.5 11.5, 5.5 16 Q 5.5 20.5, 9 24 Q 10.5 25.5, 16 25.5 Q 21.5 25.5, 25 22 Q 26.5 20.5, 26.5 16 Q 26.5 11.5, 23 8 Q 21.5 6.5, 16 6" 
          stroke="#000" stroke-width="4" fill="none" 
          stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="16" x2="16" y2="10" 
          stroke="#000" stroke-width="3.5" 
          stroke-linecap="round"/>
    <line x1="16" y1="16" x2="21" y2="21" 
          stroke="#000" stroke-width="3.5" 
          stroke-linecap="round"/>
</svg>`;

const cardHTML = `
    <div class="quiz-card-content">
        <div class="quiz-title">ЧЕМПИОНАТ ГНУ</div>
        <div class="quiz-subtitle">цели братишек</div>
        <div class="quiz-phrase">девушки тоже братишки</div>
    </div>
    <div class="quiz-info">
        <div class="quiz-info-item">
            ${questionIcon}
            <span>15 из ${questionCount}</span>
        </div>
        <div class="quiz-info-item">
            ${clockIcon}
            <span>по ${timeSeconds} сек</span>
        </div>
    </div>
`;

card.innerHTML = cardHTML;
```

### Карточка режима игры

```javascript
const card = document.createElement('div');
card.className = 'quiz-card mode-card solo'; // или 'multiplayer'
card.style.background = '#ABF67C'; // или '#F68A7C' для multiplayer

const iconSVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <!-- SVG иконка -->
</svg>`;

const cardHTML = `
    <div class="quiz-card-content">
        <div class="quiz-icon">${iconSVG}</div>
        <div class="quiz-title">Одиночная игра</div>
        <div class="quiz-description">
            Играй один и соревнуйся с другими в рейтинге
        </div>
        <div class="quiz-info-highlight">
            15 вопросов из 150
        </div>
    </div>
`;

card.innerHTML = cardHTML;
card.onclick = () => selectMode('solo');
```

## Контейнер для сетки карточек

### Базовые стили сетки

```css
.quizzes-grid,
.mode-cards,
.settings-grid {
    display: grid;
    grid-template-columns: 1fr; /* 1 колонка на мобильных */
    gap: clamp(20px, 4vw, 28px); /* Отступ между карточками */
    margin: 0 auto;
    margin-top: clamp(20px, 6vw, 40px); /* Отступ сверху */
    max-width: 800px; /* Максимальная ширина сетки (для mode-cards) */
    width: 100%;
    padding: 0 clamp(16px, 4vw, 24px); /* Отступы от краев экрана */
    align-items: center; /* Выравнивание по центру вертикально */
    align-content: center; /* Выравнивание содержимого по центру вертикально */
    justify-items: center; /* Выравнивание по центру горизонтально */
}
```

### Адаптивность сетки

**Планшеты и десктопы (≥768px):**
```css
@media (min-width: 768px) {
    .quizzes-grid,
    .mode-cards,
    .settings-grid {
        grid-template-columns: repeat(2, 1fr); /* 2 колонки */
        gap: clamp(24px, 4vw, 32px);
    }
}
```

**Мобильные устройства (≤767px):**
- 1 колонка
- `max-width: 600px` для `.quizzes-grid` (на главной странице)
- `max-width: 800px` для `.mode-cards` (на странице режимов)

**Узкие экраны (≤480px):**
- Отступы уменьшаются: `padding: 0 clamp(16px, 4vw, 24px)`
- Gap остается: `clamp(20px, 4vw, 28px)`

### Особенности для главной страницы

На главной странице (`.quizzes-grid`):
- Первая карточка не имеет отступов сверху
- Анимация для первой карточки отключена
- Максимальная ширина: `1200px` (контейнер), `600px` (сетка на мобильных)

## Примечания

1. **Цвет текста**: По умолчанию `#373639`. Для темных фонов может потребоваться изменить цвет текста
2. **Тень карточки**: Автоматически адаптируется при наведении. Для цветных карточек используются специальные тени с цветом карточки
3. **Анимация иконки**: Иконка `.quiz-icon` автоматически анимируется (покачивание `iconFloat`)
4. **SVG иконки**: Можно использовать SVG внутри `.quiz-icon` или как отдельные элементы с классом `.hand-drawn-icon`
5. **Ссылки**: Карточки могут быть ссылками (`<a>`), подчеркивание автоматически убирается
6. **Первая карточка**: На главной странице первая карточка имеет специальные стили (зеленый фон, без иконки, с фразой)
7. **Вторая карточка**: На главной странице вторая карточка имеет розовый фон
8. **Карточки режимов**: Используются на странице выбора режима (`gnu-quiz.html`), имеют класс `.mode-card` и обычно не содержат блок `.quiz-info`
9. **Структура**: Всегда используйте `.quiz-card-content` для обертки контента карточки
10. **Адаптивность**: Все размеры шрифтов и отступы адаптивные через `clamp()`, что обеспечивает корректное отображение на всех устройствах
