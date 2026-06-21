# Главная тренера — HomePage.tsx

**Маршрут:** `/` · **Точки входа:** корневой после логина/регистрации
**Назначение:** дашборд тренера — герой «тренировок сегодня» + строка ближайшего занятия + сетка 2×3 плиток-разделов.

## Макет (сверху вниз)

Контейнер на всю высоту, `px-2`, `overflow-hidden`.

1. **Топ-бар (дата слева):** `font-mono`, 11px, bold, uppercase, `tracking-[0.16em]`, цвет `ink-mutedxl`. Текст: `СЕГОДНЯ · <ДЕНЬ> <число> <МЕСЯЦ-РОД.падеж>` (напр. «СЕГОДНЯ · СБ 21 ИЮНЯ»).
2. **Шестерёнка** (абсолют, справа-сверху, на линии даты): иконка Settings 30px, `ink-muted`. Тап → `/profile`.
3. **Герой:**
   - display-число 64px (`font-display`, `tracking-[-0.03em]`), цвет `accent` — `todayCount` (через `pad2`).
   - рядом «тренировок / сегодня» (22px bold, 2 строки). Вся пара — кнопка → `/calendar`.
   - **Строка ближайшего занятия** (если есть `nextSession`): mono-кикер 11px `СЛЕД. · <время>[ <ИМЯ Ф.>][ · <TITLE>]` (uppercase) + акцентная плашка `diffShort` (`accent`/`accent-on`) + стрелка `→` (`accent-text`). Тап → `/clients/:clientId`.
4. **Сетка 2×3** (`grid-cols-2 grid-rows-3 gap-2`), 6 плиток (см. ниже). Каждая плитка: иконка-шелл 40px слева-сверху, `ArrowUpRight` справа-сверху, опц. кикер, метрика (display 36px + mono-подпись), заголовок 17px bold, подзаголовок 11px. Одна плитка может быть **primary** (acid-fill `tile-shadow-primary`).

## Данные

| Что                    | Источник                                                                         | Формат                                  |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| дата (топ-бар)         | `new Date()` локально (`DAY_SHORT`, `MONTH_FULL`)                                | UPPER                                   |
| `todayCount` (герой)   | офлайн-сессии где `date===today && status==='planned' && startTime≥сейчас`       | pad2                                    |
| `nextSession`          | ближайшая не-cancelled офлайн-сессия с `date+startTime ≥ now` (сорт. дата,время) | —                                       |
| `diffShort`            | разница `nextSessionDate − now`                                                  | «3Д» / «2Ч 15М»                         |
| имя клиента строки     | `useClients()` → find по `nextSession.clientId` → `ИМЯ Ф.`                       | UPPER                                   |
| плитка **Клиенты**     | `clients.filter(status==='active').length`                                       | pad2 «активных»                         |
| плитка **Календарь**   | офлайн-сессии на 30 дней где `status!=='cancelled'`                              | pad2 «на 30 дней»                       |
| плитка **Сообщения**   | `useChatUnread()` (`count`)                                                      | pad2 «новых»                            |
| плитка **База знаний** | `useExercises().length`                                                          | pad2 «в базе»                           |
| плитка **Финансы**     | `finance.balance` (доходы−расходы за месяц), в тыс. ₽                            | «12» / «−3», подпись «тыс / за / 1 мес» |
| плитка **Уведомления** | `visibleAlerts.length` (см. ниже)                                                | pad2 «новых» / кикер «ВСЁ ТИХО»         |

## Действия

- Тап по шестерёнке → `/profile`.
- Тап по герою-числу/«тренировок сегодня» → `/calendar`.
- Тап по строке ближайшего занятия → `/clients/:clientId` (карточка клиента).
- Тап по плиткам → `/clients`, `/calendar`, `/messages`, `/knowledge`, `/accounting`, `/notifications`.
- Никаких мутаций — только чтение + навигация.

## Данные при монтаже (хуки и диапазоны)

- `useClients()` → `GET /api/clients` — список клиентов (active-счётчик, имя в строке, алерты).
- `useExercises()` → `GET /api/exercises` — счётчик базы знаний.
- `useSessions(today, today+30д)` → `GET /api/sessions?from&to` — герой и плитка «Календарь».
- `useSessions(сегодня−14, сегодня+30)` → второй вызов `GET /api/sessions?from&to` — данные для алертов.
- `usePackageBalances()` → `GET /api/packages/balances` — клиенты с остатком (для алерта «нет занятий на неделю»).
- `useAccountingSummary(начало месяца, today)` → `GET /api/accounting/summary?from&to` — `balance` для плитки «Финансы».
- `useChatUnread()` → `GET /api/chat/unread` (опрос 4с) — счётчик «Сообщения».

## Состояния

- **loading:** хуки отдают `undefined` → счётчики падают в 0/`??`; рендер не блокируется.
- **Нет `nextSession`:** строка занятия скрыта.
- **Финансы `balance < 0`:** число красным (`danger`), знак «−» типографский; иначе `accent-text`.
- **Уведомления пусты** (`visibleAlerts.length===0`): подзаголовок «нет открытых задач», кикер «ВСЁ ТИХО», метрики нет.
- **Primary-плитка** (один acid-fill на экран): `visibleAlerts.length>0` → «Уведомления»; иначе `chatBadge>0` → «Сообщения»; иначе ни одна.

## Навигация

шестерёнка → /profile · герой/число → /calendar · строка занятия → /clients/:id ·
плитки → /clients /calendar /messages /knowledge /accounting /notifications.

## Бизнес-правила и edge-cases

- **Онлайн-тренировки исключены из тренерского календаря:** `todayCount`, `nextSession`, плитка «Календарь» считаются по `sessionsOffline = sessions.filter(!s.isOnline)`.
- **Герой ≠ «все занятия сегодня»:** только `status==='planned'` и время начала ≥ текущего (прошедшие/проведённые/отменённые не в счёт).
- **`diffShort`:** `СЕЙЧАС` если прошло; `<d>Д` / `<d>Д <h>Ч` если ≥24ч; иначе `<h>Ч <m>М` / `<m>М` / `<h>Ч`.
- **`visibleAlerts`:** `buildNotifications(clients, sessionsForAlerts, paidClientIds)` (та же логика, что `/notifications`), затем фильтр `!dismissed && !seen` (localStorage `notifications_dismissed` / `notifications_seen`). Алерт «нет занятий на неделю» — только для клиентов с положительным остатком пакетов (`balance.remaining>0`).
- **Финансы:** `fmtThousands(n)` = округление `n/1000` по модулю, знак «−» при отрицательном; единица «тыс ₽» в подписи.
- **Метрики плиток умеют ротироваться** (если у плитки несколько значений — смена индекса раз в 10с через `setInterval`); здесь у каждой по одному значению.
- **pad2:** число < 10 показывается как «0N».
- Активные клиенты — строго `status === 'active'` (нет фолбэка «считать всех», в отличие от устаревшего комментария).

## Сводка эндпоинтов

- `GET /api/clients` — клиенты (active-счётчик, имена, алерты).
- `GET /api/exercises` — счётчик «База знаний».
- `GET /api/sessions?from&to` — сессии (герой/«Календарь» на 30 дней; второй вызов −14..+30 для алертов).
- `GET /api/packages/balances` — остатки пакетов (алерт «нет занятий»).
- `GET /api/accounting/summary?from&to` — `balance` за месяц для «Финансы».
- `GET /api/chat/unread` — `count` непрочитанных диалогов (опрос 4с).
