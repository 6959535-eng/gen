/**
 * Синхронізація телефон ↔ сервер. Без привʼязки до платформи: HTTP-транспорт і сховище токена
 * передаються ззовні, тож у тестах телефон говорить із сервером напряму (fastify.inject).
 *
 * Цикл: [повний знімок, якщо потрібно] → push outbox порціями → pull за курсором до кінця.
 */
import {
  ENTITY_NAMES,
  type EntityName,
  type PairResponse,
  type PullResponse,
  type PushChange,
  type PushResponse,
} from '@gen/shared';
import type { Repositories } from '../repositories';
import type { SecretStore } from './backupCore';

export interface HttpResponse {
  status: number;
  json: unknown;
}
export type Transport = (req: {
  method: 'GET' | 'POST';
  url: string;
  token?: string;
  body?: unknown;
}) => Promise<HttpResponse>;

export class SyncError extends Error {
  constructor(
    public kind: 'offline' | 'auth' | 'revoked' | 'server' | 'config',
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

const TOKEN_KEY = 'server_device_token';
const PUSH_BATCH = 200;
const SNAPSHOT_BATCH = 500;

export interface SyncDeps {
  repos: Repositories;
  secrets: SecretStore;
  transport: Transport;
  /** Поточний користувач (для повного знімка потрібен адмін) */
  actorId: () => string | null;
  now?: () => number;
}

export interface SyncResult {
  pushed: number;
  rejected: { entity: string; id: string; reason: string }[];
  pulled: number;
  snapshotSent: boolean;
}

/** Нормалізація адреси: https://… без кінцевого «/». Порожній протокол — https. */
export function normalizeServerUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, '');
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(parsed.hostname)) {
      throw new SyncError('config', 'Потрібна адреса з https://');
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('config', 'Некоректна адреса сервера');
  }
}

export function serverConfig(repos: Repositories) {
  return {
    url: repos.local.get('server_url'),
    cursor: Number(repos.local.get('server_cursor') ?? 0),
    lastSyncAt: Number(repos.local.get('last_sync_at') ?? 0) || null,
    lastError: repos.local.get('last_sync_error') || null,
    needsSnapshot: repos.local.get('server_needs_snapshot') === '1',
  };
}

