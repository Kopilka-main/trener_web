# Создание/правка клиента — ClientEditPage.tsx

**Маршрут:** `/clients/new` (`mode='create'`) · `/clients/:id/edit` (`mode='edit'`)
**Точки входа:** FAB на `/clients`; кнопка «Править» на `/clients/:id/profile`
**Назначение:** форма данных клиента + привязка клиентского аккаунта по коду/QR; в edit — аватар и удаление.

## Макет (сверху вниз)

1. **Шапка iOS-стиля** (sticky): круглая «отмена» (X) → `navigate(-1)`; заголовок
   «Новый клиент»/«Клиент»; круглая «сохранить» (✓, `bg-accent`) — submit формы.
2. **Аватар** по центру 96×96. В `edit` — кликабельный (Camera-бейдж) + ссылки
   «Изменить фото» / «Удалить фото». В `create` — только превью (без загрузки).
3. **Раздел «Подключение»:** строка-кнопка открывает `ConnectDialog`.
   - Если `accountId` пуст: «Подключить клиента» / «Привязать по коду из приложения клиента».
   - Если задан: «Код привязки указан» / «ID: <accountId>» + кнопка
     **«Получить данные из профиля клиента»** (Download) — тянет профиль аккаунта.
4. **Имя / Фамилия** — сгруппированная карточка с разделителем. Имя обязательно.
5. **Раздел «Формат»:** сегмент «Спортзал» (`isOnline=false`) / «Онлайн» (`isOnline=true`).
6. **Раздел «Связь»:** добавленные контакты (иконка + тип + значение + X),
   ниже строки «+ добавить …» с ФИКСИРОВАННЫМ типом (тип в самом контакте не меняется).
7. **Раздел «Личное»:** дата рождения (авто-формат ДД.ММ.ГГГГ).
8. **Раздел «Заметки»:** textarea.
9. **Раздел «Теги»:** chip-input (Enter/blur добавляет, X убирает).
10. Сообщение об ошибке мутации.
11. В `edit`: кнопка **«Удалить клиента»** (Trash2 danger) → `DeleteDialog`.

## Поля формы → payload

Submit собирает payload (тримминг, пустое → null):
| поле формы | payload | правило |
| ---------- | ------- | ------- |
| firstName | `firstName` | обязательно (trim≠'') |
| lastName | `lastName` | необязательно |
| Связь (тип «Телефон») | `phone` | первый телефон из контактов, иначе null |
| notes | `notes` | trim, '' → null |
| accountId | `accountId` | trim, '' → null |
| birthDate (ДД.ММ.ГГГГ) | `birthDate` | → ISO `YYYY-MM-DD` или null |
| contacts | `contacts` | только с непустым `value`, `{type,value}` |
| tags | `tags` | массив строк |
| isOnline | `isOnline` | bool |

**Типы контактов** (`CONTACT_ADD`): Телефон, Email, Telegram, WhatsApp, MAX, Instagram, ВКонтакте.
Иконка/placeholder/inputMode подбираются по типу.

## Данные

| Поле                | Источник                                                                                                                              | Формат                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| существующий клиент | `useClient(id)` (только edit) → `GET /api/clients/:id`                                                                                | `ClientResponse`                      |
| аватар edit         | `existing.data.avatarFileId` → `/api/files/:id`                                                                                       | —                                     |
| профиль аккаунта    | `getAccountProfile(accountId)` → `GET /api/clients/account-profile?accountId=` → `{ profile }`                                        | firstName/lastName/birthDate/contacts |
| проверка кода       | `checkConnectCode(code, excludeClientId)` → `GET /api/clients/connect-code/check?code=&excludeClientId=` → `{ exists, linkedClient }` | —                                     |

В edit `useEffect` гидрирует поля из `existing.data` (контакты: если пусто, но есть `phone` —
подставляет `[{type:'Телефон', value: phone}]`).

## Действия

- **Submit (✓):** валидация (имя, дата). При ошибках — `setShowErrors(true)`.
  - create: `useCreateClient().mutate(payload)` → `POST /api/clients` body `CreateClientRequest`
    → `{ client }`; onSuccess `navigate('/clients/:id', { replace })`. Инвалидация `['clients']`.
  - edit: `useUpdateClient(id).mutate(payload)` → `PATCH /api/clients/:id` body `UpdateClientRequest`
    → `{ client }`; onSuccess `navigate(-1)`. Инвалидация `['clients']`, `['clients', id]`.
