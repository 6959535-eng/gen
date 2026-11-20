import Database from 'better-sqlite3';

export type Sqlite = Database.Database;

/**
 * Схема сервера. Записи всіх сутностей зберігаються однаково — як JSON із ключем (entity, id)
 * і монотонним seq (курсор для pull). Валідацію робить zod зі спільного пакета.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE records (
    entity     TEXT NOT NULL,
    id         TEXT NOT NULL,
    seq        INTEGER NOT NULL UNIQUE,
    updated_at INTEGER NOT NULL,
    device_id  TEXT NOT NULL,
    row_json   TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (entity, id)
  );
  CREATE INDEX records_seq_idx ON records(seq);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE devices (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at   INTEGER,
    paired_by    TEXT
  );
  CREATE TABLE pairing_codes (
    code_hash  TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    used_by_device TEXT
  );
  CREATE TABLE sync_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    actor_id  TEXT,
    entity    TEXT,
    entity_id TEXT,
    status    TEXT NOT NULL,
    reason    TEXT
  );
  CREATE INDEX sync_log_at_idx ON sync_log(at);
  `,
];

export function openDb(file: string): Sqlite {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Sqlite) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1;
    if (done.has(v)) return;
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v, Date.now());
    })();
  });
}

export function getMeta(db: Sqlite, key: string): string | null {
  return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
}
export function setMeta(db: Sqlite, key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