async function call<T>(d: SyncDeps, method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> {
  const url = d.repos.local.get('server_url');
  if (!url) throw new SyncError('config', 'Сервер не налаштовано');
  const token = auth ? await d.secrets.get(TOKEN_KEY) : undefined;
  if (auth && !token) throw new SyncError('auth', 'Телефон не підключено до сервера');
  let res: HttpResponse;
  try {
    res = await d.transport({ method, url: url + path, token: token ?? undefined, body });
  } catch {
    throw new SyncError('offline', 'Немає звʼязку з сервером');
  }
  const msg = (res.json as { error?: string } | null)?.error;
  if (res.status === 401) throw new SyncError('auth', msg ?? 'Телефон не підключено до сервера');
  if (res.status === 403 && auth) throw new SyncError('revoked', msg ?? 'Доступ відкликано');
  if (res.status >= 400) throw new SyncError('server', msg ?? `Помилка сервера (${res.status})`);
  return res.json as T;
}

/**
 * Підключення телефона до сервера кодом (код налаштування — для першого телефона адміна,
 * одноразовий код — для інших). Після цього: адмін на непорожньому телефоні надсилає повний знімок.
 */
export async function pairDevice(
  d: SyncDeps,
  serverUrl: string,
  code: string,
  deviceName: string,
): Promise<PairResponse> {
  const url = normalizeServerUrl(serverUrl);
  d.repos.local.set('server_url', url);
  try {
    const res = await call<PairResponse>(
      d,
      'POST',
      '/api/v1/pair',
      { code, deviceId: d.repos.deviceId, deviceName, actorId: d.actorId() ?? undefined },
      false,
    );
    await d.secrets.set(TOKEN_KEY, res.deviceToken);
    d.repos.local.set('server_id', res.serverId);
    d.repos.local.set('server_cursor', '0');
    // Дані, що вже є на телефоні, мають потрапити на сервер — повним знімком.
    d.repos.local.set('server_needs_snapshot', d.repos.users.hasAny() ? '1' : '0');
    d.repos.local.set('last_sync_error', '');
    return res;
  } catch (e) {
    d.repos.local.set('server_url', '');
    throw e;
  }
}

export async function disconnect(d: Pick<SyncDeps, 'repos' | 'secrets'>) {
  await d.secrets.remove(TOKEN_KEY);
  for (const k of ['server_url', 'server_id', 'server_cursor', 'server_needs_snapshot', 'last_sync_error'] as const) {
    d.repos.local.set(k, '');
  }
}

export const isConnected = (repos: Repositories) => !!repos.local.get('server_url');

/** Повний знімок усіх записів (при підключенні та після імпорту / відновлення з файла). */
async function pushSnapshot(d: SyncDeps, actorId: string): Promise<void> {
  const snap = d.repos.data.snapshot();
  const all: PushChange[] = [];
  for (const n of ENTITY_NAMES) {
    for (const row of snap[n] as unknown as Record<string, unknown>[]) {
      all.push({ opId: `s:${n}:${row.id as string}`, entity: n, actorId, row });
    }
  }
  for (let i = 0; i < all.length; i += SNAPSHOT_BATCH) {
    await call<PushResponse>(d, 'POST', '/api/v1/sync/push', {
      mode: 'snapshot',
      actorId,
      changes: all.slice(i, i + SNAPSHOT_BATCH),
    });
  }
}

let running: Promise<SyncResult> | null = null;

/** Один цикл синхронізації. Паралельні виклики обʼєднуються в один. */
export function syncNow(d: SyncDeps): Promise<SyncResult> {
  if (running) return running;
  running = doSync(d).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(d: SyncDeps): Promise<SyncResult> {
  const now = d.now ?? Date.now;
  const result: SyncResult = { pushed: 0, rejected: [], pulled: 0, snapshotSent: false };
  try {
    // 1) Повний знімок, якщо потрібно (лише від адміна — сервер перевіряє)
    if (serverConfig(d.repos).needsSnapshot) {
      const actorId = d.actorId();
      const actor = actorId ? d.repos.users.get(actorId) : undefined;
      if (actor?.role === 'admin') {
        await pushSnapshot(d, actor.id);
        d.repos.local.set('server_needs_snapshot', '0');
        result.snapshotSent = true;
      }
    }

    // 2) Push: зміни з outbox порціями, у порядку створення
    for (;;) {
      const batch = d.repos.data.outbox.pending(PUSH_BATCH);
      if (!batch.length) break;
      const changes: PushChange[] = batch.map((o) => ({
        opId: o.id,
        entity: o.entity as EntityName,
        actorId: o.authorId,
        row: JSON.parse(o.payloadJson) as Record<string, unknown>,
      }));
      const res = await call<PushResponse>(d, 'POST', '/api/v1/sync/push', {
        mode: 'normal',
        actorId: d.actorId() ?? batch[0]!.authorId,
        changes,
      });
      const byOp = new Map(res.results.map((r) => [r.opId, r]));
      const marks: { id: string; error?: string }[] = [];
      for (const c of changes) {
        const r = byOp.get(c.opId);
        if (!r) continue;
        if (r.status === 'rejected') {
          result.rejected.push({ entity: c.entity, id: String(c.row.id), reason: r.reason ?? 'Відхилено' });
          // Відкотити запис до серверної версії, щоб телефон і сервер не розійшлися
          if (r.serverRow) d.repos.data.forceServerRow(c.entity, r.serverRow);
          marks.push({ id: c.opId, error: r.reason ?? 'Відхилено сервером' });
        } else {
          marks.push({ id: c.opId });
          result.pushed++;
        }
      }
      d.repos.data.outbox.markSynced(marks, now());
      if (marks.length < batch.length) break; // сервер відповів не на все — спробуємо наступного разу
    }

    // 3) Pull: усе нове після курсора
    let cursor = serverConfig(d.repos).cursor;
    for (;;) {
      const page = await call<PullResponse>(d, 'GET', `/api/v1/sync/pull?cursor=${cursor}&limit=1000`);
      if (page.changes.length) {
        const { applied } = d.repos.data.applyRemote(page.changes);
        result.pulled += applied;
      }
      cursor = page.nextCursor;
      d.repos.local.set('server_cursor', String(cursor));
      if (!page.hasMore) break;
    }

    d.repos.local.set('last_sync_at', String(now()));
    d.repos.local.set('last_sync_error', '');
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof SyncError && e.kind === 'offline')) d.repos.local.set('last_sync_error', msg);
    throw e;
  }
}

// ---------- Адмінські дії ----------

export async function createPairingCode(d: SyncDeps): Promise<{ code: string; expiresAt: number }> {
  return call(d, 'POST', '/api/v1/pairing-codes', { actorId: d.actorId() });
}

export async function listDevices(d: SyncDeps) {
  return call<{ devices: import('@gen/shared').DeviceInfo[]; currentDeviceId: string }>(d, 'POST', '/api/v1/devices/list', {
    actorId: d.actorId(),
  });
}

export async function revokeDevice(d: SyncDeps, deviceId: string) {
  return call<{ revoked: boolean }>(d, 'POST', '/api/v1/devices/revoke', { actorId: d.actorId(), deviceId });
}

/** Після імпорту / відновлення з файла: записи не проходили через outbox — надіслати повний знімок. */
export function markNeedsSnapshot(repos: Repositories) {
  if (!isConnected(repos)) return;
  repos.local.set('server_needs_snapshot', '1');
  // Локальні дані могли «відкотитися» (відновлення) — заново отримати все з сервера (LWW вирішить).
  repos.local.set('server_cursor', '0');
}
