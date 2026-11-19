import {
  parseSettings,
  SETTING_IDS,
  SETTINGS_SCHEMA,
  type AppSettings,
  type Setting,
  type SettingsKey,
} from '@gen/shared';
import { eq } from 'drizzle-orm';
import { settings } from '../db/schema';
import type { Db } from '../db/types';
import { assertCan, getById, insertEntity, requireActor, updateEntity } from './base';
import type { RepoContext } from './context';
import { RepoError } from './errors';

/** Читає налаштування напряму з БД (без контексту — потрібно ще до створення репозиторіїв). */
export function readSettings(db: Db): AppSettings {
  return parseSettings(db.select().from(settings).all() as Setting[]);
}

export function settingsRepo(ctx: RepoContext) {
  return {
    get: () => readSettings(ctx.db),
    set<K extends SettingsKey>(key: K, value: AppSettings[K]): void {
      const actor = requireActor(ctx);
      const parsed = SETTINGS_SCHEMA[key].safeParse(value);
      if (!parsed.success) throw new RepoError('validation', parsed.error.issues[0]?.message ?? 'Некоректне значення');
      const valueJson = JSON.stringify(parsed.data);
      ctx.db.transaction((tx) => {
        const before =
          getById(tx, 'settings', SETTING_IDS[key]) ??
          (tx.select().from(settings).where(eq(settings.key, key)).get() as Setting | undefined);
        assertCan(ctx, actor, before ? 'update' : 'create', 'settings', before ?? null);
        if (before) updateEntity(ctx, tx, 'settings', before, { valueJson, deletedAt: null } as never, actor.id);
        else insertEntity(ctx, tx, 'settings', { key, valueJson }, actor.id, { id: SETTING_IDS[key] });
      });
      ctx.bus.emit(['settings', 'auditLog']);
    },
  };
}
