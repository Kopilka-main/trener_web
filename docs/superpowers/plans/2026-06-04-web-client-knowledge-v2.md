# База знаний клиента v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps — checkbox (`- [ ]`).

**Goal:** «База знаний» показывает упражнения с тренировок клиента, обогащённые каталогом тренера (описание/группа/подгруппа), с фильтром по группе мышц/подгруппе и read-only деталью упражнения.

**Architecture:** Новый read-only фасад `client-app-exercises` (каталог тренера через resolveScope). Фронт: порт `muscleGroups`, хук каталога, переработка `KnowledgePage` (объединение workout-derived + каталог + фильтры), новый `ExerciseDetailPage`. Бэкенд-таблиц/миграций нет.

**Спека:** `docs/superpowers/specs/2026-06-04-web-client-knowledge-v2-design.md`.

**Образцы:** фасад — `apps/api/src/modules/client-app-workouts/`; экран/фильтры — `apps/web/src/pages/KnowledgeBasePage.tsx`, `apps/web/src/pages/ExerciseEditPage.tsx`; `apps/web-client/src/lib/workout-stats.ts` (`aggregateExerciseOverview`).

---

## Соглашения

- `*.itest.ts` — только trener_test (контроллер). Сабагент: `npm run typecheck`, unit, `npm run build -w @trener/web-client`.
- Conventional Commits, без `--no-verify`; subject не с заглавной аббревиатуры. На master не пушь.

---

## Task 1: Фасад `client-app-exercises` (read-only каталог)

**Files:** create `apps/api/src/modules/client-app-exercises/client-app-exercises.routes.ts`, `client-app-exercises.module.ts`, `client-app-exercises.isolation.itest.ts`; modify `apps/api/src/app.ts`.

Образец — `apps/api/src/modules/client-app-workouts/`. `exercises`-сервис: `makeExercisesService(makeExercisesRepo(db), {newId})`, метод `list(trainerId): Promise<ExerciseResponse[]>`.

- [ ] **Step 1: routes** — `GET /api/client/exercises` (preHandler `requireClient`, response `exerciseListResponseSchema`): `const {trainerId} = await scope(req); return { exercises: await svc.list(trainerId) };`. Импорты: `exerciseListResponseSchema` (@trener/shared), `ExercisesService` (тип), `requireClient`, `makeClientScope`/`ResolveScope`. Routes не импортируют repo.
- [ ] **Step 2: module** — `registerClientAppExercisesModule(app, { db, clock, resolveScope })`: `const svc = makeExercisesService(makeExercisesRepo(db), { newId: clock.newId }); clientAppExercisesRoutes(app, svc, resolveScope);` (сверить фактическую сигнатуру `makeExercisesService` по `exercises.module.ts`).
- [ ] **Step 3: app.ts** — импорт + `registerClientAppExercisesModule(app, { db: deps.db, clock, resolveScope: (id) => clientAuthSvc.resolveScope(id) });` рядом с прочими client-app-\*.
- [ ] **Step 4: typecheck** — `npm run typecheck -w apps/api`.
- [ ] **Step 5: isolation itest** (контроллер) — по образцу `client-app-workouts.isolation.itest.ts`: без `client_sid` → 401; непривязанный → 409; привязанный → 200 и в списке есть глобальные/тренерские упражнения (тренер создаёт упражнение через `POST /api/exercises`, клиент видит его в `/api/client/exercises`).
- [ ] **Step 6: commit** — `feat(api): фасад client-app-exercises (каталог упражнений тренера, read-only)`.

---

## Task 2: Фронт — каталог, фильтры, деталь

**Files:** create `apps/web-client/src/lib/muscleGroups.ts`, `apps/web-client/src/api/exercises.ts`, `apps/web-client/src/pages/ExerciseDetailPage.tsx`; modify `apps/web-client/src/pages/KnowledgePage.tsx`, `apps/web-client/src/App.tsx`.

