import { z } from 'zod';
import { UUID_RE } from '../id/uuidv7';

/** Час — мс UTC. */
export const zTime = z.number().int().nonnegative();
export const zId = z.string().regex(UUID_RE, 'Невірний ідентифікатор');

/** Службові поля, які має кожна синхронізована сутність. */
export const metaShape = {
  id: zId,
  createdAt: zTime,
  updatedAt: zTime,
  deletedAt: zTime.nullable(),
  authorId: zId,
  deviceId: zId,
  version: z.number().int().positive(),
};
export const zMeta = z.object(metaShape);
export type Meta = z.infer<typeof zMeta>;
export const META_KEYS = Object.keys(metaShape) as (keyof Meta)[];

const zText = (max: number) => z.string().trim().max(max);
const zName = (max = 60) => z.string().trim().min(1, "Обов'язкове поле").max(max);

// ---------- Користувач ----------
export const ROLES = ['admin', 'operator'] as const;
export const zRole = z.enum(ROLES);
export type Role = z.infer<typeof zRole>;

export const userFields = {
  name: zName(40),
  role: zRole,
  /** hex; формат визначає pinAlgo */
  pinHash: z.string().min(16),
  pinSalt: z.string().min(16),
  /** напр. "pbkdf2-sha256:60000" */
  pinAlgo: z.string().min(1),
  isActive: z.boolean(),
};
export const zUser = z.object({ ...metaShape, ...userFields });
export type User = z.infer<typeof zUser>;

// ---------- Тип пального ----------
export const fuelTypeFields = {
  code: z.string().trim().min(1).max(10),
  name: zName(30),
  isActive: z.boolean(),
};
export const zFuelType = z.object({ ...metaShape, ...fuelTypeFields });
export type FuelType = z.infer<typeof zFuelType>;

// ---------- Генератор ----------
export const GENERATOR_STATUSES = ['active', 'reserve', 'repair', 'decommissioned'] as const;
export const zGeneratorStatus = z.enum(GENERATOR_STATUSES);
export type GeneratorStatus = z.infer<typeof zGeneratorStatus>;

export const generatorFields = {
  name: zName(40),
  inventoryNo: zText(40),
  model: zText(60),
  /** Вати; null — невідомо */
  powerW: z.number().int().positive().nullable(),
  fuelTypeId: zId,
  tankMl: z.number().int().positive('Обʼєм бака має бути більше 0'),
  /** Нормативна витрата, мл/год */
  normMlPerH: z.number().int().positive('Норма витрати має бути більше 0'),
  /** Мотогодини (у хвилинах) на момент внесення генератора в облік */
  initialHoursMin: z.number().int().nonnegative(),
  /** Інтервал ТО у хвилинах мотогодин */
  serviceIntervalMin: z.number().int().positive(),
  status: zGeneratorStatus,
  responsible: zText(60),
  note: zText(500),
};
export const zGenerator = z.object({ ...metaShape, ...generatorFields });
export type Generator = z.infer<typeof zGenerator>;

// ---------- Сесія роботи ----------
/**
 * Час початку обов'язковий (кнопка «Запуск» ставить «зараз»).
 * Якщо внесено обидва показники лічильника — мотогодини сесії = різниця показників,
 * інакше — тривалість за часом.
 */
export const workSessionFields = {
  generatorId: zId,
  startedAt: zTime,
  endedAt: zTime.nullable(),
  startMeterMin: z.number().int().nonnegative().nullable(),
  endMeterMin: z.number().int().nonnegative().nullable(),
  note: zText(500),
};
export const zWorkSession = z.object({ ...metaShape, ...workSessionFields });
export type WorkSession = z.infer<typeof zWorkSession>;

// ---------- Заправка ----------
export const REFUEL_SOURCES = ['warehouse', 'canister', 'other'] as const;
export const zRefuelSource = z.enum(REFUEL_SOURCES);
export type RefuelSource = z.infer<typeof zRefuelSource>;

export const refuelFields = {
  generatorId: zId,
  /** Знімок типу пального генератора на момент заправки (для обліку складу) */
  fuelTypeId: zId,
  at: zTime,
  volumeMl: z.number().int().positive('Кількість літрів має бути більше 0'),
  isFull: z.boolean(),
  source: zRefuelSource,
  meterMin: z.number().int().nonnegative().nullable(),
  note: zText(500),
};
export const zRefuel = z.object({ ...metaShape, ...refuelFields });
export type Refuel = z.infer<typeof zRefuel>;

