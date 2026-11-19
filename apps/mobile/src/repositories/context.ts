import type { Actor, AppSettings } from '@gen/shared';
import type { Db } from '../db/types';
import type { ChangeBus } from './events';

export interface CurrentActor extends Actor {
  name: string;
}

export interface RepoContext {
  db: Db;
  deviceId: string;
  now: () => number;
  /** Поточний користувач (null — ніхто не увійшов) */
  actor: () => CurrentActor | null;
  settings: () => AppSettings;
  bus: ChangeBus;
}
