import { validateSession, type ValidationResult, type WorkSession } from '@gen/shared';
import { and, desc, isNull } from 'drizzle-orm';
import { workSessions } from '../db/schema';
import type { DbOrTx } from '../db/types';
import { assertCan, getById, insertEntity, requireActor, updateEntity, type Fields } from './base';
import type { RepoContext } from './context';
import { RepoError } from './errors';
import { loadHistory } from './history';

type SessionFields = Fields<'workSessions'>;

function ensureValid(r: ValidationResult, confirm: boolean) {
  if (r.errors.length) throw new RepoError('validation', r.errors[0]!.message, r.errors);
  if (r.warnings.length && !confirm) {
    throw new RepoError('needs_confirmation', r.warnings[0]!.message, r.warnings);
  }
}

function ensureGeneratorUsable(db: DbOrTx, generatorId: string) {
  const g = getById(db, 'generators', generatorId);
  if (!g || g.deletedAt !== null) throw new RepoError('not_found', 'Генератор не знайдено');
  if (g.status === 'decommissioned') throw new RepoError('validation', 'Генератор списано');
  if (g.status === 'repair') throw new RepoError('validation', 'Генератор у ремонті — змініть статус в адмінці');
  return g;
}

export function workSessionsRepo(ctx: RepoContext) {
  const { db } = ctx;

  const check = (s: WorkSession, tx: DbOrTx = db) => validateSession(s, loadHistory(tx, s.generatorId), ctx.now());

  return {
    get: (id: string) => getById(db, 'workSessions', id),

    /** Відкриті сесії (генератор працює зараз). */
    listOpen(): WorkSession[] {
      return db
        .select()
        .from(workSessions)
        .where(and(isNull(workSessions.deletedAt), isNull(workSessions.endedAt)))
        .all() as WorkSession[];
    },

    listByGenerator: (generatorId: string) =>
      loadHistory(db, generatorId).sessions.sort((a, b) => b.startedAt - a.startedAt),

    listAll(): WorkSession[] {
      return db
        .select()
        .from(workSessions)
        .where(isNull(workSessions.deletedAt))
        .orderBy(desc(workSessions.startedAt))
        .all() as WorkSession[];
    },

    /** Перевірка без запису (для форм: показати помилки/попередження до збереження). */
    validate(fields: SessionFields, id?: string): ValidationResult {
      const s = { ...fields, id: id ?? '', deletedAt: null } as WorkSession;
      return check(s);
    },

    /** «Запуск»: відкрита сесія з часом «зараз» (або вказаним). */
    start(
      generatorId: string,
      opts: { startedAt?: number; startMeterMin?: number | null; note?: string; confirm?: boolean } = {},
    ): WorkSession {
      const actor = requireActor(ctx);
      assertCan(ctx, actor, 'create', 'workSessions', null);
      const row = db.transaction((tx) => {
        ensureGeneratorUsable(tx, generatorId);
        const fields: SessionFields = {
          generatorId,
          startedAt: opts.startedAt ?? ctx.now(),
          endedAt: null,
          startMeterMin: opts.startMeterMin ?? null,
          endMeterMin: null,
          note: opts.note ?? '',
        };
        ensureValid(check({ ...fields, id: '', deletedAt: null } as WorkSession, tx), !!opts.confirm);
        return insertEntity(ctx, tx, 'workSessions', fields, actor.id);
      });
      ctx.bus.emit(['workSessions', 'auditLog']);
      return row;
    },

    /**
     * «Зупинка». Будь-який оператор може зупинити відкриту сесію (навіть чужу або давню) —
     * це закриття, а не редагування. Змінити вже закриту сесію — за звичайними правами.
     */
    stop(
      sessionId: string,
      opts: { endedAt?: number; endMeterMin?: number | null; note?: string; confirm?: boolean } = {},
    ): WorkSession {
      const actor = requireActor(ctx);
      const row = db.transaction((tx) => {
        const before = getById(tx, 'workSessions', sessionId);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Сесію не знайдено');
        if (before.endedAt !== null) throw new RepoError('conflict_state', 'Сесію вже завершено');
        const patch: Partial<SessionFields> = {
          endedAt: opts.endedAt ?? Math.max(ctx.now(), before.startedAt),
          endMeterMin: opts.endMeterMin ?? null,
          ...(opts.note !== undefined ? { note: opts.note } : {}),
        };
        ensureValid(check({ ...before, ...patch } as WorkSession, tx), !!opts.confirm);
        return updateEntity(ctx, tx, 'workSessions', before, patch, actor.id);
      });
      ctx.bus.emit(['workSessions', 'auditLog']);
      return row;
    },

    /** Внесення сесії заднім числом. */
    create(fields: SessionFields, opts: { confirm?: boolean } = {}): WorkSession {
      const actor = requireActor(ctx);
      assertCan(ctx, actor, 'create', 'workSessions', null);
      const row = db.transaction((tx) => {
        ensureGeneratorUsable(tx, fields.generatorId);
        ensureValid(check({ ...fields, id: '', deletedAt: null } as WorkSession, tx), !!opts.confirm);
        return insertEntity(ctx, tx, 'workSessions', fields, actor.id);
      });
      ctx.bus.emit(['workSessions', 'auditLog']);
      return row;
    },

    update(id: string, patch: Partial<SessionFields>, opts: { confirm?: boolean } = {}): WorkSession {
      const actor = requireActor(ctx);
      const row = db.transaction((tx) => {
        const before = getById(tx, 'workSessions', id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Сесію не знайдено');
        assertCan(ctx, actor, 'update', 'workSessions', before);
        ensureValid(check({ ...before, ...patch } as WorkSession, tx), !!opts.confirm);
        return updateEntity(ctx, tx, 'workSessions', before, patch, actor.id);
      });
      ctx.bus.emit(['workSessions', 'auditLog']);
      return row;
    },

    remove(id: string): WorkSession {
      const actor = requireActor(ctx);
      const row = db.transaction((tx) => {
        const before = getById(tx, 'workSessions', id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Сесію не знайдено');
        assertCan(ctx, actor, 'delete', 'workSessions', before);
        return updateEntity(ctx, tx, 'workSessions', before, { deletedAt: ctx.now() } as never, actor.id);
      });
      ctx.bus.emit(['workSessions', 'auditLog']);
      return row;
    },
  };
}

export { ensureValid, ensureGeneratorUsable };