- **Отмена (X):** `navigate(-1)`.
- **Аватар (edit):** выбор файла → `useUploadClientAvatar(id)` → `POST /api/clients/:id/avatar`
  (multipart, поле `photo`) → `{ client }`. «Удалить фото» → `DELETE /api/clients/:id/avatar` → `{ ok }`.
- **Подключение (`ConnectDialog`):** ввод/скан QR → «Подключить» вызывает
  `checkConnectCode` ПЕРЕД применением:
  - `!exists` → ошибка «Клиент с таким кодом не найден…», не применяем.
  - `linkedClient` (код уже у другого клиента тренера) → предупреждение с ФИО, не применяем.
  - иначе → `onApply(code)` (локально в state `accountId`). «Отключить» → `accountId=''`.
- **Получить данные** (`fillFromAccount`): `getAccountProfile(accountId)` → заполняет
  firstName/lastName/birthDate и дописывает недостающие контакты (без дублей). Ошибка → текст.
- **Теги:** Enter/blur — `addTag` (без дублей); X — `removeTag`.
- **Удаление (`DeleteDialog`):** требует ввести имя клиента точно → `useDeleteClient().mutate(id)`
  → `DELETE /api/clients/:id` → `{ ok }`; onSuccess `navigate('/clients', { replace })`.

## Состояния

- **loading edit** (`existing.isPending`): «Загрузка…».
- **Валидация:** `firstName==''` → «Обязательно к заполнению»; `birthDate` → проверка
  (формат, месяц 1-12, год 1900..now, день месяца, не в будущем). Ошибки видны после первого submit.
- **Ошибка мутации:** код `CLIENT_ACCOUNT_NOT_FOUND` → «Неверный код подключения…»;
  иначе «Не удалось сохранить…».
- **Аватар:** ошибка upload/remove → «Не удалось обновить фото…».
- Диалоги закрываются по Esc / тапу по фону.

## Навигация

✓ create→`/clients/:id` (replace) · ✓ edit→`navigate(-1)` (обычно карточка/профиль) ·
X→`navigate(-1)` · удаление→`/clients` (replace).

## Бизнес-правила и edge-cases

- `phone` в payload = первый контакт типа «Телефон» (legacy-поле; основной источник — `contacts`).
- Код привязки проверяется на сервере **до** сохранения, чтобы не создать дубль связи
  (`excludeClientId` исключает текущего клиента из проверки на дубль).
- Дата рождения хранится ISO `YYYY-MM-DD`, в форме — `ДД.ММ.ГГГГ` (авто-точки, maxLength 10).
- Удаление необратимо и защищено вводом полного имени.
- `accountProfile` НЕ возвращает email (это логин аккаунта, не данные о клиенте).

## Сводка эндпоинтов

- `GET /api/clients/:id` → `{ client }` — загрузка для edit.
- `POST /api/clients` body `CreateClientRequest` → `{ client }` — создание.
- `PATCH /api/clients/:id` body `UpdateClientRequest` → `{ client }` — обновление.
- `DELETE /api/clients/:id` → `{ ok }` — удаление.
- `POST /api/clients/:id/avatar` (multipart `photo`) → `{ client }` — загрузка аватара.
- `DELETE /api/clients/:id/avatar` → `{ ok }` — удаление аватара.
- `GET /api/clients/connect-code/check?code=&excludeClientId=` → `{ exists, linkedClient }` — проверка кода.
- `GET /api/clients/account-profile?accountId=` → `{ profile }` — профиль аккаунта для авто-заполнения.

## Расхождения мобайла (на момент составления)

- [P?] Свериться: набор типов контактов и строки «+ добавить …» с фиксированным типом.
- [P?] Двухступенчатая привязка: ввод/QR → серверная проверка `connect-code/check` → применение,
  с предупреждением о дубле (linkedClient ФИО).
- [P?] «Получить данные из профиля клиента» дозаполняет форму из подключённого аккаунта.
