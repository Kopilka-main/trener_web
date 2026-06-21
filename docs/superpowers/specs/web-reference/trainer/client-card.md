# Карточка клиента — ClientCardPage.tsx

**Маршрут:** `/clients/:id` · **Точки входа:** строка списка `/clients`
**Назначение:** хаб клиента — шапка, баланс/прогресс, большая CTA к тренировкам, сетка из 6 разделов, контакты, заметки.

## Макет (сверху вниз)

1. **Шапка профиля:** Avatar 64×64 (`/api/files/:avatarFileId` или инициалы; `muted` если архив)
   - имя «Имя Фамилия» (26px bold). Если `status==='archived'` — чип «Архив» (mono uppercase).
2. **Теги** (если есть): чипы `bg-chip`, с префиксом `#` (добавляется если нет).
3. **Большая primary-плитка «Перейти к тренировкам»** (`bg-accent`, `cta-launch`,
   единственный acid-fill): иконка Dumbbell + «текущая + история» + тройной шеврон →
   `/clients/:id/workouts`.
4. **Сетка плиток 2-колонки** — 6 разделов (`TILES`), у каждого иконка, бейдж (см. ниже), label+sub:
   | key | label | sub | бейдж справа | переход |
   | --- | ----- | --- | ------------ | ------- |
   | `calendar` | Календарь | занятия клиента | `<planned> / <calBalance±>` | `/clients/:id/calendar` |
   | `chat` | Написать | чат с клиентом | замок Unlink если не подключён | `/clients/:id/chat` (или диалог) |
   | `stats` | Прогресс | рекорды и история | `<achievements> ↑` (TrendingUp) | `/clients/:id/stats` |
   | `payments` | Оплата | пакеты и расходы | `<paidBalance±>` (danger при <0) | `/clients/:id/payments` |
   | `medcard` | Медкарта | файлы и заметки | — | `/clients/:id/medcard` |
   | `profile` | Профиль | контакты и данные | — | `/clients/:id/profile` |
5. **Контакты** (если есть `phone`/`birthDate`): строка телефона (`tel:`, иконка Phone accent)
   - строка даты рождения (иконка Cake) «11 июня 1990 · 35 лет».
6. **Заметки** (если `notes`): заголовок mono + текст `whitespace-pre-wrap`.

## Данные

| Поле                | Источник                                                                     | Формат                |
| ------------------- | ---------------------------------------------------------------------------- | --------------------- |
| клиент              | `useClient(id)` → `GET /api/clients/:id` → `{ client }`                      | `ClientResponse`      |
| тренировки          | `useClientWorkouts(id)` → `GET /api/clients/:id/workouts` → `workouts[]`     | —                     |
| пакеты              | `useClientPackages(id)` → `GET /api/clients/:id/packages` → `packages[]`     | —                     |
| сессии              | `useClientSessions(id)` → `GET /api/sessions` (фильтр `clientId` на клиенте) | —                     |
| `achievements`      | `aggregateExerciseOverview(workouts).filter(lastIsRecord).length`            | число                 |
| `paidLessons`       | Σ `lessonsPaid` по пакетам `status==='active'`                               | число                 |
| `completedWorkouts` | тренировки `completed && !excludedFromBalance && !createdByClient`           | число                 |
| `paidBalance`       | `paidLessons − completedWorkouts`                                            | число (может быть <0) |
| `plannedSessions`   | сессии `status==='planned'`                                                  | число                 |
| `calBalance`        | `paidBalance − plannedSessions`                                              | число (может быть <0) |
| `connected`         | `(c.accountId ?? '').trim() !== ''`                                          | bool                  |
| возраст             | `ageFromBirthDate(birthDate)` + склонение «год/года/лет»                     | —                     |

## Действия

- Тап по CTA → `navigate('/clients/:id/workouts')`.
- Тап по плитке (кроме chat-locked) → `navigate('/clients/:id/<key>')`.
- Тап по плитке **«Написать»** при `!connected` (`chatLocked`) → открывает `ConnectClientDialog`
  (плитка показана `shelf opacity-60` + иконка Unlink danger), а не переходит в чат.
- В диалоге: ввод ID клиента → «Подключить» → `useUpdateClient(id).mutate({ accountId: code })`
  → `PATCH /api/clients/:id` body `{ accountId }`; при успехе закрыть диалог и `navigate('/clients/:id/chat')`.
  Инвалидация: `['clients']`, `['clients', id]`. Esc/тап по фону — закрыть.
- Тап по телефону → `tel:`.

## Состояния

- **loading** (`client.isPending`): «Загрузка…».
- **error** (`client.isError || !client.data`): «Не удалось загрузить клиента.» (role=alert).
- **Архив**: avatar muted + чип «Архив».
- **Не подключён** (`!connected`): плитка «Написать» заблокирована (диалог подключения).
- Бейдж calendar виден если `plannedSessions>0 || sessionList.length>0`; `calBalance<0` — danger,
  `>0` — с префиксом `+`.
- Бейдж stats виден если `achievements>0`.
- Бейдж payments: `paidBalance<0` — danger, иначе accent; `>0` — с префиксом `+`.
- Теги/контакты/заметки — каждый блок рендерится только при наличии данных.

## Навигация (все подэкраны карточки)

- CTA / плитка `calendar` → `/clients/:id/workouts`, `/clients/:id/calendar`
- `chat` → `/clients/:id/chat` (если подключён)
- `stats` → `/clients/:id/stats` · `payments` → `/clients/:id/payments`
- `medcard` → `/clients/:id/medcard` · `profile` → `/clients/:id/profile`
- Правка профиля доступна из подэкрана `/clients/:id/profile` → кнопка «Править» → `/clients/:id/edit`.
  (С самой карточки прямой кнопки «Править» нет — через раздел «Профиль».)
- Маршруты заданы в `App.tsx`; неизвестный `:section` → `ClientSectionPage` (заглушка).

## Бизнес-правила и edge-cases

- **Баланс оплаты** (`paidBalance`) = оплачено по активным пакетам − проведённые тренером тренировки.
  Самостоятельные (`createdByClient`) и `excludedFromBalance` НЕ вычитаются. Может быть отрицательным (долг).
- **Баланс календаря** (`calBalance`) = `paidBalance − plannedSessions`: «запланировано / ещё можно записать».
  Отрицательный → записано больше, чем оплачено (перезапись). Инвариант: запланировано + осталось = paidBalance.
- **achievements** = упражнения с рекордом в последней сессии (зелёная стрелка ↑).
- Подключение чата требует `accountId` (код привязки из клиентского приложения).
- Возраст считается из компонентов строки `birthDate` (без `new Date` — иначе UTC-сдвиг).

## Сводка эндпоинтов

- `GET /api/clients/:id` → `{ client }` — клиент.
- `GET /api/clients/:id/workouts` → `{ workouts }` — тренировки (баланс, достижения).
- `GET /api/clients/:id/packages` → `{ packages }` — пакеты (оплачено).
- `GET /api/sessions` → `{ sessions }` — занятия (фильтр по `clientId` на клиенте).
- `PATCH /api/clients/:id` body `{ accountId }` → `{ client }` — привязка кода (из диалога).
- `GET /api/files/:avatarFileId` — аватар.

## Расхождения мобайла (на момент составления)

- [P?] Свериться: **6 плиток** (Календарь/Написать/Прогресс/Оплата/Медкарта/Профиль) + большая CTA «Тренировки».
- [P?] Бейджи плиток — формулы `paidBalance`/`calBalance`/`achievements` выше; цвет danger при отрицательном.
- [P?] Чат блокируется при отсутствии `accountId` и открывает диалог подключения.
