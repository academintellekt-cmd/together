# Стили карточек квизов - Текущая конфигурация

## Структура и расположение

### quiz-info-item (информация внизу карточки)
- **flex-direction**: `row` (иконка и текст на одной строке)
- **align-items**: `center`
- **justify-content**: `center`
- **gap**: `6px` (расстояние между иконкой и текстом)
- **font-family**: `'Days One', sans-serif`

### quiz-info (контейнер информации)
- **display**: `flex`
- **justify-content**: `space-around`
- **border-top**: `3px solid #000`
- **padding-top**: `clamp(6px, 1.5vw, 12px)`
- **font-weight**: `600`
- **font-size**: `clamp(16px, 3vw, 20px)`

## Цвета

### Синий текст (quiz-phrase)
- **color**: `#354fba`
- **font-family**: `'Caveat', cursive`
- **font-size**: `clamp(20px, 3.5vw, 28px)`
- **margin**: `clamp(4px, 1vw, 12px) 0 clamp(8px, 2vw, 10px) 0` (поднят выше)
- **transform**: `rotate(-2deg)`

### Цвета карточек по порядку

#### 1. Академгородок (nth-child(1))
- **Фон**: `#f67cab` (розово-фуксия)
- **Текст**: `#f6c77c` (персиковый)
- **Синий текст (phrase)**: `#354fba` (остается синим)
- **Иконки**: персиковый цвет `#f6c77c`

#### 2. Газпром (nth-child(2))
- **Фон**: `#7cabf6` (голубой)
- **Текст**: `#7cf6c7` (светло-зеленый)
- **Иконки**: цвет `#7cf6c7`

#### 3. ЧГК (nth-child(3))
- **Фон**: `#7ce8f6` (светло-голубой)
- **Текст**: `#c77cf6` (фиолетовый)
- **Иконки**: цвет `#c77cf6`

## Размеры иконок

### SVG иконки в quiz-info-item
- **width**: `32px`
- **height**: `32px`
- **min-width**: `32px`
- **min-height**: `32px`
- **max-width**: `32px`
- **max-height**: `32px`
- **display**: `block`
- **flex-shrink**: `0`
- **margin-bottom**: `0`

### SVG элементы внутри (path, line, circle)
- **stroke-width**: `4`
- **opacity**: `1`
- **visibility**: `visible`
- **display**: `block`

## Жирность текста

### Обычные карточки
- **quiz-info-item span**: `font-weight: 600`
- **quiz-info-item span:last-child**: `font-weight: 600`
- **text-transform**: `none !important` (чтобы "по" оставалось с маленькой буквы)

### Карточки с фразой (has-phrase)
- **quiz-card.has-phrase .quiz-info-item span**: `font-weight: 400`
- **quiz-card.has-phrase .quiz-info-item span:last-child**: `font-weight: 400`
- **font-family**: `'Caveat', cursive`
- **font-size**: `clamp(24px, 4vw, 30px)`
- **flex-direction**: `row` (иконка и текст на одной строке)

## Особые правила

### Текст "по" с маленькой буквы
- Скрипт `caveat-capitalize.js` исключает элементы, содержащие "по " или "По "
- CSS: `text-transform: none !important` для всех span в quiz-info-item

### Отображение SVG
- JavaScript код принудительно устанавливает стили после вставки в DOM
- Используется `requestAnimationFrame` и `setTimeout` для гарантии отображения
- SVG элементы имеют атрибуты `width="32" height="32"` и inline стиль `display: block; flex-shrink: 0;`

## Адаптивность

### Мобильные устройства (≤480px)
- **quiz-phrase margin**: `clamp(4px, 1vw, 12px) 0 clamp(6px, 1.5vw, 8px) 0`
- **quiz-phrase font-size**: `clamp(16px, 3.5vw, 22px)`

### Очень маленькие экраны (≤360px)
- **quiz-phrase font-size**: `clamp(14px, 3vw, 20px)`

## Важные замечания

1. **Иконки и текст на одной строке**: `flex-direction: row` в quiz-info-item
2. **Одинаковая жирность**: все span имеют одинаковый font-weight (600 для обычных, 400 для has-phrase)
3. **Синий текст поднят выше**: уменьшен margin-top до `clamp(4px, 1vw, 12px)`
4. **"по" с маленькой буквы**: исключено из капитализации и имеет `text-transform: none`
5. **SVG иконки 32x32px**: фиксированный размер для надежного отображения

