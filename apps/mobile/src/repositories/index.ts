import type { AppSettings } from '@gen/shared';
import type { Db } from '../db/types';
import { auditRepo } from './audit';
import type { CurrentActor, RepoContext } from './context';
import { dataRepo } from './data';
import { ensureDefaults, ensureDeviceId, getLocalMeta, setLocalMeta } from './device';
import { ChangeBus } from './events';
import { fuelRepo } from './fuel';
import { generatorsRepo } from './generators';
import { maintenanceRepo } from './maintenance';
import { refuelsRepo } from './refuels';
import { readSettings, settingsRepo } from './settings';
import { usersRepo } from './users';
import { workSessionsRepo } from './workSessions';

export interface RepositoriesOptions {
  now?: () => number;
  /** Звідки брати поточного користувача (стан сесії в UI) */
  actor: () => CurrentActor | null;
}

/**
 * Єдина точка доступу до даних. UI працює лише з цим обʼєктом і не знає про SQLite.
 * Пізніше сюди додасться модуль синхронізації, який читатиме outbox.
 */
export function createRepositories(db: Db, opts: RepositoriesOptions) {
  const now = opts.now ?? Date.now;
  const deviceId = ensureDeviceId(db, now());
  ensureDefaults(db);
  const bus = new ChangeBus();

  let cachedSettings: AppSettings | null = null;
  bus.subscribe((e) => {
    if (e.has('settings')) cachedSettings = null;
  });

  const ctx: RepoContext = {
    db,
    deviceId,
    now,
    actor: opts.actor,
    settings: () => (cachedSettings ??= readSettings(db)),
    bus,
  };

  return {
    deviceId,
    bus,
    users: usersRepo(ctx),
    generators: generatorsRepo(ctx),
    sessions: workSessionsRepo(ctx),
    refuels: refuelsRepo(ctx),
    maintenance: maintenanceRepo(ctx),
    fuel: fuelRepo(ctx),
    settings: settingsRepo(ctx),
    audit: auditRepo(ctx),
    data: dataRepo(ctx),
    local: {
      get: (k: Parameters<typeof getLocalMeta>[1]) => getLocalMeta(db, k),
      set: (k: Parameters<typeof setLocalMeta>[1], v: string) => {
        setLocalMeta(db, k, v);
        bus.emit(['local']);
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export { RepoError } from './errors';
export type { CurrentActor } from './context';