- [ ] **Step 1: порт muscleGroups** — скопировать `apps/web/src/lib/muscleGroups.ts` в `apps/web-client/src/lib/muscleGroups.ts` без изменений.

- [ ] **Step 2: хук каталога** — `apps/web-client/src/api/exercises.ts`:

```ts
import { exerciseListResponseSchema, type ExerciseResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

export const clientExercisesQueryKey = ['client', 'exercises'] as const;

export function useClientExercises() {
  return useQuery<ExerciseResponse[]>({
    queryKey: clientExercisesQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/exercises', { schema: exerciseListResponseSchema });
        return r.exercises;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}
```

- [ ] **Step 3: переработка `KnowledgePage`** — список упражнений с тренировок, обогащённый каталогом, + фильтры:
  - данные: `useClientWorkouts()` → `aggregateExerciseOverview` (id/name/PR/lastDate/isTimeBased); `useClientExercises()` → `Map<id, ExerciseResponse>`.
  - элемент списка: `{ id, name, category, subgroup, overview }` где category/subgroup из каталога (если есть), name — из каталога либо из overview.
  - state `group: string | null`, `subgroup: string | null`.
  - чипы групп: уникальные `category` среди элементов (отсортировать; «Все» сбрасывает group+subgroup). При выбранной группе — чипы подгрупп: `orderSubgroups(group, присутствующие subgroup в этой группе)`.
  - фильтрация: по group (category===group) и subgroup.
  - чипы — снизу (one-handed), как фильтры в других экранах; список сверху, прокрутка.
  - тап по карточке → `navigate('/knowledge/' + id)`.
  - пустые состояния: непривязан/нет упражнений — текст-подсказка (как сейчас).
  - карточка показывает: название + «категория · подгруппа» (muted) + PR/последняя дата (как сейчас).

- [ ] **Step 4: `ExerciseDetailPage`** (`/knowledge/:exerciseId`, read-only):
  - `const { exerciseId } = useParams()`; `useClientExercises()` → найти по id; `useClientWorkouts()` → `aggregateExerciseOverview` → найти overview по id (для «Ваш результат»).
  - Заголовок — название (из каталога или overview). Блоки: «Категория · подгруппа»; «Описание» (`description` или «Описание не задано»); «Параметры» (повторы/вес/время/отдых — показывать только заданные ненулевые); «Ваш результат» (PR вес/время + последняя дата, если есть overview). Read-only, без форм.
  - Навигация назад — глобальный `BackFab` (ничего добавлять не надо).

- [ ] **Step 5: маршрут** — в `App.tsx` добавить `<Route path="/knowledge/:exerciseId" element={<ExerciseDetailPage />} />` (и импорт). `/knowledge` остаётся на `KnowledgePage`.

- [ ] **Step 6: проверки** — `npm run typecheck` (корень), `npm run test -w apps/web-client`, `npm run build -w @trener/web-client`. Тесты `KnowledgePage`/`ExerciseDetailPage` (рендер из мок-хуков: список+фильтр, деталь, пустые).

- [ ] **Step 7: commit** — `feat(web-client): база знаний с каталогом, фильтрами и деталью упражнения`.

---

## Финал

- [ ] `npm run check` зелёный; сборка web-client зелёная.
- [ ] Контроллер: itest client-app-exercises (trener_test) зелёный; пересборка docker api + web-client; live: клиент видит упражнения с описанием, фильтр по группе/подгруппе, деталь открывается. Тестовые данные убрать.
- [ ] finishing-a-development-branch.

## Self-review (план против спеки)

- Фасад каталога (401/409/list) → Task 1 ✓
- Порт muscleGroups + хук каталога → Task 2.1–2.2 ✓
- KnowledgePage: объединение workout-derived + каталог + фильтр группа/подгруппа → Task 2.3 ✓
- Деталь упражнения read-only (описание/параметры/результат) + маршрут → Task 2.4–2.5 ✓
- Охват «только с тренировок» (overview как источник списка) → Task 2.3 ✓
- Пустые/ошибки/без красного текста ✓
