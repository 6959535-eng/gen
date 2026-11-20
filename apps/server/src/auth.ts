import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DeviceInfo } from '@gen/shared';
import { getMeta, setMeta, type Sqlite } from './db';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

/** Коди підключення: 8 символів без схожих (0/O, 1/I/L), регістр не важливий. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(len = 8): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i]! % ALPHABET.length];
  return s;
}
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function serverId(db: Sqlite): string {
  let id = getMeta(db, 'server_id');
  if (!id) {
    id = randomBytes(8).toString('hex');
    setMeta(db, 'server_id', id);
  }
  return id;
}

export function deviceCount(db: Sqlite): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n;
}

/**
 * Код першого налаштування: створюється, поки немає жодного пристрою; показується в журналі сервера.
 * Повертає код у відкритому вигляді лише щойно створений (для виводу в лог).
 */
export function ensureSetupCode(db: Sqlite): string | null {
  if (deviceCount(db) > 0) return null;
  const code = newCode(10);
  setMeta(db, 'setup_code_hash', sha256(normalizeCode(code)));
  return code;
}

export function checkSetupCode(db: Sqlite, code: string): boolean {
  const h = getMeta(db, 'setup_code_hash');
  return !!h && deviceCount(db) === 0 && safeEqualHex(h, sha256(normalizeCode(code)));
}

export function registerDevice(db: Sqlite, id: string, name: string, pairedBy: string | null, now: number): string {
  const token = newToken();
  db.prepare(
    `INSERT INTO devices (id, name, token_hash, created_at, paired_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, token_hash = excluded.token_hash, revoked_at = NULL, paired_by = excluded.paired_by`,
  ).run(id, name, sha256(token), now, pairedBy);
  return token;
}

export function deviceByToken(db: Sqlite, token: string): { id: string; name: string; revoked_at: number | null } | null {
  const row = db.prepare('SELECT id, name, revoked_at FROM devices WHERE token_hash = ?').get(sha256(token)) as
    | { id: string; name: string; revoked_at: number | null }
    | undefined;
  return row ?? null;
}

export function touchDevice(db: Sqlite, id: string, now: number) {
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, id);
}

export function listDevices(db: Sqlite): DeviceInfo[] {
  return (
    db.prepare('SELECT id, name, created_at, last_seen_at, revoked_at FROM devices ORDER BY created_at').all() as {
      id: string;
      name: string;
      created_at: number;
      last_seen_at: number | null;
      revoked_at: number | null;
    }[]
  ).map((d) => ({ id: d.id, name: d.name, createdAt: d.created_at, lastSeenAt: d.last_seen_at, revokedAt: d.revoked_at }));
}

export function revokeDevice(db: Sqlite, id: string, now: number): boolean {
  return db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id).changes > 0;
}

export const PAIRING_TTL_MS = 15 * 60_000;

export function createPairingCode(db: Sqlite, createdBy: string, now: number): { code: string; expiresAt: number } {
  const code = newCode(8);
  const expiresAt = now + PAIRING_TTL_MS;
  db.prepare('INSERT INTO pairing_codes (code_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(normalizeCode(code)),
    createdBy,
    now,
    expiresAt,
  );
  return { code, expiresAt };
}

/** Використати код (одноразово). Повертає id адміна, що його створив, або null. */
export function consumePairingCode(db: Sqlite, code: string, deviceId: string, now: number): string | null {
  const h = sha256(normalizeCode(code));
  const row = db.prepare('SELECT created_by, expires_at, used_at FROM pairing_codes WHERE code_hash = ?').get(h) as
    | { created_by: string; expires_at: number; used_at: number | null }
    | undefined;
  if (!row || row.used_at !== null || row.expires_at < now) return null;
  db.prepare('UPDATE pairing_codes SET used_at = ?, used_by_device = ? WHERE code_hash = ?').run(now, deviceId, h);
  return row.created_by;
}

/** Просте обмеження спроб підбору кодів: не більше N невдач за вікно з однієї адреси. */
export class FailureLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max = 10,
    private windowMs = 15 * 60_000,
  ) {}
  blocked(key: string, now: number): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    return list.length >= this.max;
  }
  fail(key: string, now: number) {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    list.push(now);
    this.hits.set(key, list);
  }
}
