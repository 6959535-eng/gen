import { describe, expect, it } from 'vitest';
import { diffRecords } from '../calc/auditDiff';

describe('журнал змін: різниця', () => {
  it('показує лише змінені поля, у зрозумілому вигляді', () => {
    const before = { id: 'x', updatedAt: 1, version: 1, volumeMl: 10_000, isFull: false, source: 'warehouse', note: '' };
    const after = { id: 'x', updatedAt: 2, version: 2, volumeMl: 12_500, isFull: true, source: 'warehouse', note: '' };
    expect(diffRecords(before, after)).toEqual([
      { field: 'volumeMl', label: 'Літри', before: '10 л', after: '12,5 л' },
      { field: 'isFull', label: 'До повного бака', before: 'ні', after: 'так' },
    ]);
  });
  it('мʼяке видалення і назви за id', () => {
    const b = { generatorId: 'g1', deletedAt: null };
    const a = { generatorId: 'g1', deletedAt: Date.UTC(2026, 10, 19, 10) };
    expect(diffRecords(b, a)[0]).toMatchObject({ label: 'Видалено', before: '—', after: '19.11.2026 12:00' });
    expect(diffRecords(null, b, { names: new Map([['g1', 'Г-1']]) })[0]!.after).toBe('Г-1');
  });
  it('PIN не розкривається', () => {
    expect(diffRecords({ pinHash: 'a', pinSalt: 'b' }, { pinHash: 'c', pinSalt: 'd' })).toEqual([
      { field: 'pinHash', label: 'PIN', before: '••••', after: '••••' },
    ]);
  });
});
