/**
 * Підключення до SQLite на телефоні та безпечне застосування міграцій.
 * Це єдине місце в додатку, яке знає про expo-sqlite.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseSync } from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import type { Db } from './types';

export const DB_NAME = 'generators.db';
const KEEP_PRE_MIGRATION_COPIES = 3;

function appliedMigrationsCount(sqlite: ReturnType<typeof openDatabaseSync>): number {
  try {
    const row = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM __drizzle_migrations');
    return row?.n ?? 0;
  } catch {
    return 0; // таблиці ще немає — свіжа база
  }
}

/** Знімок файла БД перед міграцією — щоб оновлення APK ніколи не втратило дані. */
function snapshotBeforeMigration(sqlite: ReturnType<typeof openDatabaseSync>) {
  const dir = new Directory(Paths.document, 'db-pre-migration');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${DB_NAME}.${Date.now()}.bak`);
  file.write(sqlite.serializeSync());
  const copies = dir
    .list()
    .filter((f): f is File => f instanceof File)
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  for (const old of copies.slice(KEEP_PRE_MIGRATION_COPIES)) old.delete();
}

export async function openAppDatabase(): Promise<Db> {
  const sqlite = openDatabaseSync(DB_NAME);
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  const db = drizzle(sqlite, { schema });

  const applied = appliedMigrationsCount(sqlite);
  const pending = migrations.journal.entries.length - applied;
  if (applied > 0 && pending > 0) snapshotBeforeMigration(sqlite);
  // migrate() виконує всі нові міграції в транзакції; при помилці база лишається як була.
  await migrate(db, migrations);
  return db as unknown as Db;
}
