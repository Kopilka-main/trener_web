# Профиль клиента — ProfilePage.tsx

**Маршрут:** `/profile` · **Точки входа:** шестерёнка/герой главной; имя/баланс
**Назначение:** карточка клиента, ссылка на тренера, контакты, «о себе»,
уведомления, тема, выход; режим редактирования профиля с аватаром.

## Макет (сверху вниз) — режим просмотра (`ProfileView`)

1. **Заголовок** «Профиль» (28px `font-display`) + кнопка `Pencil` (→ режим правки).
2. **Карточка клиента** (`bg-card`): `AvatarView` 64×64 (фото
   `/api/client/auth/me/avatar?v=<avatarFileId>` или инициалы на `bg-chip`) +
   полное имя (19px bold) + email (muted) + «Дата рождения: ДД.ММ.ГГГГ» (если есть).
3. **Тренер**:
   - если `linked` → ссылка-карточка на `/trainer`: аватар 48×48 (фото
     `/api/client/trainer/avatar?v=<id>` или инициалы), кикер «Ваш тренер», имя,
     `title`, `ChevronRight`;
   - иначе → ссылка-карточка на `/connect` «Подключить тренера» (accent-text).
4. **Контакты**: первая строка — Email (иконка `Mail`, `mailto:`), затем
   `account.contacts[]` (тип + значение).
5. **О себе / цели** (если `account.bio`) — карточка-текст.
6. **Уведомления** — компонент `NotificationsToggle`.
7. **Тема** — `ThemeToggle` (две кнопки Светлая/Тёмная, активная — `bg-accent`).
8. **«Выйти»** (`bg-card`).

## Макет — режим редактирования (`ProfileEdit`, `<form>`)

- Шапка: `ChevronLeft` (Назад/закрыть) + «Редактировать» (22px).
- **`AvatarBlock`**: аватар 80×80 (тап → выбор файла) + (если есть фото) «Удалить».
  После выбора файла — модалка **`AvatarCropper`**.
- **Имя** / **Фамилия** (2 колонки).
- **Дата рождения** — маска `ДД.ММ.ГГГГ` (`inputMode=numeric`, хранится ISO).
- **Контакты** — список строк: `<select>` тип + значение + `X` (удалить);
  «Добавить контакт» (новый по умолчанию тип «Телефон»).
- **О себе / цели** — textarea.
- **«Сохранить»** (`bg-accent`).

## Данные

| Поле              | Источник                                                     | Формат                  |
| ----------------- | ------------------------------------------------------------ | ----------------------- |
| `account`         | `useClientMe()` → `account`                                  | `ClientAccountResponse` |
| `linked`          | `useClientMe()` → `link !== null`                            | bool                    |
| тренер (карточка) | `useClientTrainer()` → firstName/lastName/title/avatarFileId | —                       |
| тема              | `getTheme()` из `lib/theme` (localStorage)                   | `light`/`dark`          |

**`ClientAccountResponse`**: `id`, `email`, `firstName`, `lastName`,
`avatarFileId` (`string|null`), `birthDate` (`string|null`, ISO YYYY-MM-DD),
`contacts: {type,value}[]`, `bio` (`string|null`).

**Типы контактов** (`<select>`): Телефон, WhatsApp, Telegram, MAX, Instagram, Прочее.

## Действия

| Жест/кнопка              | Эффект                         | API (метод путь, тело → ответ)                                                               | Инвалидация |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------- | ----------- |
| `Pencil`                 | открыть правку                 | —                                                                                            | —           |
| `ChevronLeft` / «Назад»  | закрыть правку                 | —                                                                                            | —           |
| «Сохранить» (форма)      | сохранить профиль              | `PATCH /api/client/auth/me`, тело `UpdateClientAccountRequest` → `{ account }`               | `client/me` |
| Тап по аватару (правка)  | выбрать файл → `AvatarCropper` | —                                                                                            | —           |
| `AvatarCropper` «Готово» | загрузить аватар               | `POST /api/client/auth/me/avatar` **multipart/form-data**: `photo` (Blob `avatar.jpg`) → 200 | `client/me` |
| «Удалить» (аватар)       | удалить аватар                 | `DELETE /api/client/auth/me/avatar` → `{ ok }`                                               | `client/me` |
| Добавить/удалить контакт | локально (в `contacts`)        | — (уходит в общий PATCH)                                                                     | —           |
| `ThemeToggle`            | сменить тему                   | — (`setTheme` → localStorage + класс на `<html>`)                                            | —           |
| «Выйти»                  | разлогин                       | `POST /api/client/auth/logout` → `{ ok:true }`                                               | `client/me` |
| Email-строка             | `mailto:` клиента              | —                                                                                            | —           |

