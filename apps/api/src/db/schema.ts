import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  primaryKey,
  integer,
  doublePrecision,
  foreignKey,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ClientStatus } from '@trener/shared';

// Служебная таблица версий схемы приложения (доменные таблицы добавит Фаза 2+).
export const schemaMeta = pgTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainers = pgTable(
  'trainers',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    title: text('title'),
    bio: text('bio'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // ИНВАРИАНТ: email хранится уже нормализованным (lowercase+trim) — это гарантирует
  // Zod-контракт (registerRequestSchema/loginRequestSchema). Уникальность регистро-
  // независима только при условии, что ВСЕ записи email идут через контракт-схему.
  // Любой обходной путь (seed/админка/импорт) обязан нормализовать email сам.
  (t) => [uniqueIndex('trainers_email_uq').on(t.email)],
);

export const sessionsAuth = pgTable('sessions_auth', {
  id: text('id').primaryKey(), // случайный токен сессии
  trainerId: text('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Человек-клиент (общая идентичность, БЕЗ учётки — клиент не логинится).
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Связь тренер↔клиент (M:N) + профиль клиента глазами этого тренера.
export const trainerClients = pgTable(
  'trainer_clients',
  {
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    // 'active' | 'archived' — архив через статус; «удаление» = разрыв связи (delete строки).
    status: text('status').$type<ClientStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.trainerId, t.clientId] }),
    check('trainer_clients_status_chk', sql`${t.status} IN ('active', 'archived')`),
  ],
);

export const exercises = pgTable('exercises', {
  id: text('id').primaryKey(),
  // NULL = глобальная системная запись (видна всем, read-only); иначе личная запись тренера.
  trainerId: text('trainer_id').references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: doublePrecision('default_weight_kg'),
  defaultTimeSec: integer('default_time_sec'),
  restSec: integer('rest_sec').notNull().default(90),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workoutTemplates = pgTable('workout_templates', {
  id: text('id').primaryKey(),
  trainerId: text('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryTag: text('category_tag'),
  shortDescription: text('short_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workoutTemplateExercises = pgTable(
  'workout_template_exercises',
  {
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    sets: integer('sets').notNull(),
    reps: integer('reps'),
    weightKg: doublePrecision('weight_kg'),
    timeSec: integer('time_sec'),
    restSec: integer('rest_sec').notNull().default(90),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.position] })],
);

export const clientWorkouts = pgTable(
  'client_workouts',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    sourceTemplateId: text('source_template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    status: text('status')
      .$type<'draft' | 'active' | 'completed' | 'skipped'>()
      .notNull()
      .default('draft'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationSec: integer('duration_sec'),
    trainerNote: text('trainer_note'),
    rpe: integer('rpe'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'client_workouts_status_chk',
      sql`${t.status} IN ('draft', 'active', 'completed', 'skipped')`,
    ),
  ],
);

export const clientWorkoutExercises = pgTable(
  'client_workout_exercises',
  {
    workoutId: text('workout_id')
      .notNull()
      .references(() => clientWorkouts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
  },
  (t) => [primaryKey({ columns: [t.workoutId, t.position] })],
);

export const clientWorkoutSets = pgTable(
  'client_workout_sets',
  {
    workoutId: text('workout_id').notNull(),
    exercisePosition: integer('exercise_position').notNull(),
    setIndex: integer('set_index').notNull(),
    plannedReps: integer('planned_reps'),
    plannedWeightKg: doublePrecision('planned_weight_kg'),
    plannedTimeSec: integer('planned_time_sec'),
    plannedRestSec: integer('planned_rest_sec'),
    actualReps: integer('actual_reps'),
    actualWeightKg: doublePrecision('actual_weight_kg'),
    actualTimeSec: integer('actual_time_sec'),
    done: integer('done').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.workoutId, t.exercisePosition, t.setIndex] }),
    foreignKey({
      columns: [t.workoutId, t.exercisePosition],
      foreignColumns: [clientWorkoutExercises.workoutId, clientWorkoutExercises.position],
    }).onDelete('cascade'),
  ],
);

// Занятие-календарь тренера (НЕ путать с sessions_auth — это календарь, не аутентификация).
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    workoutId: text('workout_id').references(() => clientWorkouts.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // YYYY-MM-DD
    startTime: text('start_time').notNull(), // HH:MM
    durationMin: integer('duration_min').notNull().default(60),
    location: text('location'),
    title: text('title'),
    status: text('status')
      .$type<'planned' | 'completed' | 'cancelled'>()
      .notNull()
      .default('planned'),
    isOnline: integer('is_online').notNull().default(0),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sessions_trainer_date').on(t.trainerId, t.date),
    check('sessions_status_chk', sql`${t.status} IN ('planned', 'completed', 'cancelled')`),
  ],
);

// Пакет оплаченных тренировок клиента (вложен под клиента, scoped по тренеру).
export const paymentPackages = pgTable(
  'payment_packages',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    lessonsPaid: integer('lessons_paid').notNull(),
    pricePerLesson: doublePrecision('price_per_lesson').notNull(),
    totalPaid: doublePrecision('total_paid').notNull(),
    workoutType: text('workout_type'),
    startsAt: text('starts_at').notNull(), // YYYY-MM-DD
    status: text('status').$type<'active' | 'closed' | 'cancelled'>().notNull().default('active'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_payment_packages_trainer_client').on(t.trainerId, t.clientId),
    check('payment_packages_status_chk', sql`${t.status} IN ('active', 'closed', 'cancelled')`),
  ],
);

// Зал/площадка тренера (для привязки расходов на аренду и т.п.).
export const gyms = pgTable('gyms', {
  id: text('id').primaryKey(),
  trainerId: text('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  monthlyRent: doublePrecision('monthly_rent'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Расход тренера. gymId/clientId — опциональные привязки (FK set null при удалении связанного).
export const expenses = pgTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    amount: doublePrecision('amount').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    gymId: text('gym_id').references(() => gyms.id, { onDelete: 'set null' }),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_expenses_trainer_date').on(t.trainerId, t.date)],
);

// Доход тренера.
export const incomes = pgTable(
  'incomes',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    amount: doublePrecision('amount').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_incomes_trainer_date').on(t.trainerId, t.date)],
);

// Замер тела клиента (вложен под клиента, scoped по тренеру). Все метрики опциональны.
export const measurements = pgTable(
  'measurements',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    weightKg: doublePrecision('weight_kg'),
    bodyFatPct: doublePrecision('body_fat_pct'),
    chestCm: doublePrecision('chest_cm'),
    waistCm: doublePrecision('waist_cm'),
    hipsCm: doublePrecision('hips_cm'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_measurements_trainer_client_date').on(t.trainerId, t.clientId, t.date)],
);

// Загруженный файл (приватный). Раздаётся только владельцу-тренеру через GET /api/files/:id.
// clientId опционален: файл может быть привязан к клиенту (фото/медкарта) либо нет.
// storagePath — относительный путь от UPLOADS_DIR (<trainerId>/<clientId|'_'>/<id>.<ext>).
export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storagePath: text('storage_path').notNull(),
    originalName: text('original_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_files_trainer').on(t.trainerId)],
);

// Фото прогресса клиента (вложено под клиента, scoped по тренеру). Ссылается на files.
// angle — ракурс съёмки (фронт/бок/спина); date — YYYY-MM-DD; note опционален.
export const progressPhotos = pgTable(
  'progress_photos',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    angle: text('angle').$type<'front' | 'side' | 'back'>().notNull(),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_progress_photos_trainer_client_date').on(t.trainerId, t.clientId, t.date),
    check('progress_photos_angle_chk', sql`${t.angle} IN ('front', 'side', 'back')`),
  ],
);

// Диалог тренера с клиентом (1 на пару). lastMessageAt — для сортировки списка диалогов;
// trainerLastReadAt — отметка прочтения тренером. UNIQUE (trainerId, clientId) — getOrCreate.
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    trainerLastReadAt: timestamp('trainer_last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('conversations_trainer_client_uq').on(t.trainerId, t.clientId)],
);

// Сообщение диалога. senderRole фиксируется как 'trainer' в этой фазе; колонка расширяема.
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderRole: text('sender_role').$type<'trainer' | 'client'>().notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_messages_conversation_created').on(t.conversationId, t.createdAt),
    check('messages_sender_role_chk', sql`${t.senderRole} IN ('trainer', 'client')`),
  ],
);

// Медкарта клиента (вложена под клиента, scoped по тренеру). Файл опционален:
// fileId nullable, FK→files set null (удаление файла не сносит запись медкарты).
// date — YYYY-MM-DD; note обязателен.
export const medicalRecords = pgTable(
  'medical_records',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    note: text('note').notNull(),
    fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_medical_records_trainer_client_date').on(t.trainerId, t.clientId, t.date)],
);
