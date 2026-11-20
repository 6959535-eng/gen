import {
  DEFAULT_FUEL_TYPES,
  DEFAULT_SETTINGS,
  SETTING_IDS,
  SYSTEM_ID,
  uuidv7,
  type SettingsKey,
} from '@gen/shared';
import { eq } from 'drizzle-orm';
import { fuelTypes, localMeta, settings } from '../db/schema';
import type { Db, DbOrTx } from '../db/types';

/** Фіксований момент для записів «за замовчуванням» — однаковий на всіх телефонах. */
const DEFAULTS_EPOCH = Date.UTC(2025, 0, 1);

export type LocalMetaKey =
  | 'device_id'
  | 'last_manual_backup_at'
  | 'last_auto_backup_at'
  | 'last_import_at'
  | 'setup_completed'
  // синхронізація з сервером
  | 'server_url'
  | 'server_id'
  | 'server_cursor'
  | 'server_needs_snapshot'
  | 'last_sync_at'
  | 'last_sync_error';

export function getLocalMeta(db: DbOrTx, key: LocalMetaKey): string | null {
  return db.select().from(localMeta).where(eq(localMeta.key, key)).get()?.value ?? null;
}

export function setLocalMeta(db: DbOrTx, key: LocalMetaKey, value: string) {
  db.insert(localMeta).values({ key, value }).onConflictDoUpdate({ target: localMeta.key, set: { value } }).run();
}

/** device_id створюється один раз при першому запуску й більше не змінюється. */
export function ensureDeviceId(db: Db, now = Date.now()): string {
  const existing = getLocalMeta(db, 'device_id');
  if (existing) return existing;
  const id = uuidv7(now);
  setLocalMeta(db, 'device_id', id);
  return id;
}

/**
 * Записи за замовчуванням (типи пального, налаштування) мають фіксовані id, час і «автора»,
 * тож на всіх телефонах вони побайтово однакові й при злитті не дають ні дублів, ні конфліктів.
 * Не пишуться в outbox — це не дія користувача.
 */
export function ensureDefaults(db: Db) {
  const meta = {
    createdAt: DEFAULTS_EPOCH,
    updatedAt: DEFAULTS_EPOCH,
    deletedAt: null,
    authorId: SYSTEM_ID,
    deviceId: SYSTEM_ID,
    version: 1,
  };
  db.transaction((tx) => {
    for (const ft of DEFAULT_FUEL_TYPES) {
      tx.insert(fuelTypes)
        .values({ ...meta, id: ft.id, code: ft.code, name: ft.name, isActive: true })
        .onConflictDoNothing()
        .run();
    }
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingsKey[]) {
      tx.insert(settings)
        .values({ ...meta, id: SETTING_IDS[key], key, valueJson: JSON.stringify(DEFAULT_SETTINGS[key]) })
        .onConflictDoNothing()
        .run();
    }
  });
}
