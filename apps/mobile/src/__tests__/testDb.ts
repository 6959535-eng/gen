import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from '../db/schema';
import type { Db } from '../db/types';
import { createRepositories, type CurrentActor } from '../repositories';

export const MIGRATIONS = path.resolve(__dirname, '../../drizzle');

export function createTestDb(file = ':memory:') {
  const sqlite = new Database(file);
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  migrate(db as never, { migrationsFolder: MIGRATIONS });
  return { db, sqlite };
}

/** Репозиторії з керованим годинником і користувачем. */
export function createTestRepos(start = Date.UTC(2026, 10, 19, 10, 0)) {
  const { db, sqlite } = createTestDb();
  let now = start;
  let actor: CurrentActor | null = null;
  const repos = createRepositories(db, { now: () => now, actor: () => actor });
  return {
    db,
    sqlite,
    repos,
    setActor: (a: CurrentActor | null) => (actor = a),
    advance: (ms: number) => (now += ms),
    now: () => now,
  };
}
