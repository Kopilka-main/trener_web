# Календарь клиентского приложения — дизайн

**Дата:** 2026-06-03
**Раздел:** `apps/web-client` → «Календарь» (4-я секция после Тренировки/Профиль/Чат).
**Связано:** [[project_web_client_app]], фундамент/паттерн фасадов — `2026-06-03-web-client-foundation-design.md`.

## Цель

Клиент видит свои назначенные тренером занятия в той же сетке день/неделя/месяц, что и
тренер, и может **подтвердить** или **отклонить** каждое будущее занятие. Подтверждение —
отдельный статус (`clientConfirmation`), не меняющий жизненный цикл занятия (`status`);
тренер видит ответ клиента на своём календаре.

## Решения (зафиксированы в брейншторме)

1. **Вид** — такой же, как у тренера: переиспользуем сетку `SessionsCalendar`
   (день/неделя/месяц, навигация периода, нижний переключатель вида).
2. **Подтверждение** — отдельное поле `clientConfirmation` (`pending`/`confirmed`/`declined`).
   Занятие остаётся; тренер видит ответ.
3. Клиент **не создаёт** занятия (самозапись отложена) — только смотрит + подтверждает/отклоняет.
4. Кнопки подтверждения **скрыты для прошедших** занятий (по дате+времени начала).
5. Отклонение **не отменяет** занятие (`status` не трогаем) — решает тренер.
6. Клиент **видит онлайн-занятия** (он их посещает). Тренерский календарь онлайн скрывает —
   это поведение тренера не меняем.

## Подход

**Порт `SessionsCalendar` в web-client + новое поле подтверждения.** Приложения не импортируют
друг друга (раздельный деплой), поэтому компонент сетки и его date-хелперы копируются в
`apps/web-client` с адаптацией пропсов под клиента (создание убрано, тап по занятию → лист
подтверждения). Вынос в общий `packages/ui` отложен — оправдан при третьем потребителе.

## Архитектура

### Бэкенд

**Схема + миграция (0027)**

- `sessions.clientConfirmation text not null default 'pending'`.
- Check-constraint `sessions_client_confirmation_chk IN ('pending','confirmed','declined')`.
- Существующие занятия получают `pending` через default.

**Контракт (`packages/shared/src/sessions.ts`)**

- `clientConfirmationSchema = z.enum(['pending','confirmed','declined'])`.
- `sessionResponseSchema` += `clientConfirmation: clientConfirmationSchema`.
- `clientSessionConfirmRequestSchema = z.object({ status: z.enum(['confirmed','declined']) })`.
  (Клиент может выставить только confirmed/declined; вернуться в pending нельзя.)

**Repo (`sessions.repo.ts`)**

- `select`/`toResponse` += `clientConfirmation`.
- `listForClient(trainerId, clientId, range)` — фильтр по `trainerId` И `clientId`,
  диапазон дат как в `listByTrainer`, **без** скрытия онлайн. Сортировка как у `listByTrainer`.
- `setClientConfirmation(trainerId, clientId, id, status)` — UPDATE с условием
  `id = :id AND trainerId = :trainerId AND clientId = :clientId`; возвращает обновлённую строку
  или `null`, если не найдено/не принадлежит клиенту.

**Service (`sessions.service.ts`)**

- `listForClient(trainerId, clientId, range)` → `SessionResponse[]`.
- `setClientConfirmation(trainerId, clientId, id, status)` → `SessionResponse`;
  `null` из repo → `notFound()`.

**Фасад `client-app-calendar`** (новый модуль, паттерн `makeClientScope`)

- `GET /api/client/sessions?from&to` → `{ sessions }` (через `scope(req)` → `listForClient`).
- `POST /api/client/sessions/:id/confirmation` body `{ status }` → `{ session }`
  (через `scope(req)` → `setClientConfirmation`).
- Регистрируется в `app.ts` рядом с прочими `client-app-*`, использует `clientAuthSvc.resolveScope`.

### Клиентский фронт (`apps/web-client`)

**Порт инфраструктуры календаря**

- `src/lib/calendar.ts` — копия date-хелперов из `apps/web/src/lib/calendar.ts`
  (`CAL_HOURS`, `addDays`, `monthGrid`, `weekDates`, `toISODate`, и т.д.).
- `src/components/SessionsCalendar.tsx` — порт; адаптации:
  - `onSlotClick?` делаем **опциональным** (клиент не создаёт занятия; пустой слот некликабелен,
    курсор/обработчик не вешаем при отсутствии пропа).
  - `renderLabel` показывает иконку статуса подтверждения (✓ confirmed / ✕ declined / без иконки pending).
  - Остальное (виды, навигация, автоскролл к 7:00, нижний переключатель) — без изменений.

**API-хук (`src/api/calendar.ts`)**

- `useClientSessions(range)` — `GET /api/client/sessions`, `refetchInterval` (как чат), 409 → `[]`.
- `useConfirmSession()` — мутация `POST .../confirmation`, инвалидирует список.

**Экран (`src/pages/CalendarPage.tsx`)**

- Сетка `SessionsCalendar` без `onSlotClick`; `onSessionClick` открывает нижний лист.
- Нижний лист занятия: дата/время, длительность, локация, бейдж «онлайн», заметка тренера,
  текущий статус подтверждения. Кнопки **«Подтвердить»/«Отклонить»** — только для будущих занятий
  (дата+время начала > now); для прошедших кнопок нет, показываем только статус.
- Непривязанный клиент (409) → приглашение «Подключить тренера», как в других секциях.
- Маршрут уже есть в `App.tsx` (заглушка «Скоро») — заменяем на экран.

### Тренерская сторона (минимально)

- `SessionResponse` теперь несёт `clientConfirmation` — приходит автоматически.
- Тренерский `SessionsCalendar`: на блоке занятия маленький индикатор ответа клиента
  (подтверждено / отклонено / ждёт). Логику создания/редактирования не трогаем.

## Поток данных

1. Клиент открывает «Календарь» → `GET /api/client/sessions?from&to` → `scope` резолвит
   `{trainerId, clientId}` → `listForClient` → сетка.
2. Тап по будущему занятию → лист → «Подтвердить»/«Отклонить» →
   `POST /api/client/sessions/:id/confirmation` → `setClientConfirmation` → инвалидация списка.
3. Тренер открывает свой календарь → видит `clientConfirmation` на блоках.

## Обработка ошибок

- Непривязанный клиент: `scope` → `null` → 409 NOT_LINKED → хук отдаёт `[]`, экран показывает приглашение.
- Подтверждение чужого/несуществующего занятия: repo вернёт `null` → service `notFound()` → 404.
- Сетевые ошибки списка: состояние ошибки на экране, как в других секциях.

## Тестирование

- **Unit (service):** `listForClient` прокидывает scope+range; `setClientConfirmation` при `null`
  из repo → `notFound`; статус прокидывается.
- **Isolation (repo itest, только `trener_test`):** клиент видит лишь свои занятия (не чужого
  клиента того же тренера); `setClientConfirmation` не трогает занятие другого клиента;
  онлайн-занятия попадают в `listForClient`.
- **Фасад:** без `client_sid` → 401; привязанный клиент получает свои занятия и может сменить статус;
  непривязанный → 409.
- **Контракт:** новые/изменённые Zod-схемы валидируются.

## Вне scope

- Самозапись клиента на занятие.
- Редактирование/отмена занятия клиентом.
- Уведомления тренеру о смене статуса (push/чат).
- Вынос `SessionsCalendar` в общий пакет.
