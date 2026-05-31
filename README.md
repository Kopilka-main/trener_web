# Тренер (Prod)

Мультитенантный SaaS для персональных тренеров: клиенты, база упражнений и
тренировок, проведение тренировки с таймером отдыха, календарь, бухгалтерия, чат,
замеры и фото прогресса.

Это продакшен-переписывание MVP-прототипа (репозиторий `Trener`). Архитектура и
стандарты разработки описаны в дизайн-документе:

- [docs/superpowers/specs/2026-05-31-production-rewrite-design.md](docs/superpowers/specs/2026-05-31-production-rewrite-design.md)

## Стек

- **Backend:** Node 20 + Fastify + Drizzle ORM + PostgreSQL 16 + Zod (TypeScript)
- **Frontend:** React 18 + Vite + TanStack Query + Tailwind v4
- **Инфра:** Docker Compose (nginx + api + postgres), GitHub Actions

Структура и команды появятся по мере реализации (см. план в
`docs/superpowers/plans/`).
