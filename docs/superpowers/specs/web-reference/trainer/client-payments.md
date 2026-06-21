# Оплата клиента — ClientPaymentsPage.tsx

**Маршрут:** `/clients/:id/payments` · **Точки входа:** карточка клиента → «Оплата»
**Назначение:** деньги по клиенту — баланс тренировок (проведено vs оплачено), лента доходов клиента и форма добавления дохода (пакет/абонемент/прочее).

## Макет (сверху вниз)

1. **ScreenHeader** `Оплата · <Имя Фамилия>`, назад → `/clients/:id`.
2. **BalanceCard** (`bg-card`): две колонки — **проведено** (`done`, mono 28px) и **баланс** (`remaining` со знаком; >0 → `+N` acid «оплачено сверх», <0 → `−N` danger «в долг», 0 → «0 ровно по оплате»). Во время загрузки — «—».
3. **Лента доходов** (`incomeList`, по убыванию даты) — **OperationRow** на операцию: тип-кикер (mono, если есть `title`), primary `title ?? category`, мета `дата · subtitle · note`, чипы тегов; справа сумма `+N ₽` (acid) + **HoldToDelete**.
4. **DashedButton «Добавить доход»** → разворачивает **IncomeForm** на месте кнопки.

## Данные

| Поле           | Источник                                                         | Формат    |
| -------------- | ---------------------------------------------------------------- | --------- |
| заголовок      | `useClient(id)`                                                  | строка    |
| `done`         | `useClientWorkouts(id)` где `status==='completed'`, count        | число     |
| `paid`         | `useClientPackages(id)` где `status==='active'`, Σ `lessonsPaid` | число     |
| `remaining`    | `paid − done`                                                    | со знаком |
| доходы клиента | `useIncomes()` отфильтрованные `clientId===id`, сорт по дате ↓   | лента     |

`IncomeResponse`: `id, category, amount, date, clientId, note, tags[], title, subtitle, createdAt`. Синтетические строки-пакеты имеют `id` с префиксом `pkg:` и заполненные `title/subtitle`. `PackageResponse`: `id, clientId, kind('package'|'subscription'), lessonsPaid, lessonsUsed, pricePerLesson, totalPaid, workoutType, paidAt, startsAt, endsAt, status, note, tags[], createdAt`.

## Действия (метод + путь + тело → ответ)

- **Добавить доход** → IncomeForm (чипы типа): `package` / `subscription` → **PackageFields**; `online`/`inventory`/`pharma`/`other` → **SimpleIncomeFields**.
- **Создать пакет/абонемент** (`PackageFields`) → `useCreatePackage` → **POST** `/api/clients/:id/packages` `CreatePackageRequest {kind, lessonsPaid, pricePerLesson, totalPaid, paidAt, startsAt, endsAt?, note?}` → `{package}`.
  - **package**: `lessonsPaid=round(lessons)`, `pricePerLesson=price`, `totalPaid=lessons*price`.
  - **subscription**: `lessonsPaid=0`, `pricePerLesson=0`, `totalPaid=periodPrice`, `endsAt` обязателен.
  - Инвалидирует `['clients',id,'packages']`, `['accounting']`, `packages/balances` (пакет учитывается как доход).
- **Создать прочий доход** (`SimpleIncomeFields`) → `useCreateIncome` → **POST** `/api/incomes` `CreateIncomeRequest {category, amount, date, clientId, note?, tags?}` → `{income}`. `category` фиксирована по типу (Онлайн сопровождение / Инвентарь / Фарма / Прочее). Инвалидирует `['accounting','incomes']`.
- **Удалить операцию** (HoldToDelete) → если `id.startsWith('pkg:')` → `useDeletePackage` **DELETE** `/api/clients/:id/packages/:pid` (pid = `id.slice(4)`); иначе `useDeleteIncome` **DELETE** `/api/incomes/:id`. Оба → `{ok:true}`.

## Состояния

- **balance loading** (`workouts.isPending || packages.isPending`): обе цифры «—», подпись «баланс».
- **нет доходов**: лента скрыта, только кнопка добавления.
- **формы**: валидация на сабмит (`showErrors`) — пакет: тренировок целое >0, цена >0, даты; абонемент: цена за период >0, дата начала+окончания; simple: сумма >0, дата. Ошибки полей — `text-danger`. Кнопка submit при pending → «…».
- Блок «Итого» в PackageFields пересчитывается на лету.

## Навигация

назад → `/clients/:id`. Внутристраничных переходов нет (формы — локальное состояние).

## Бизнес-правила и edge-cases

- **Баланс = Σ lessonsPaid активных пакетов − завершённые тренировки.** Только `status==='active'` пакеты и `status==='completed'` тренировки. (NB: здесь учитываются ВСЕ завершённые, в отличие от формулы баланса на главной клиента, где исключаются `createdByClient`/`excludedFromBalance` — расхождение области применения.)
- **Доходы тренера общие** (бэк фильтрует только по диапазону дат) — список грузится целиком и фильтруется по `clientId` на клиенте.
- **Пакеты в ленте — синтетические доходы** (`id='pkg:<packageId>'`): удаление такой строки удаляет сам пакет, не «доход».
- `formatMoney`: тысячи через узкий неразрывный пробел, «1 500 ₽»; отрицательное с «−».
- Абонемент = доступ на период без счётчика тренировок (`lessonsPaid=0`), поэтому в баланс «оплачено» не добавляет.

## Сводка эндпоинтов

- `GET /api/clients/:id` — клиент (заголовок).
- `GET /api/clients/:id/workouts` — для счётчика проведённых.
- `GET /api/clients/:id/packages` — пакеты клиента (оплачено).
- `GET /api/incomes` — все доходы тренера (фильтр по клиенту на клиенте).
- `POST /api/clients/:id/packages` — создать пакет/абонемент → `{package}`.
- `DELETE /api/clients/:id/packages/:pid` — удалить пакет → `{ok:true}`.
- `POST /api/incomes` — создать доход → `{income}`.
- `DELETE /api/incomes/:id` — удалить доход → `{ok:true}`.
