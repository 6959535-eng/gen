import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Синхронна Drizzle-БД. На телефоні — expo-sqlite, у тестах — better-sqlite3.
 * Репозиторії залежать лише від цього типу.
 */
export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