// ---------- Надходження пального на склад ----------
export const fuelReceiptFields = {
  at: zTime,
  fuelTypeId: zId,
  volumeMl: z.number().int().positive('Кількість літрів має бути більше 0'),
  supplier: zText(80),
  note: zText(500),
};
export const zFuelReceipt = z.object({ ...metaShape, ...fuelReceiptFields });
export type FuelReceipt = z.infer<typeof zFuelReceipt>;

// ---------- Обслуговування ----------
export const MAINTENANCE_KINDS = ['oil', 'filters', 'plugs', 'repair', 'other'] as const;
export const zMaintenanceKind = z.enum(MAINTENANCE_KINDS);
export type MaintenanceKind = z.infer<typeof zMaintenanceKind>;

export const maintenanceFields = {
  generatorId: zId,
  at: zTime,
  meterMin: z.number().int().nonnegative(),
  kind: zMaintenanceKind,
  /** Чи скидає лічильник «до наступного ТО» (планове ТО — так, ремонт — зазвичай ні) */
  resetsInterval: z.boolean(),
  description: zText(500),
  performedBy: zText(60),
};
export const zMaintenance = z.object({ ...metaShape, ...maintenanceFields });
export type Maintenance = z.infer<typeof zMaintenance>;

// ---------- Налаштування ----------
export const settingFields = {
  key: z.string().min(1).max(60),
  valueJson: z.string().max(10_000),
};
export const zSetting = z.object({ ...metaShape, ...settingFields });
export type Setting = z.infer<typeof zSetting>;

// ---------- Журнал змін ----------
export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'import_conflict', 'import', 'restore'] as const;
export const zAuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof zAuditAction>;

export const auditFields = {
  at: zTime,
  action: zAuditAction,
  entity: z.string().min(1).max(40),
  entityId: z.string().max(40),
  beforeJson: z.string().nullable(),
  afterJson: z.string().nullable(),
  note: zText(1000),
};
export const zAuditEntry = z.object({ ...metaShape, ...auditFields });
export type AuditEntry = z.infer<typeof zAuditEntry>;

// ---------- Реєстр таблиць ----------
export const ENTITY_SCHEMAS = {
  users: zUser,
  fuelTypes: zFuelType,
  generators: zGenerator,
  workSessions: zWorkSession,
  refuels: zRefuel,
  fuelReceipts: zFuelReceipt,
  maintenance: zMaintenance,
  settings: zSetting,
  auditLog: zAuditEntry,
} as const;

export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

export interface EntityMap {
  users: User;
  fuelTypes: FuelType;
  generators: Generator;
  workSessions: WorkSession;
  refuels: Refuel;
  fuelReceipts: FuelReceipt;
  maintenance: Maintenance;
  settings: Setting;
  auditLog: AuditEntry;
}

/** Повний набір даних (знімок бази без локальних таблиць). */
export type Dataset = { [K in EntityName]: EntityMap[K][] };

export function emptyDataset(): Dataset {
  return Object.fromEntries(ENTITY_NAMES.map((n) => [n, []])) as unknown as Dataset;
}

/** Українські назви сутностей для журналу. */
export const ENTITY_LABELS: Record<EntityName, string> = {
  users: 'Профіль',
  fuelTypes: 'Тип пального',
  generators: 'Генератор',
  workSessions: 'Сесія роботи',
  refuels: 'Заправка',
  fuelReceipts: 'Надходження пального',
  maintenance: 'Обслуговування',
  settings: 'Налаштування',
  auditLog: 'Журнал',
};

export const LABELS = {
  role: { admin: 'Адмін', operator: 'Оператор' } satisfies Record<Role, string>,
  generatorStatus: {
    active: 'В роботі',
    reserve: 'В резерві',
    repair: 'В ремонті',
    decommissioned: 'Списаний',
  } satisfies Record<GeneratorStatus, string>,
  refuelSource: { warehouse: 'Склад', canister: 'Каністра', other: 'Інше' } satisfies Record<RefuelSource, string>,
  maintenanceKind: {
    oil: 'Заміна масла',
    filters: 'Заміна фільтрів',
    plugs: 'Заміна свічок',
    repair: 'Ремонт',
    other: 'Інше',
  } satisfies Record<MaintenanceKind, string>,
  auditAction: {
    create: 'Створено',
    update: 'Змінено',
    delete: 'Видалено',
    import_conflict: 'Конфлікт імпорту',
    import: 'Імпорт',
    restore: 'Відновлення',
  } satisfies Record<AuditAction, string>,
};
