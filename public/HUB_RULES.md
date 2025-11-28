# Правила создания и использования Hub1 и Hub2

## 📋 Общие правила

### 1. Обязательные подключения

**В `<head>` каждой страницы:**
```html
<link rel="stylesheet" href="/styles/hub1.css">
<link rel="stylesheet" href="/styles/hub2.css">
```

**Перед закрывающим `</body>`:**
```html
<script src="/scripts/hub-common.js"></script>
<script src="/scripts/hub1.js"></script>
<script src="/scripts/hub2.js"></script>
```

### 2. Иерархия z-index

**КРИТИЧЕСКИ ВАЖНО:** Никогда не меняйте эти значения!

- **Hub1**: `z-index: 1001` (самый верхний)
- **Hub2**: `z-index: 1000` (выше контента)
- **Контент страницы** (container, lobby-screen и т.д.): `z-index: 1` (ниже Hub2)
- **Парящий элемент** (body::before): `z-index: -1` (самый нижний)

### 3. Позиционирование

- **Hub1**: `position: fixed`, `top: 0`
- **Hub2**: `position: fixed`, `top: [высота Hub1]` (обновляется динамически через `HubCommon.updateHub2Position()`)
- **Контент**: `padding-top: [высота Hub1 + высота Hub2]` (без дополнительных отступов!)
- **Парящий элемент**: `top: [высота Hub1 + высота Hub2]` (всегда ниже Hub2!)

### 4. Прозрачность

- **Hub2 ВСЕГДА непрозрачен**: `background: rgba(242, 242, 242, 0.98)`, `opacity: 1 !important`
- Никакие элементы не должны перекрывать Hub2
- Контент всегда начинается СРАЗУ после Hub2, без промежутка

---

## 🎯 Hub1 - Меню с кнопками

### Назначение
Меню для кнопок навигации, действий и статусов. Используется на ВСЕХ страницах.

### Структура
```
hub1
  └── hub1-content
      └── hub1-actions
          ├── hub1-actions-left (кнопки слева)
          └── hub1-actions-right (кнопки справа)
```

### Правила адаптивности

1. **Desktop (≥1024px)**:
   - `justify-content: space-between` - кнопки по краям
   - Кнопки: `font-size: 14px`, `padding: 8px 16px`

2. **Tablet (769px - 1023px)**:
   - `justify-content: space-between` - правая кнопка остается справа, постепенно приближается
   - `flex-wrap: nowrap` - без переноса
   - Кнопки: `font-size: 14px`, `padding: 8px 16px`

3. **Mobile (≤768px)**:
   - `justify-content: space-between` - правая кнопка остается справа, очень близко к левой
   - `flex-wrap: nowrap` - без переноса
   - Кнопки: `font-size: 12px`, `padding: 6px 12px` (уменьшаются!)

4. **Small Mobile (≤480px)**:
   - `justify-content: space-between` - правая кнопка все еще справа
   - `flex-wrap: nowrap` - без переноса
   - Кнопки: `font-size: 12px`, `padding: 6px 12px`

5. **Очень маленькие экраны (≤360px)**:
   - `justify-content: flex-start` - все кнопки слева
   - `flex-wrap: wrap` - перенос на новую строку
   - Кнопки: `font-size: 12px`, `padding: 6px 12px`

### Ключевые правила Hub1

✅ **Кнопки НЕ уменьшаются** на Desktop/Tablet (только перестраиваются)
✅ **Кнопки уменьшаются** только на Mobile (≤768px)
✅ **Правая кнопка остается справа** до экранов ≤360px
✅ **Перенос на новую строку** только на экранах ≤360px
✅ **Иконки игроков** добавляются в `hub1-actions-left` через `Hub1.addPlayerIcon()`

### Инициализация

```javascript
Hub1.init({
    showBack: true,           // Показать кнопку "Назад"
    backUrl: '/index.html',   // URL для кнопки "Назад"
    showLogin: false,         // Показать кнопку входа с меню персонажей
    showJoystick: false,      // Показать кнопку настроек джойстика
    customButtons: []         // Массив пользовательских кнопок
});
```

### API методы

- `Hub1.init(config)` - Инициализация
- `Hub1.addButton(text, url, position, className)` - Добавить кнопку
- `Hub1.addPlayerIcon(playerId, name, status)` - Добавить иконку игрока
- `Hub1.removePlayerIcon(playerId)` - Удалить иконку игрока
- `Hub1.updatePlayerStatus(playerId, status)` - Обновить статус игрока
- `Hub1.updateHeight()` - Обновить высоту Hub1

---

## 🎨 Hub2 - Меню с логотипом

### Назначение
Меню для отображения логотипа и фразы. Используется на ВСЕХ страницах.

### Структура
```
hub2
  └── hub2-content
      └── hub2-logo-section
          ├── logo (img)
          └── subtitle (p)
```

### Правила адаптивности

1. **Desktop (≥1024px)**:
   - Логотип: `max-height: 250px`
   - Фраза: `font-size: clamp(33.6px, 6.3vw, 50.4px)`
   - Позиция: по центру

2. **Tablet (769px - 1023px)**:
   - Логотип: `max-height: 120px`
   - Фраза: `font-size: clamp(33.6px, 6.3vw, 50.4px)`
   - Позиция: по центру

3. **Mobile (≤768px)**:
   - Логотип: `max-height: 80px`
   - Фраза: `font-size: clamp(26.88px, 5.04vw, 40.32px)`
   - Позиция: по центру, `position: relative`

