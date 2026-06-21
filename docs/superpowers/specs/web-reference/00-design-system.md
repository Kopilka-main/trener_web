# Дизайн-система (GYM Acid Flow)

Источник: `packages/theme/theme.css`. Тема общая для тренера и клиента.
По умолчанию **светлая**; тёмная через `<html data-theme="dark">`.

## Токены цвета

| Токен                   | Светлая               | Тёмная                | Назначение                  |
| ----------------------- | --------------------- | --------------------- | --------------------------- |
| `--color-canvas`        | #e7e8ec               | #000000               | «обои» вокруг моб-каркаса   |
| `--color-bg`            | #f5f5f4               | #0b0c10               | фон приложения              |
| `--color-card`          | #ffffff               | #15171d               | карточки/панели             |
| `--color-card-elevated` | #eceef1               | #1d2029               | приподнятые блоки/иконки    |
| `--color-chip`          | #e9ebef               | #1f2128               | мелкие плашки/чипы          |
| `--color-line`          | rgba(0,0,0,.10)       | rgba(255,255,255,.10) | границы                     |
| `--color-line-strong`   | rgba(0,0,0,.16)       | rgba(255,255,255,.20) | акцентные границы           |
| `--color-ink`           | #16181d               | #eeeee8               | основной текст              |
| `--color-ink-muted`     | #5b606b               | #9a9da6               | вторичный текст             |
| `--color-ink-mutedxl`   | #949aa4               | #5e626b               | третичный (captions, sub)   |
| `--color-accent`        | **#f72585** (розовый) | **#d4ff3d** (лайм)    | единственный акцент         |
| `--color-accent-on`     | #ffffff               | #0b0c10               | текст/иконки поверх акцента |
| `--color-success`       | #4e7a1e               | #5c7a0e               | успех                       |
| `--color-danger`        | #d83a1e               | #e04a2e               | опасность/удаление          |
| `--color-coral`         | #f05638               | #ff6e4e               | доп. семантика              |
| `--color-amber`         | #d89a1c               | #e8b255               | предупреждение              |

**Правило одного акцента:** на экран — максимум один акцентный fill (acid-fill).
Остальные интерактивные элементы — нейтральные (card/chip).

## Типографика

| Роль           | Семейство                      | Применение                                       |
| -------------- | ------------------------------ | ------------------------------------------------ |
| `font-sans`    | Space Grotesk (Inter fallback) | основной текст, заголовки, кнопки                |
| `font-display` | **Bowlby One**                 | крупные числа/метрики (балансы, счётчики плиток) |
| `font-mono`    | JetBrains Mono                 | подписи-кикеры, метки метрик, моно-значения      |

Характерные размеры: hero-число 64px (display), метрика плитки 36px (display),
кикер 10px mono uppercase tracking .08–.16em, заголовок плитки 17px bold,
sub 11px.

## Паттерны компонентов

### Плитка дашборда (Tile)

Карточка `rounded-2xl`, тень `tile-shadow` (или `tile-shadow-primary` для
акцентной). Структура: иконка 40×40 в «shell» (скруг. квадрат) сверху-слева,
стрелка `↗` сверху-справа, снизу — метрика (display-число + mono-метка),
заголовок (17px bold), sub (11px). Одна плитка на экране может быть `isPrimary`
(акцентный fill) — выбирается по приоритету (напр. непрочитанные в чате).
Метрики могут ротироваться (несколько значений, смена раз в 10с).

### Карточка (Card)

`--color-card`, `rounded-2xl`/`rounded-xl`, иногда `border --color-line`.
Контент с отступами 12–16px.

### Чип / плашка

`--color-chip` неактивный, `--color-accent` активный (текст `accent-on`).
`rounded-full`, mono 11–12px. Применение: фильтры групп, выбор категорий, теги.

### Кнопки (`components/Button.tsx`)

Варианты: primary (accent fill), secondary (card/border), ghost. Скругление,
активное состояние `active:scale`. Большие действия — full-width h-12.

### Поле ввода (`components/Field.tsx`)

Лейбл сверху, инпут на `--color-card`/`bg`, граница `--color-line`, фокус —
`--color-accent`.

### Степпер (`components/Stepper.tsx`)

± кнопки вокруг значения; шаг настраиваемый (вес 2.5, отдых 15 и т.п.).

### HoldToDelete / HoldToConfirm

Удержание для подтверждения деструктивного действия (вместо мгновенного
удаления). На мобайле допустима замена на confirm-диалог.

### SortableList

Drag-перестановка элементов (упражнения в тренировке/шаблоне).

### SessionsCalendar

Календарь день/неделя/месяц со статусами занятий и подтверждениями клиента.

### LineChart

Линейный график (прогресс замеров, тоннаж). На мобайле — fl_chart.

### ExercisePicker / ExerciseDetails / DemoVideo

Пикер упражнений из каталога с превью (thumb), карточка деталей с медиа
(картинка/зацикленное видео), оборудование, целевые мышцы.

### Avatar / AvatarCropper

Аватар (фото или инициалы); кроппер при загрузке. Приватные файлы — через
защищённый роут с Bearer.

### BodyPoseGuide (клиент)

Подсказка-силуэт для фото прогресса по ракурсам (спереди/сбоку/сзади).

### ScreenHeader / BackFab / ConfirmDialog / NotificationsToggle / TagInput

Шапка экрана, кнопка «назад» (FAB), диалог подтверждения, тумблер пушей,
ввод тегов (чипы).

## Инвентарь общих компонентов

**Тренер** (`apps/web/src/components`): AppShell, Avatar, AvatarCropper, BackFab,
Button, ConfirmDialog, ConnectivityBanner, DemoVideo, ExerciseDetails,
ExercisePicker, Field, HoldToConfirm, HoldToDelete, LineChart,
NotificationsToggle, PushPrompt, QrScanner, ScreenHeader, SessionsCalendar,
SortableList, Stepper, TagInput, UpdateBanner.

**Клиент** (`apps/web-client/src/components`): AvatarCropper, BackFab,
BodyPoseGuide, ConfirmDialog, ConnectBanner, ConnectivityBanner, HoldToDelete,
LineChart, NotificationsToggle, PushPrompt, SessionsCalendar, SortableList,
UpdateBanner.
