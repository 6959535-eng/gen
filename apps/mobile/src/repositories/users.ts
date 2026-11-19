import {
  hashPin,
  initialLockState,
  isLocked,
  PIN_MAX_ATTEMPTS,
  registerFailure,
  registerSuccess,
  uuidv7,
  verifyPin,
  type PinLockState,
  type Role,
  type User,
} from '@gen/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { authState, users } from '../db/schema';
import { assertCan, getById, insertEntity, requireActor, updateEntity } from './base';
import type { RepoContext } from './context';
import { RepoError } from './errors';

export type PinCheckResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'locked'; lockUntil: number }
  | { ok: false; reason: 'wrong'; attemptsLeft: number; lockUntil: number | null }
  | { ok: false; reason: 'inactive' | 'not_found' };

export function usersRepo(ctx: RepoContext) {
  const { db } = ctx;

  const list = (opts: { includeInactive?: boolean } = {}): User[] => {
    const rows = db.select().from(users).where(isNull(users.deletedAt)).orderBy(asc(users.name)).all() as User[];
    return opts.includeInactive ? rows : rows.filter((u) => u.isActive);
  };

  const activeAdmins = () => list().filter((u) => u.role === 'admin');

  const getLock = (userId: string): PinLockState =>
    db.select().from(authState).where(eq(authState.userId, userId)).get() ?? initialLockState();

  const setLock = (userId: string, s: PinLockState) =>
    db
      .insert(authState)
      .values({ userId, ...s })
      .onConflictDoUpdate({ target: authState.userId, set: s })
      .run();

  const checkName = (name: string, exceptId?: string) => {
    const dup = list({ includeInactive: true }).find(
      (u) => u.id !== exceptId && u.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (dup) throw new RepoError('validation', 'Профіль з таким імʼям уже є');
  };

  return {
    list,
    get: (id: string) => getById(db, 'users', id),
    hasAny: () => db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).limit(1).all().length > 0,

    /** Перший запуск: створення адміна (без авторизації, лише коли профілів ще немає). */
    async createFirstAdmin(name: string, pin: string): Promise<User> {
      const h = await hashPin(pin);
      const user = db.transaction((tx) => {
        const exists = tx.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).limit(1).all();
        if (exists.length) throw new RepoError('conflict_state', 'Адміністратора вже створено');
        const id = uuidv7(ctx.now());
        return insertEntity(ctx, tx, 'users', { name, role: 'admin', isActive: true, ...h }, id, { id });
      });
      ctx.bus.emit(['users', 'auditLog']);
      return user;
    },

    async create(input: { name: string; role: Role; pin: string }): Promise<User> {
      const actor = requireActor(ctx);
      assertCan(ctx, actor, 'create', 'users', null);
      checkName(input.name);
      const h = await hashPin(input.pin);
      const u = db.transaction((tx) =>
        insertEntity(ctx, tx, 'users', { name: input.name, role: input.role, isActive: true, ...h }, actor.id),
      );
      ctx.bus.emit(['users', 'auditLog']);
      return u;
    },

    update(id: string, patch: { name?: string; role?: Role; isActive?: boolean }): User {
      const actor = requireActor(ctx);
      const u = db.transaction((tx) => {
        const before = getById(tx, 'users', id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Профіль не знайдено');
        assertCan(ctx, actor, 'update', 'users', before);
        if (patch.name) checkName(patch.name, id);
        const losesAdmin = before.role === 'admin' && (patch.role === 'operator' || patch.isActive === false);
        if (losesAdmin && activeAdmins().length <= 1) {
          throw new RepoError('conflict_state', 'Має лишитися хоча б один активний адмін');
        }
        return updateEntity(ctx, tx, 'users', before, patch, actor.id);
      });
      ctx.bus.emit(['users', 'auditLog']);
      return u;
    },

    /** Зміна PIN: адмін — будь-кому, користувач — собі. */
    async changePin(id: string, pin: string): Promise<void> {
      const actor = requireActor(ctx);
      if (actor.role !== 'admin' && actor.id !== id) throw new RepoError('forbidden', 'Немає прав');
      const h = await hashPin(pin);
      db.transaction((tx) => {
        const before = getById(tx, 'users', id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Профіль не знайдено');
        updateEntity(ctx, tx, 'users', before, h, actor.id);
      });
      setLock(id, registerSuccess());
      ctx.bus.emit(['users', 'auditLog']);
    },

    remove(id: string): void {
      const actor = requireActor(ctx);
      if (actor.id === id) throw new RepoError('conflict_state', 'Не можна видалити власний профіль');
      db.transaction((tx) => {
        const before = getById(tx, 'users', id);
        if (!before || before.deletedAt !== null) throw new RepoError('not_found', 'Профіль не знайдено');
        assertCan(ctx, actor, 'delete', 'users', before);
        if (before.role === 'admin' && activeAdmins().length <= 1) {
          throw new RepoError('conflict_state', 'Має лишитися хоча б один активний адмін');
        }
        updateEntity(ctx, tx, 'users', before, { deletedAt: ctx.now() } as never, actor.id);
      });
      ctx.bus.emit(['users', 'auditLog']);
    },

    lockState: getLock,

    /** Перевірка PIN з блокуванням після 5 невдалих спроб поспіль. */
    async verify(userId: string, pin: string): Promise<PinCheckResult> {
      const user = db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .get() as User | undefined;
      if (!user) return { ok: false, reason: 'not_found' };
      if (!user.isActive) return { ok: false, reason: 'inactive' };
      const lock = getLock(userId);
      if (isLocked(lock, ctx.now())) return { ok: false, reason: 'locked', lockUntil: lock.lockUntil! };
      if (await verifyPin(pin, user)) {
        setLock(userId, registerSuccess());
        return { ok: true, user };
      }
      const next = registerFailure(getLock(userId), ctx.now());
      setLock(userId, next);
      return {
        ok: false,
        reason: 'wrong',
        attemptsLeft: next.lockUntil ? 0 : PIN_MAX_ATTEMPTS - next.failedCount,
        lockUntil: next.lockUntil,
      };
    },
  };
}