4. **Small Mobile (≤480px)**:
   - Логотип: `max-height: 60px`
   - Фраза: `font-size: clamp(26.88px, 5.04vw, 40.32px)`
   - Позиция: по центру

### Ключевые правила Hub2

✅ **ВСЕГДА непрозрачен**: `background: rgba(242, 242, 242, 0.98)`, `opacity: 1 !important`
✅ **ВСЕГДА ниже Hub1**: позиция обновляется через `HubCommon.updateHub2Position()`
✅ **Фраза адаптируется** под ширину логотипа автоматически
✅ **Никогда не перекрывается** контентом или парящими элементами

### Инициализация

```javascript
Hub2.init({
    showLogo: true,      // Показать логотип
    showSubtitle: true  // Показать фразу
});
```

---

## 🔧 HubCommon - Общие функции

### Обязательные вызовы после изменений

После любого изменения Hub1 или Hub2 (добавление кнопок, игроков и т.д.):

```javascript
HubCommon.updateHub2Position();        // Обновить позицию Hub2
HubCommon.updateContentPadding();      // Обновить отступ контента (БЕЗ промежутка!)
HubCommon.updateFloatingElementsPosition(); // Обновить позицию парящего элемента
```

### Функции

- `HubCommon.updateHub2Position()` - Обновить позицию Hub2 относительно Hub1
- `HubCommon.updateContentPadding(selector)` - Обновить отступ контента (контент начинается СРАЗУ после Hub2)
- `HubCommon.updateFloatingElementsPosition()` - Обновить позицию парящего элемента (всегда ниже Hub2)
- `HubCommon.adaptSubtitleToLogo()` - Адаптировать размер фразы под логотип
- `HubCommon.applyCharacterColor()` - Применить цвет выбранного персонажа к кнопкам

---

## 📐 Правила позиционирования контента

### Контент страницы

**ВСЕГДА:**
- `position: relative`
- `z-index: 1` (ниже Hub2)
- `padding-top: [высота Hub1 + высота Hub2]` (БЕЗ дополнительных отступов!)
- Начинается СРАЗУ после Hub2, без промежутка

### Парящий элемент (body::before)

**ВСЕГДА:**
- `position: fixed`
- `z-index: -1` (самый нижний)
- `top: [высота Hub1 + высота Hub2]` (всегда ниже Hub2!)
- Никогда не перекрывает Hub2

---

## ✅ Чеклист для каждой страницы

- [ ] Подключены CSS: `hub1.css`, `hub2.css`
- [ ] Подключены JS: `hub-common.js`, `hub1.js`, `hub2.js`
- [ ] Инициализирован Hub1 с правильными параметрами
- [ ] Инициализирован Hub2
- [ ] Контент имеет `z-index: 1`
- [ ] Контент имеет `padding-top` (устанавливается динамически)
- [ ] Парящий элемент имеет `z-index: -1`
- [ ] Вызваны функции обновления после загрузки и при resize
- [ ] Hub2 имеет непрозрачный фон во всех медиа-запросах
- [ ] Никакие элементы не перекрывают Hub2

---

## 🚫 Запрещено

❌ Менять z-index Hub1 или Hub2
❌ Делать Hub2 прозрачным
❌ Добавлять дополнительные отступы между Hub2 и контентом
❌ Размещать парящий элемент выше Hub2
❌ Использовать старые классы `.hub`, `.hub-login-fixed` вместо Hub1/Hub2
❌ Изменять размер кнопок Hub1 на Desktop/Tablet (только на Mobile ≤768px)

---

## 📱 Адаптивность - Итоговая таблица

| Размер экрана | Hub1 justify-content | Hub1 flex-wrap | Размер кнопок | Hub2 фон |
|--------------|---------------------|----------------|---------------|----------|
| ≥1024px | space-between | nowrap | 14px / 8px 16px | rgba(242,242,242,0.98) |
| 769-1023px | space-between | nowrap | 14px / 8px 16px | rgba(242,242,242,0.98) |
| ≤768px | space-between | nowrap | 12px / 6px 12px | rgba(242,242,242,0.98) |
| ≤480px | space-between | nowrap | 12px / 6px 12px | rgba(242,242,242,0.98) |
| ≤360px | flex-start | wrap | 12px / 6px 12px | rgba(242,242,242,0.98) |

---

## 📄 Пример полной интеграции

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Моя страница</title>
    <link rel="stylesheet" href="/styles/brand-style.css">
    <link rel="stylesheet" href="/styles/hub1.css">
    <link rel="stylesheet" href="/styles/hub2.css">
</head>
<body class="with-hub">
    <div class="container">
        <!-- Ваш контент -->
    </div>
    
    <script src="/scripts/hub-common.js"></script>
    <script src="/scripts/hub1.js"></script>
    <script src="/scripts/hub2.js"></script>
    <script>
        // Инициализация Hub1
        Hub1.init({
            showBack: true,
            backUrl: '/index.html'
        });
        
        // Инициализация Hub2
        Hub2.init();
        
        // Обновление при загрузке
        document.addEventListener('DOMContentLoaded', function() {
            HubCommon.updateHub2Position();
            HubCommon.updateContentPadding();
            HubCommon.updateFloatingElementsPosition();
        });
        
        // Обновление при изменении размера окна
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                HubCommon.updateHub2Position();
                HubCommon.updateContentPadding();
                HubCommon.updateFloatingElementsPosition();
            }, 100);
        });
    </script>
</body>
</html>
```



