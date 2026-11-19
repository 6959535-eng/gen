import { describe, expect, it } from 'vitest';
import { checkPermission } from '../permissions';
import { HOUR } from '../format';

const op = { id: 'op', role: 'operator' as const };
const admin = { id: 'adm', role: 'admin' as const };

describe('права', () => {
  it('адмін може все, крім редагування журналу', () => {
    expect(checkPermission(admin, 'delete', 'users', null, 0).ok).toBe(true);
    expect(checkPermission(admin, 'update', 'auditLog', null, 0).ok).toBe(false);
  });
  it('оператор вносить робочі записи, але не генератори й профілі', () => {
    expect(checkPermission(op, 'create', 'refuels', null, 0).ok).toBe(true);
    expect(checkPermission(op, 'create', 'generators', null, 0).ok).toBe(false);
    expect(checkPermission(op, 'update', 'users', null, 0).ok).toBe(false);
  });
  it('оператор змінює/видаляє лише свої записи протягом 24 год', () => {
    const own = { authorId: 'op', createdAt: 0 };
    expect(checkPermission(op, 'update', 'refuels', own, 23 * HOUR).ok).toBe(true);
    expect(checkPermission(op, 'delete', 'refuels', own, 23 * HOUR).ok).toBe(true);
    expect(checkPermission(op, 'update', 'refuels', own, 25 * HOUR).ok).toBe(false);
    expect(checkPermission(op, 'update', 'refuels', { authorId: 'x', createdAt: 0 }, HOUR).ok).toBe(false);
  });
});