**Тело `UpdateClientAccountRequest`**: `firstName?` (1–100), `lastName?` (1–100),
`birthDate?` (`^\d{4}-\d{2}-\d{2}$` или `null` = очистить), `contacts?`
(`{type(1–40), value(1–200)}[]`, ≤20), `bio?` (`string ≤2000` или `null`).
В UI: пустая дата → `null`; пустой bio → `null`; контакты с пустым значением
отбрасываются перед отправкой; имя/фамилия `.trim()`.

## Состояния

- `!me.data` → «Загрузка…» (только заголовок).
- Просмотр vs Редактирование — локальный `editing`.
- Тренер не подключён (`!linked`) → CTA «Подключить тренера» вместо карточки тренера.
- Нет `bio` → блок «О себе» скрыт; нет `birthDate` → строка даты скрыта.
- `update.isError` → «Не удалось сохранить. Попробуйте снова.» (`role=alert`).
- Загрузка/удаление аватара (`busy`) → кнопки `disabled`/`opacity`.
- 409 от `trainer` (не привязан) → `null`, карточка тренера не строится.

## Навигация

`Pencil` → правка (локально) · карточка тренера → `/trainer` · CTA → `/connect` ·
Email → `mailto:` · «Выйти» → разлогин (роутинг на экран входа по `client/me`).

## Бизнес-правила и edge-cases

- **Аватар клиента**: URL фиксированный, кэш-бастинг через `?v=<avatarFileId>`.
  Загрузка — отдельный `fetch` с `credentials:'include'`, поле `photo`, без
  ручного `Content-Type`. `AvatarCropper` отдаёт **квадратный JPEG** (`avatar.jpg`):
  фото можно двигать/масштабировать (zoom 1–4) в рамке 288px, круглая подсказка.
- **Дата рождения**: ввод маскируется `ДД.ММ.ГГГГ`, валидируется (год 1900–2100,
  реальная дата), хранится/шлётся как ISO `YYYY-MM-DD`; некорректная → `null`.
- **Контакты** редактируются целиком (полная замена массива в PATCH).
- **Тема** — чисто клиентская (localStorage + класс на `<html>`), без API.
- **Уведомления** (`NotificationsToggle`) — отдельный компонент (push-подписка),
  здесь не разбирается.
- Цвет — нейтральные ink-токены; «Удалить»/«Выйти» без красного текста.

## Сводка эндпоинтов

- `GET /api/client/auth/me` — аккаунт + привязка.
- `PATCH /api/client/auth/me` — обновить профиль.
- `POST /api/client/auth/me/avatar` — загрузить аватар (multipart).
- `DELETE /api/client/auth/me/avatar` — удалить аватар.
- `POST /api/client/auth/logout` — выход.
- `GET /api/client/trainer` — профиль тренера (карточка).
- `GET /api/client/auth/me/avatar?v=<id>` — изображение аватара клиента.
- `GET /api/client/trainer/avatar?v=<id>` — изображение аватара тренера.

## Расхождения мобайла (на момент составления)

- [P1] Проверить полный цикл аватара: выбор → **кроп (квадрат, zoom/pan)** →
  multipart-загрузка → удаление, с кэш-бастингом `?v=`.
- [P1] Редактор контактов: типизированный `<select>` (Телефон/WhatsApp/Telegram/
  MAX/Instagram/Прочее) + добавление/удаление строк.
- [P2] Маска даты рождения и переключатель темы (light/dark).
