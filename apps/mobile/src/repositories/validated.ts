import type { EntityMap, ValidationResult } from '@gen/shared';
import type { DbOrTx } from '../db/types';
import { assertCan, getById, insertEntity, requireActor, updateEntity, type Fields } from './base';
import type { RepoContext } from './context';
import { RepoError } from './errors';
import { ensureValid } from './workSessions';

type Validated = 'refuels' | 'maintenance' | 'fuelReceipts';

/**
 * CRUD з бізнес-валідацією (помилки блокують, попередження вимагають confirm: true).
 * prepare — доповнює поля перед записом (напр., тип пального з генератора).
 */
export function validatedCrud<K extends Validated>(
  ctx: RepoContext,
  entity: K,
  opts: {
    label: string;
    validate: (tx: DbOrTx, row: EntityMap[K]) => ValidationResult;
    prepare?: (tx: DbOrTx, fields: Fields<K>) => Fields<K>;
  },
) {
  const { db } = ctx;
  const notFound = () => new RepoError('not_found', `${opts.label}: запис не знайдено`);
  return {
    get: (id: string) => getById(db, entity, id),

    validate(fields: Fields<K>, id?: string): ValidationResult {
      const f = opts.prepare ? opts.prepare(db, fields) : fields;
      return opts.validate(db, { ...f, id: id ?? '', deletedAt: null } as unknown as EntityMap[K]);
    },

    create(fields: Fields<K>, o: { confirm?: boolean } = {}): EntityMap[K] {
      const actor = requireActor(ctx);
      assertCan(ctx, actor, 'create', entity, null);
      const row = db.transaction((tx) => {
        const f = opts.prepare ? opts.prepare(tx, fields) : fields;
        ensureValid(opts.validate(tx, { ...f, id: '', deletedAt: null } as unknown as EntityMap[K]), !!o.confirm);
        return insertEntity(ctx, tx, entity, f, actor.id);
      });
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },

    update(id: string, patch: Partial<Fields<K>>, o: { confirm?: boolean } = {}): EntityMap[K] {
      const actor = requireActor(ctx);
      const row = db.transaction((tx) => {
        const before = getById(tx, entity, id);
        if (!before || before.deletedAt !== null) throw notFound();
        assertCan(ctx, actor, 'update', entity, before);
        ensureValid(opts.validate(tx, { ...before, ...patch }), !!o.confirm);
        return updateEntity(ctx, tx, entity, before, patch, actor.id);
      });
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },

    remove(id: string): EntityMap[K] {
      const actor = requireActor(ctx);
      const row = db.transaction((tx) => {
        const before = getById(tx, entity, id);
        if (!before || before.deletedAt !== null) throw notFound();
        assertCan(ctx, actor, 'delete', entity, before);
        return updateEntity(ctx, tx, entity, before, { deletedAt: ctx.now() } as never, actor.id);
      });
      ctx.bus.emit([entity, 'auditLog']);
      return row;
    },
  };
}
