import { z } from 'zod';

/**
 * Синхронізовані налаштування команди. Кожен ключ має фіксований UUID,
 * щоб два телефони, які створили налаштування незалежно, мали один і той самий запис
 * (інакше після злиття вийшли б дублікати).
 */
export const SETTINGS_SCHEMA = {
  /** Поріг відхилення фактичної витрати від норми, % */
  deviationThresholdPct: z.number().min(1).max(100),
  /** Автоблокування після бездіяльності, хв */
  autoLockMinutes: z.number().int().min(1).max(120),
  /** Попередження про ТО, коли лишилося менше N % інтервалу */
  serviceWarnPct: z.number().min(1).max(50),
  /** Нагадування про ручну резервну копію, днів */
  backupReminderDays: z.number().int().min(1).max(60),
  /** Скільки годин оператор може редагувати/видаляти свої записи */
  operatorEditHours: z.number().int().min(1).max(168),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMA;
export type AppSettings = { [K in SettingsKey]: z.infer<(typeof SETTINGS_SCHEMA)[K]> };

export const DEFAULT_SETTINGS: AppSettings = {
  deviationThresholdPct: 15,
  autoLockMinutes: 5,
  serviceWarnPct: 10,
  backupReminderDays: 7,
  operatorEditHours: 24,
};

/** Фіксовані id записів налаштувань (UUIDv7-формат, згенеровані один раз). */
export const SETTING_IDS: Record<SettingsKey, string> = {
  deviationThresholdPct: '01900000-0000-7000-8000-000000000101',
  autoLockMinutes: '01900000-0000-7000-8000-000000000102',
  serviceWarnPct: '01900000-0000-7000-8000-000000000103',
  backupReminderDays: '01900000-0000-7000-8000-000000000104',
  operatorEditHours: '01900000-0000-7000-8000-000000000105',
};

/** Фіксовані id типів пального за замовчуванням — з тієї ж причини. */
export const DEFAULT_FUEL_TYPES = [
  { id: '01900000-0000-7000-8000-000000000201', code: 'A92', name: 'Бензин А-92' },
  { id: '01900000-0000-7000-8000-000000000202', code: 'A95', name: 'Бензин А-95' },
  { id: '01900000-0000-7000-8000-000000000203', code: 'DT', name: 'Дизель' },
] as const;

/** Службовий id «системи» — автор записів за замовчуванням. */
export const SYSTEM_ID = '01900000-0000-7000-8000-000000000001';

export function parseSettings(rows: { key: string; valueJson: string; deletedAt: number | null }[]): AppSettings {
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.deletedAt !== null || !(r.key in SETTINGS_SCHEMA)) continue;
    const k = r.key as SettingsKey;
    try {
      const parsed = SETTINGS_SCHEMA[k].safeParse(JSON.parse(r.valueJson));
      if (parsed.success) (out as Record<string, unknown>)[k] = parsed.data;
    } catch {
      /* ігноруємо зіпсоване значення — лишається за замовчуванням */
    }
  }
  return out;
}

export const SETTING_LABELS: Record<SettingsKey, string> = {
  deviationThresholdPct: 'Поріг відхилення витрати, %',
  autoLockMinutes: 'Автоблокування, хв',
  serviceWarnPct: 'Попередження про ТО, %',
  backupReminderDays: 'Нагадування про резервну копію, дн',
  operatorEditHours: 'Оператор змінює свої записи, год',
};
