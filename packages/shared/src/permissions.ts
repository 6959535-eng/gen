import type { EntityName, Role } from './schemas/entities';
import { HOUR } from './format';

export interface Actor {
  id: string;
  role: Role;
}

/** Сутності, які оператор може створювати. */
const OPERATOR_CREATE: ReadonlySet<EntityName> = new Set([
  'workSessions',
  'refuels',
  'fuelReceipts',
  'fuelIssues',
  'fuelInventories',
  'maintenance',
]);

export type Action = 'create' | 'update' | 'delete';

export interface PermissionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Єдина функція перевірки прав. Використовується репозиторіями в телефоні,
 * а пізніше — сервером при прийомі змін.
 */
export function checkPermission(
  actor: Actor,
  action: Action,
  entity: EntityName,
  record: { authorId: string; createdAt: number } | null,
  now: number,
  operatorEditHours = 24,
): PermissionCheck {
  if (entity === 'auditLog') return { ok: false, reason: 'Журнал змін не редагується' };
  if (actor.role === 'admin') return { ok: true };

  if (!OPERATOR_CREATE.has(entity)) {
    return { ok: false, reason: 'Ця дія доступна лише адміну' };
  }
  if (action === 'create') return { ok: true };
  if (!record) return { ok: false, reason: 'Запис не знайдено' };
  if (record.authorId !== actor.id) {
    return { ok: false, reason: 'Можна змінювати лише власні записи' };
  }
  if (now - record.createdAt > operatorEditHours * HOUR) {
    return { ok: false, reason: `Минуло більше ${operatorEditHours} год — зверніться до адміна` };
  }
  return { ok: true };
}

/**
 * Виключення для оператора: «Зупинка» чужої відкритої сесії — це закриття,
 * а не редагування. Без цього зміна, що прийшла пізніше, не змогла б зупинити генератор.
 */
export function canStopSession(actor: Actor): boolean {
  return actor.role === 'admin' || actor.role === 'operator';
}
