import {
  canStopSession,
  checkPermission,
  compareVersions,
  conflictAuditEntries,
  DAY,
  ENTITY_SCHEMAS,
  isConflict,
  parseSettings,
  SYSTEM_ID,
  type Actor,
  type EntityName,
  type MergePlan,
  type PushRequest,
  type PushResult,
  type Setting,
  type User,
} from '@gen/shared';
import type { Sqlite } from './db';
import type { RecordStore, Row } from './store';

export interface PushContext {
  db: Sqlite;
  store: RecordStore;
  deviceId: string;
  now: number;
}

/** Поля, зміна яких — це «зупинка» сесії (дозволено будь-якому оператору). */
const STOP_FIELDS = new Set(['endedAt', 'endMeterMin', 'note']);
const PIN_FIELDS = new Set(['pinHash', 'pinSalt', 'pinAlgo']);
const META = new Set(['updatedAt', 'deviceId', 'version']);

function changedFields(a: Row, b: Row): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !META.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

function log(ctx: PushContext, actorId: string | null, entity: string | null, id: string | null, status: string, reason?: string) {
  ctx.db
    .prepare('INSERT INTO sync_log (at, device_id, actor_id, entity, entity_id, status, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.now, ctx.deviceId, actorId, entity, id, status, reason ?? null);
}

/**
 * Обробка push. Для кожної зміни:
 *  1) перевірка формату (zod) і часу (не далі ніж +1 доба від серверного);
 *  2) last-write-wins: старіша за серверну версія — «stale» (ігнорується, телефон отримає новішу при pull);
 *  3) права — тими ж правилами, що й у телефоні (checkPermission), за серверним часом;
 *  4) запис із новим seq; паралельні правки — запис «конфлікт імпорту» в журнал змін.
 * Режим snapshot (повний знімок при підключенні / після імпорту файла) — лише від адміна,
 * або від першого пристрою, поки сервер порожній.
 */
export function processPush(ctx: PushContext, req: PushRequest): PushResult[] {
  const { store } = ctx;
  const results: PushResult[] = [];

  return ctx.db.transaction(() => {
    const serverEmpty = store.isEmpty();
    const users = () => new Map(store.all('users').map((u) => [u.id, u as unknown as User]));
    let userMap = users();
    const settings = parseSettings(store.all('settings') as unknown as Setting[]);

    const requester = userMap.get(req.actorId);
    if (req.mode === 'snapshot' && !serverEmpty) {
      if (!requester || requester.role !== 'admin' || !requester.isActive || requester.deletedAt !== null) {
        log(ctx, req.actorId, null, null, 'rejected', 'snapshot_not_admin');
        return req.changes.map((c) => ({ opId: c.opId, status: 'rejected' as const, reason: 'Повний знімок може надіслати лише адмін' }));
      }
    }
    const trustedSnapshot = req.mode === 'snapshot';

    for (const c of req.changes) {
      const entity = c.entity as EntityName;
      const parsed = ENTITY_SCHEMAS[entity].safeParse(c.row);
      if (!parsed.success) {
        results.push({ opId: c.opId, status: 'rejected', reason: `Некоректні дані: ${parsed.error.issues[0]?.message ?? ''}` });
        log(ctx, c.actorId, entity, String(c.row.id ?? ''), 'rejected', 'invalid');
        continue;
      }
      const row = parsed.data as unknown as Row;
      if (row.updatedAt > ctx.now + DAY) {
        results.push({
          opId: c.opId,
          status: 'rejected',
          reason: 'Час телефона випереджає серверний більше ніж на добу — перевірте дату',
          serverRow: store.get(entity, row.id),
        });
        log(ctx, c.actorId, entity, row.id, 'rejected', 'clock');
        continue;
      }
      const existing = store.get(entity, row.id);

      // Журнал змін лише доповнюється
      if (entity === 'auditLog') {
        if (!existing) store.put(entity, row, ctx.now);
        results.push({ opId: c.opId, status: existing ? 'stale' : 'applied' });
        continue;
      }

      if (existing && compareVersions(row, existing) <= 0) {
        // Паралельна правка програла — фіксуємо конфлікт у журналі змін (як і при імпорті файла)
        if (compareVersions(row, existing) < 0 && isConflict(existing, row)) recordConflict(ctx, entity, existing, row, 'local');
        results.push({ opId: c.opId, status: 'stale' });
        continue;
      }

      if (!trustedSnapshot) {
        const deny = permissionError(c.actorId, entity, row, existing, userMap, ctx.now, settings.operatorEditHours);
        if (deny) {
          results.push({ opId: c.opId, status: 'rejected', reason: deny, serverRow: existing });
          log(ctx, c.actorId, entity, row.id, 'rejected', deny);
          continue;
        }
      }

      if (existing && isConflict(existing, row)) recordConflict(ctx, entity, existing, row, 'incoming');
      store.put(entity, row, ctx.now);
      if (entity === 'users') userMap = users();
      results.push({ opId: c.opId, status: 'applied' });
    }
    return results;
  })();
}

/** Запис «конфлікт» у журнал змін (детермінований id — повтор не дублює). */
function recordConflict(ctx: PushContext, entity: EntityName, existing: Row, incoming: Row, winner: 'local' | 'incoming') {
  const plan = { conflicts: [{ entity, id: incoming.id, local: existing, incoming, winner }] };
  for (const a of conflictAuditEntries(plan as unknown as MergePlan, { actorId: SYSTEM_ID, deviceId: SYSTEM_ID, now: ctx.now })) {
    if (!ctx.store.get('auditLog', a.id)) ctx.store.put('auditLog', a as unknown as Row, ctx.now);
  }
}

function permissionError(
  actorId: string,
  entity: EntityName,
  row: Row,
  existing: Row | null,
  users: Map<string, User>,
  now: number,
  operatorEditHours: number,
): string | null {
  const u = users.get(actorId);
  if (!u || u.deletedAt !== null) return 'Невідомий користувач';
  if (!u.isActive) return 'Профіль заблоковано';
  const actor: Actor = { id: u.id, role: u.role };

  // Зупинка відкритої сесії — дозволена будь-якому оператору
  if (
    entity === 'workSessions' &&
    existing &&
    existing.endedAt === null &&
    row.endedAt !== null &&
    row.deletedAt === null &&
    canStopSession(actor) &&
    changedFields(existing, row).every((f) => STOP_FIELDS.has(f))
  ) {
    return null;
  }
  // Зміна власного PIN
  if (entity === 'users' && existing && actor.id === row.id && changedFields(existing, row).every((f) => PIN_FIELDS.has(f))) {
    return null;
  }

  const action = !existing ? 'create' : row.deletedAt !== null && existing.deletedAt === null ? 'delete' : 'update';
  const p = checkPermission(actor, action, entity, existing, now, operatorEditHours);
  return p.ok ? null : (p.reason ?? 'Немає прав');
}
