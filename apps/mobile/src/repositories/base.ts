import {
  checkPermission,
  ENTITY_SCHEMAS,
  uuidv7,
  type Action,
  type EntityMap,
  type EntityName,
} from '@gen/shared';
import { eq } from 'drizzle-orm';
import { TABLES, auditLog, outbox } from '../db/schema';
import type { DbOrTx } from '../db/types';
import type { CurrentActor, RepoContext } from './context';
import { RepoError } from './errors';

type Row<K extends EntityName> = EntityMap[K];
type MetaKeys = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'authorId' | 'deviceId' | 'version';
export type Fields<K extends EntityName> = Omit<Row<K>, MetaKeys>;

/** Поля, що не потрапляють у журнал змін у відкритому вигляді. */
const REDACT: Partial<Record<EntityName, string[]>> = { users: ['pinHash', 'pinSalt'] };

function auditJson(entity: EntityName, row: object | null): string | null {
  if (!row) return null;
  const r = { ...(row as Record<string, unknown>) };
  for (const k of REDACT[entity] ?? []) if (k in r) r[k] = '***';
  return JSON.stringify(r);
}

export function requireActor(ctx: RepoContext): CurrentActor {
  const a = ctx.actor();
  if (!a) throw new RepoError('not_authenticated', 'Увійдіть у профіль');
  return a;
}

export function assertCan(
  ctx: RepoContext,
  actor: CurrentActor,
  action: Action,
  entity: EntityName,
  record: { authorId: string; createdAt: number } | null,
) {
  const p = checkPermission(actor, action, entity, record, ctx.now(), ctx.settings().operatorEditHours);
  if (!p.ok) throw new RepoError('forbidden', p.reason ?? 'Немає прав');
}

function validate<K extends EntityName>(entity: K, row: unknown): Row<K> {
  const r = ENTITY_SCHEMAS[entity].safeParse(row);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ code: String(i.path.join('.')), message: i.message }));
    throw new RepoError('validation', issues[0]?.message ?? 'Некоректні дані', issues);
  }
  return r.data as Row<K>;
}

export function getById<K extends EntityName>(db: DbOrTx, entity: K, id: string): Row<K> | undefined {
  const t = TABLES[entity];
  return db.select().from(t).where(eq(t.id, id)).get() as Row<K> | undefined;
}

function writeOutboxAndAudit<K extends EntityName>(
  ctx: RepoContext,
  tx: DbOrTx,
  entity: K,
  op: 'insert' | 'update' | 'delete',
  before: Row<K> | null,
  after: Row<K>,
  actorId: string,
  now: number,
) {
  tx.insert(outbox)
    .values({
      id: uuidv7(now),
      op,
      entity,
      entityId: after.id,
      payloadJson: JSON.stringify(after),
      at: now,
      authorId: actorId,
      deviceId: ctx.deviceId,
      syncedAt: null,
    })
    .run();
  if (entity === 'auditLog') return;
  tx.insert(auditLog)
    .values({
      id: uuidv7(now),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      authorId: actorId,
      deviceId: ctx.deviceId,
      version: 1,
      at: now,
      action: op === 'insert' ? 'create' : op,
      entity,
      entityId: after.id,
      beforeJson: auditJson(entity, before),
      afterJson: auditJson(entity, after),
      note: '',
    })
    .run();
}

/** Створення запису: службові поля, валідація, outbox, журнал. Права перевіряє викликач. */
export function insertEntity<K extends EntityName>(
  ctx: RepoContext,
  tx: DbOrTx,
  entity: K,
  fields: Fields<K>,
  actorId: string,
  opts: { id?: string } = {},
): Row<K> {
  const now = ctx.now();
  const row = validate(entity, {
    ...fields,
    id: opts.id ?? uuidv7(now),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    authorId: actorId,
    deviceId: ctx.deviceId,
    version: 1,
  });
  tx.insert(TABLES[entity]).values(row as never).run();
  writeOutboxAndAudit(ctx, tx, entity, 'insert', null, row, actorId, now);
  return row;
}

/**
 * Зміна або мʼяке видалення. updated_at завжди зростає (навіть якщо годинник телефона відстає),
 * інакше злиття могло б вважати нову правку старшою за попередню.
 * author_id лишається за автором запису; хто змінив — видно в журналі й outbox.
 */
export function updateEntity<K extends EntityName>(
  ctx: RepoContext,
  tx: DbOrTx,
  entity: K,
  before: Row<K>,
  patch: Partial<Fields<K>> & { deletedAt?: number | null },
  actorId: string,
): Row<K> {
  const now = ctx.now();
  const after = validate(entity, {
    ...before,
    ...patch,
    id: before.id,
    updatedAt: Math.max(now, before.updatedAt + 1),
    deviceId: ctx.deviceId,
    version: before.version + 1,
  });
  const t = TABLES[entity];
  tx.update(t).set(after as never).where(eq(t.id, before.id)).run();
  const op = after.deletedAt !== null && before.deletedAt === null ? 'delete' : 'update';
  writeOutboxAndAudit(ctx, tx, entity, op, before, after, actorId, now);
  return after;
}

/** Типові операції для сутностей без особливої логіки. */
export function crud<K extends EntityName>(ctx: RepoContext, entity: K) {
  return {
    get(id: string): Row<K> | undefined {
      return getById(ctx.db, entity, id);
    },
    create(fields: Fields<K>): Row<K> {
      const actor = requireActor(ctx);
      assertCan(ctx, actor, 'create', entity, null);
      const row = ctx.db.transaction((tx) => insertEntity(ctx, tx, entity, fields, actor.id));
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },
    update(id: string, patch: Partial<Fields<K>>): Row<K> {
      const actor = requireActor(ctx);
      const row = ctx.db.transaction((tx) => {
        const before = getById(tx, entity, id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Запис не знайдено');
        assertCan(ctx, actor, 'update', entity, before);
        return updateEntity(ctx, tx, entity, before, patch, actor.id);
      });
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },
    remove(id: string): Row<K> {
      const actor = requireActor(ctx);
      const row = ctx.db.transaction((tx) => {
        const before = getById(tx, entity, id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Запис не знайдено');
        assertCan(ctx, actor, 'delete', entity, before);
        return updateEntity(ctx, tx, entity, before, { deletedAt: ctx.now() } as never, actor.id);
      });
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },
  };
}

export type { Action };
