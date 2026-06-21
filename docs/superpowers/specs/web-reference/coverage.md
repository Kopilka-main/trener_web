# Матрица покрытия и рантайм-сверка

Статусы рантайма: ❓ не сверено · 🔴 сломано/расходится · 🟡 частично · ✅ совпадает с эталоном.
Сверять ПО файлам справочника (`client/*.md`, `trainer/*.md`), на устройстве.

## Клиент (`apps/web-client` → `mobile/apps/client`)

| Эталон                 | Мобильный экран        | Рантайм | Заметка                                                                                                                                                |
| ---------------------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| client/login           | login_screen           | ❓      |                                                                                                                                                        |
| client/register        | register_screen        | ❓      |                                                                                                                                                        |
| client/connect         | connect_screen         | ❓      |                                                                                                                                                        |
| client/home            | home_screen            | 🟡      | код приведён к эталону (analyze ✓): attention/«ВСЁ ТИХО», primary-fallback, hero→профиль, аватар тренера, excludedFromBalance; проверить на устройстве |
| client/calendar        | calendar_screen        | ❓      | подтверждение pending даже после старта                                                                                                                |
| client/workouts-list   | workouts_screen        | ❓      |                                                                                                                                                        |
| client/run-workout     | active_workout_screen  | ❓      |                                                                                                                                                        |
| client/workout-detail  | workouts_screen Detail | ❓      |                                                                                                                                                        |
| client/chat            | chat_screen            | ❓      |                                                                                                                                                        |
| client/notifications   | notifications_screen   | ❓      |                                                                                                                                                        |
| client/knowledge       | knowledge_screen       | ❓      | двухуровневые чипы группа→подгруппа                                                                                                                    |
| client/exercise-detail | knowledge Detail       | ❓      | в вебе НЕТ графика и медиа                                                                                                                             |
| client/stats           | progress_screen        | ❓      |                                                                                                                                                        |
| client/profile         | settings+profile_edit  | ❓      | маска ДР, кроп аватара                                                                                                                                 |
| client/trainer         | trainer_screen         | 🟡      | отключение — вводом ИМЕНИ тренера (есть простой confirm)                                                                                               |

## Тренер (`apps/web` → `mobile/apps/trainer`)

| Эталон                  | Мобильный экран         | Рантайм | Заметка                                                                                         |
| ----------------------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| trainer/login           | login_screen            | ❓      |                                                                                                 |
| trainer/register        | register_screen         | ❓      |                                                                                                 |
| trainer/home            | home_screen             | 🟡      | онлайн исключать везде; формулы плиток сверить                                                  |
| trainer/calendar        | calendar_screen         | ✅      | онлайн скрыт, привязка plan-тренировки (шаблон→черновик), статус, зал; «запомнить»/история — P2 |
| trainer/clients         | clients_screen          | ✅      | поиск, сортировка алфавит/занятие, фильтр формата, аватары, группы                              |
| trainer/client-card     | clients_screen Detail   | 🟡      | веб = 6 плиток-навигация + CTA; у нас секции                                                    |
| trainer/client-edit     | client_edit_screen      | 🟡      | connect-code/check, account-profile, аватар, типы контактов                                     |
| trainer/client-profile  | clients_screen Detail   | ❓      | read-only витрина + копирование по long-press                                                   |
| trainer/client-workouts | clients_screen + assign | ❓      |                                                                                                 |
| trainer/active-workout  | active_workout_screen   | ❓      | + «добавить в историю» с датой                                                                  |
| trainer/client-stats    | clients_screen Stats    | ❓      |                                                                                                 |
| trainer/client-medical  | client_medical_screen   | ❓      | accept image/\* + pdf                                                                           |
| trainer/client-payments | clients_screen Баланс   | ❓      | формула баланса (все completed)                                                                 |
| trainer/client-calendar | calendar_screen         | ❓      | слит в общий                                                                                    |
| trainer/messages        | conversations_screen    | ❓      |                                                                                                 |
| trainer/client-chat     | chat_screen             | ❓      | /task,/pin парсит сервер; открепить DELETE .../pin                                              |
| trainer/notifications   | notifications_screen    | 🟡      | dismissed≠seen; точные окна дат                                                                 |
| trainer/knowledge-base  | knowledge_screen        | ❓      | состояние в sessionStorage                                                                      |
| trainer/exercise-edit   | exercise_edit_screen    | ❓      | системное→копия (sourceExerciseId)                                                              |
| trainer/template-edit   | template_edit_screen    | ❓      | подход = отдельная позиция (sets:1)                                                             |
| trainer/accounting      | accounting_screen       | ❓      | списки не фильтруются сервером по дате                                                          |
| trainer/profile         | settings+profile_edit   | ❓      | аватар через /api/files/:id?v=                                                                  |

## Ключевые расхождения, найденные при сборке справочника

**Клиент**

- [P1] **Главная:** 6 плиток (Тренировки/Календарь/Чат/Прогресс/База знаний/Уведомления) в сетке 2×3; герой = «количество тренировок» (оплаченный баланс) + дата окончания пакета + строка ближайшего занятия. В мобайле было 4 плитки и счётчик занятий.
- [P2] **Trainer-страница:** отключение требует ввода ИМЕНИ тренера (точное совпадение), а не простого confirm.
- [P2] **Профиль:** ДР через маску ДД.ММ.ГГГГ↔ISO; аватар через AvatarCropper (квадрат, zoom).

**Тренер**

- [P1] **Clients:** в вебе НЕТ фильтра активные/архив. Есть тумблер сортировки (алфавит ↔ ближайшее занятие) + сегмент формата (Все/Онлайн/Спортзал). «Онлайн» = формат работы (`isOnline`), не presence. Архивные — приглушённые в общем списке.
- [P1] **Calendar:** клиент необязателен; привязка planned-workout (existing/template/history → создаёт тренировку клиенту при сохранении); «запомнить» prefs (localStorage); ОНЛАЙН-занятия в тренерском календаре СКРЫТЫ (но создаются). Сейчас этого нет.
- [P1] **Home:** todayCount = planned-занятия на сегодня после текущего времени; ОНЛАЙН исключается во всех метриках; плитка Финансы = summary.balance за месяц.
- [P2] **ClientCard:** веб = 6 плиток-навигация в подэкраны + большая CTA «к тренировкам»; чат заблокирован при отсутствии accountId (диалог привязки).
- [P2] **ClientEdit:** проверка кода `connect-code/check`, дозаполнение `account-profile`, аватар клиента, удаление по вводу имени.
- [P2] **Profile:** аватар тренера по общему `/api/files/:id?v=` (НЕ отдельный auth-роут как у клиента).
