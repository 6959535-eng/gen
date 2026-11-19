import {
  checkIntegrity,
  conflictAuditEntries,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  planMerge,
  rowsToWrite,
  uuidv7,
  type Dataset,
  type IntegrityIssue,
  type MergePlan,
} from '@gen/shared';
import { isNull, max } from 'drizzle-orm';
import { TABLES, auditLog, authState, outbox } from '../db/schema';
import type { DbOrTx } from '../db/types';
import { requireActor } from './base';
import type { RepoContext } from './context';
import { setLocalMeta } from './device';
import { RepoError } from './errors';

/** Таблиці, де шукаємо найсвіжіший запис для перевірки годинника. */
const TIME_TABLES = ['workSessions', 'refuels', 'fuelReceipts', 'maintenance', 'generators', 'users'] as const;

function requireAdmin(ctx: RepoContext) {
  const a = requireActor(ctx);
  if (a.role !== 'admin') throw new RepoError('forbidden', 'Доступно лише адміну');
  return a;
}

function upsert(tx: DbOrTx, name: (typeof ENTITY_NAMES)[number], row: object) {
  const t = TABLES[name];
  tx.insert(t).values(row as never).onConflictDoUpdate({ target: t.id, set: row as never }).run();
}

export interface ImportResult {
  plan: MergePlan;
  integrity: IntegrityIssue[];
}

export function dataRepo(ctx: RepoContext) {
  const { db } = ctx;

  /** Повний знімок синхронізованих таблиць (включно з видаленими записами). */
  const snapshot = (): Dataset => {
    const out = {} as Record<string, unknown[]>;
    for (const n of ENTITY_NAMES) out[n] = db.select().from(TABLES[n]).all();
    return out as unknown as Dataset;
  };

  return {
    snapshot,

    /** Найпізніший updated_at серед робочих записів — щоб помітити, що годинник телефона відстає. */
    latestRecordAt(): number | null {
      let m: number | null = null;
      for (const n of TIME_TABLES) {
        const t = TABLES[n];
        const v = db.select({ v: max(t.updatedAt) }).from(t).get()?.v ?? null;
        if (v !== null && (m === null || v > m)) m = v;
      }
      return m;
    },

    /** Попередній перегляд імпорту: нічого не змінює. */
    planImport(incoming: Dataset): MergePlan {
      requireAdmin(ctx);
      return planMerge(snapshot(), incoming);
    },

    /**
     * Застосування імпорту в одній транзакції. План перебудовується всередині транзакції,
     * щоб врахувати зміни, зроблені між переглядом і підтвердженням.
     */
    applyImport(incoming: Dataset, meta: { sourceDeviceId: string; exportedAt: number }): ImportResult {
      const actor = requireAdmin(ctx);
      const now = ctx.now();
      const plan = db.transaction((tx) => {
        const local = {} as Record<string, unknown[]>;
        for (const n of ENTITY_NAMES) local[n] = tx.select().from(TABLES[n]).all();
        const p = planMerge(local as unknown as Dataset, incoming);
        const writes = rowsToWrite(p);
        for (const n of ENTITY_NAMES) for (const r of writes[n]) upsert(tx, n, r);
        for (const a of conflictAuditEntries(p, { actorId: actor.id, deviceId: ctx.deviceId, now })) {
          tx.insert(auditLog).values(a).onConflictDoNothing().run();
        }
        if (!p.isNoop) {
          const t = p.totals;
          tx.insert(auditLog)
            .values({
              id: uuidv7(now),
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              authorId: actor.id,
              deviceId: ctx.deviceId,
              version: 1,
              at: now,
              action: 'import',
              entity: 'file',
              entityId: meta.sourceDeviceId,
              beforeJson: null,
              afterJson: JSON.stringify({ ...t, exportedAt: meta.exportedAt }),
              note: `Імпорт: нових ${t.inserts}, оновлено ${t.updates}, конфліктів ${t.conflicts}`,
            })
            .run();
        }
        setLocalMeta(tx, 'last_import_at', String(now));
        return p;
      });
      ctx.bus.emit([...ENTITY_NAMES]);
      return { plan, integrity: checkIntegrity(snapshot()) };
    },

    /** Повна заміна даних (відновлення з копії). Копію поточного стану робить сервіс бекапів до виклику. */
    replaceAll(data: Dataset, note: string): void {
      const actor = requireAdmin(ctx);
      for (const n of ENTITY_NAMES) {
        for (const r of data[n]) {
          const p = ENTITY_SCHEMAS[n].safeParse(r);
          if (!p.success) throw new RepoError('validation', `Пошкоджені дані в копії (${n})`);
        }
      }
      const now = ctx.now();
      db.transaction((tx) => {
        for (const n of ENTITY_NAMES) tx.delete(TABLES[n]).run();
        for (const n of ENTITY_NAMES) for (const r of data[n]) tx.insert(TABLES[n]).values(r as never).run();
        // Черга змін відносилась до старих даних; лічильники PIN — теж.
        tx.delete(outbox).run();
        tx.delete(authState).run();
        tx.insert(auditLog)
          .values({
            id: uuidv7(now),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            authorId: actor.id,
            deviceId: ctx.deviceId,
            version: 1,
            at: now,
            action: 'restore',
            entity: 'file',
            entityId: '',
            beforeJson: null,
            afterJson: null,
            note,
          })
          .run();
      });
      ctx.bus.emit([...ENTITY_NAMES, 'local']);
    },

    integrity: () => checkIntegrity(snapshot()),

    /** Неопрацьовані записи outbox (для майбутньої синхронізації та діагностики). */
    pendingOutbox: (limit = 100) => db.select().from(outbox).where(isNull(outbox.syncedAt)).limit(limit).all(),
  };
}
