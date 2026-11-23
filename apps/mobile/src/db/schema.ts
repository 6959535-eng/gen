/**
 * Схема локальної БД (SQLite, Drizzle).
 * Імена властивостей у TS збігаються з полями zod-схем із @gen/shared — рядок з БД
 * без перетворень є сутністю. Колонки в SQLite — snake_case.
 *
 * Зовнішніх ключів (FOREIGN KEY) свідомо немає: при злитті файлів записи можуть
 * надходити в довільному порядку; цілісність перевіряє checkIntegrity().
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const meta = () => ({
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  authorId: text('author_id').notNull(),
  deviceId: text('device_id').notNull(),
  version: integer('version').notNull().default(1),
});
const bool = (name: string) => integer(name, { mode: 'boolean' }).notNull();

// ---------- Синхронізовані таблиці ----------

export const users = sqliteTable('users', {
  ...meta(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'operator'] }).notNull(),
  pinHash: text('pin_hash').notNull(),
  pinSalt: text('pin_salt').notNull(),
  pinAlgo: text('pin_algo').notNull(),
  isActive: bool('is_active'),
});

export const fuelTypes = sqliteTable('fuel_types', {
  ...meta(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isActive: bool('is_active'),
});

export const generators = sqliteTable('generators', {
  ...meta(),
  name: text('name').notNull(),
  inventoryNo: text('inventory_no').notNull().default(''),
  model: text('model').notNull().default(''),
  powerW: integer('power_w'),
  fuelTypeId: text('fuel_type_id').notNull(),
  tankMl: integer('tank_ml').notNull(),
  normMlPerH: integer('norm_ml_per_h').notNull(),
  initialHoursMin: integer('initial_hours_min').notNull().default(0),
  serviceIntervalMin: integer('service_interval_min').notNull(),
  status: text('status', { enum: ['active', 'reserve', 'repair', 'decommissioned'] }).notNull(),
  responsible: text('responsible').notNull().default(''),
  note: text('note').notNull().default(''),
});

export const workSessions = sqliteTable(
  'work_sessions',
  {
    ...meta(),
    generatorId: text('generator_id').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    startMeterMin: integer('start_meter_min'),
    endMeterMin: integer('end_meter_min'),
    note: text('note').notNull().default(''),
  },
  (t) => [index('work_sessions_gen_idx').on(t.generatorId, t.startedAt)],
);

export const refuels = sqliteTable(
  'refuels',
  {
    ...meta(),
    generatorId: text('generator_id').notNull(),
    fuelTypeId: text('fuel_type_id').notNull(),
    at: integer('at').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    isFull: bool('is_full'),
    source: text('source', { enum: ['warehouse', 'canister', 'other'] }).notNull(),
    meterMin: integer('meter_min'),
    note: text('note').notNull().default(''),
  },
  (t) => [index('refuels_gen_idx').on(t.generatorId, t.at)],
);

export const fuelReceipts = sqliteTable(
  'fuel_receipts',
  {
    ...meta(),
    at: integer('at').notNull(),
    fuelTypeId: text('fuel_type_id').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    supplier: text('supplier').notNull().default(''),
    note: text('note').notNull().default(''),
  },
  (t) => [index('fuel_receipts_at_idx').on(t.at)],
);

/** Видача пального зі складу (склад ведеться окремо від заправок генераторів). */
export const fuelIssues = sqliteTable(
  'fuel_issues',
  {
    ...meta(),
    at: integer('at').notNull(),
    fuelTypeId: text('fuel_type_id').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    recipient: text('recipient').notNull().default(''),
    note: text('note').notNull().default(''),
  },
  (t) => [index('fuel_issues_at_idx').on(t.at)],
);

/** Інвентаризація: фактичний залишок на складі після вимірювання. */
export const fuelInventories = sqliteTable(
  'fuel_inventories',
  {
    ...meta(),
    at: integer('at').notNull(),
    fuelTypeId: text('fuel_type_id').notNull(),
    actualMl: integer('actual_ml').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [index('fuel_inventories_at_idx').on(t.at)],
);

export const maintenance = sqliteTable(
  'maintenance',
  {
    ...meta(),
    generatorId: text('generator_id').notNull(),
    at: integer('at').notNull(),
    meterMin: integer('meter_min').notNull(),
    kind: text('kind', { enum: ['oil', 'filters', 'plugs', 'repair', 'other'] }).notNull(),
    resetsInterval: bool('resets_interval'),
    description: text('description').notNull().default(''),
    performedBy: text('performed_by').notNull().default(''),
  },
  (t) => [index('maintenance_gen_idx').on(t.generatorId, t.at)],
);

export const settings = sqliteTable(
  'settings',
  {
    ...meta(),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
  },
  (t) => [uniqueIndex('settings_key_idx').on(t.key)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    ...meta(),
    at: integer('at').notNull(),
    action: text('action', {
      enum: ['create', 'update', 'delete', 'import_conflict', 'import', 'restore'],
    }).notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    note: text('note').notNull().default(''),
  },
  (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_entity_idx').on(t.entity, t.entityId)],
);

// ---------- Локальні таблиці (не експортуються) ----------

/**
 * Черга змін для майбутньої синхронізації з сервером.
 * Кожна локальна зміна (create/update/delete) пишеться сюди в тій самій транзакції.
 * synced_at заповнить модуль синхронізації після підтвердження сервером.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(), // UUIDv7 — монотонний, тож це ще й порядок
    op: text('op', { enum: ['insert', 'update', 'delete'] }).notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    payloadJson: text('payload_json').notNull(),
    at: integer('at').notNull(),
    authorId: text('author_id').notNull(),
    deviceId: text('device_id').notNull(),
    syncedAt: integer('synced_at'),
    /** Причина, з якої сервер відхилив зміну (показується адміну) */
    syncError: text('sync_error'),
  },
  (t) => [index('outbox_unsynced_idx').on(t.syncedAt, t.id)],
);

/** Ключ-значення пристрою: device_id, дати бекапів тощо. */
export const localMeta = sqliteTable('local_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Лічильники невірних PIN — лише на цьому телефоні. */
export const authState = sqliteTable('auth_state', {
  userId: text('user_id').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  lockUntil: integer('lock_until'),
  lockLevel: integer('lock_level').notNull().default(0),
});

/** Реєстр синхронізованих таблиць за іменем сутності з @gen/shared. */
export const TABLES = {
  users,
  fuelTypes,
  generators,
  workSessions,
  refuels,
  fuelReceipts,
  fuelIssues,
  fuelInventories,
  maintenance,
  settings,
  auditLog,
} as const;
