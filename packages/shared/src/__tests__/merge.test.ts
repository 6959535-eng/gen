import { describe, expect, it } from 'vitest';
import { applyMergeInMemory, checkIntegrity, conflictAuditEntries, planMerge } from '../merge';
import type { Dataset, Generator } from '../schemas/entities';
import { DEV_A, DEV_B, HOUR, T0, USER, ds, gen, refuel, session } from './fixtures';

const ctx = { actorId: USER, deviceId: DEV_A, now: T0 + 1000 * HOUR };

/** Повне злиття: план + запис конфліктів у журнал. */
function merge(local: Dataset, incoming: Dataset): Dataset {
  const plan = planMerge(local, incoming);
  return applyMergeInMemory(local, plan, conflictAuditEntries(plan, ctx));
}

const edit = (g: Generator, patch: Partial<Generator>, at: number, device = DEV_A): Generator => ({
  ...g,
  ...patch,
  updatedAt: at,
  deviceId: device,
  version: g.version + 1,
});

describe('злиття', () => {
  const g1 = gen({ name: 'Г-1' });
  const g2 = gen({ name: 'Г-2' });

  it('нові записи додаються', () => {
    const plan = planMerge(ds({ generators: [g1] }), ds({ generators: [g1, g2] }));
    expect(plan.totals).toMatchObject({ inserts: 1, updates: 0, conflicts: 0, unchanged: 1 });
  });

  it('повторний імпорт того самого файла нічого не змінює (ідемпотентність)', () => {
    const local = ds({ generators: [g1] });
    const incoming = ds({ generators: [g2], workSessions: [session(g2, 0, 1)] });
    const once = merge(local, incoming);
    const twice = merge(once, incoming);
    expect(twice).toEqual(once);
    expect(planMerge(once, incoming).isNoop).toBe(true);
  });

  it('дублі всередині файла ігноруються', () => {
    const plan = planMerge(ds(), ds({ generators: [g1, g1] }));
    expect(plan.totals.inserts).toBe(1);
  });

  it('новіша версія з файла перемагає, без конфлікту, якщо локально не редагували', () => {
    const newer = edit(g1, { name: 'Г-1 нова' }, T0 + HOUR, DEV_B);
    const plan = planMerge(ds({ generators: [g1] }), ds({ generators: [newer] }));
    expect(plan.totals).toMatchObject({ updates: 1, conflicts: 0 });
    expect(merge(ds({ generators: [g1] }), ds({ generators: [newer] })).generators[0]!.name).toBe('Г-1 нова');
  });

  it('старий файл поверх нових даних нічого не перезаписує', () => {
    const localNewer = edit(g1, { name: 'Локальна' }, T0 + 2 * HOUR);
    const plan = planMerge(ds({ generators: [localNewer] }), ds({ generators: [g1] }));
    expect(plan.totals).toMatchObject({ updates: 0, keptLocal: 1, conflicts: 0 });
    expect(plan.isNoop).toBe(true);
  });

  it('паралельні правки — конфлікт, перемагає більший updated_at, конфлікт пишеться в журнал', () => {
    const a = edit(g1, { name: 'A' }, T0 + HOUR, DEV_A);
    const b = edit(g1, { name: 'B' }, T0 + 2 * HOUR, DEV_B);
    const plan = planMerge(ds({ generators: [a] }), ds({ generators: [b] }));
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]!.winner).toBe('incoming');
    const res = merge(ds({ generators: [a] }), ds({ generators: [b] }));
    expect(res.generators[0]!.name).toBe('B');
    expect(res.auditLog).toHaveLength(1);
    expect(res.auditLog[0]!.action).toBe('import_conflict');
  });

  it('конфлікт, де перемогла локальна версія, при повторному імпорті не дублюється в журналі', () => {
    const a = edit(g1, { name: 'A' }, T0 + 3 * HOUR, DEV_A);
    const b = edit(g1, { name: 'B' }, T0 + 2 * HOUR, DEV_B);
    const once = merge(ds({ generators: [a] }), ds({ generators: [b] }));
    expect(once.generators[0]!.name).toBe('A');
    expect(once.auditLog).toHaveLength(1);
    const twice = merge(once, ds({ generators: [b] }));
    expect(twice).toEqual(once);
  });

  it('рівний updated_at — вирішує device_id, однаково з обох боків', () => {
    const a = edit(g1, { name: 'A' }, T0 + HOUR, DEV_A);
    const b = edit(g1, { name: 'B' }, T0 + HOUR, DEV_B);
    const onA = merge(ds({ generators: [a] }), ds({ generators: [b] }));
    const onB = merge(ds({ generators: [b] }), ds({ generators: [a] }));
    expect(onA.generators[0]!.name).toBe('B'); // DEV_B > DEV_A
    expect(onB.generators[0]!.name).toBe('B');
  });

  it('видалення переноситься', () => {
    const del = { ...g1, deletedAt: T0 + HOUR, updatedAt: T0 + HOUR, version: 2, deviceId: DEV_B };
    const res = merge(ds({ generators: [g1] }), ds({ generators: [del] }));
    expect(res.generators[0]!.deletedAt).toBe(T0 + HOUR);
  });

  it('видалення проти пізнішого редагування — перемагає пізніше (LWW), конфлікт у журналі', () => {
    const del = { ...g1, deletedAt: T0 + HOUR, updatedAt: T0 + HOUR, version: 2, deviceId: DEV_B };
    const edited = edit(g1, { note: 'правка' }, T0 + 2 * HOUR, DEV_A);
    const res = merge(ds({ generators: [edited] }), ds({ generators: [del] }));
    expect(res.generators[0]!.deletedAt).toBeNull();
    expect(res.auditLog[0]!.action).toBe('import_conflict');
  });

  it('обмін A→B→A сходиться до однакового стану', () => {
    const base = ds({ generators: [g1, g2] });
    const A = { ...base, generators: [edit(g1, { name: 'A1' }, T0 + HOUR, DEV_A), g2] };
    const B = { ...base, generators: [g1, edit(g2, { name: 'B2' }, T0 + HOUR, DEV_B)] };
    const B2 = merge(B, A);
    const A2 = merge(A, B2);
    expect(A2.generators).toEqual(B2.generators);
    expect(A2.generators.map((g) => g.name).sort()).toEqual(['A1', 'B2']);
  });

  it('однаковий вміст з різними службовими полями — не конфлікт', () => {
    const twin = { ...g1, updatedAt: g1.updatedAt + 5, deviceId: DEV_B };
    const plan = planMerge(ds({ generators: [g1] }), ds({ generators: [twin] }));
    expect(plan.totals.conflicts).toBe(0);
  });

  it('журнал змін тільки доповнюється', () => {
    const entry = conflictAuditEntries(
      planMerge(ds({ generators: [edit(g1, { name: 'x' }, T0 + 1)] }), ds({ generators: [edit(g1, { name: 'y' }, T0 + 2, DEV_B)] })),
      ctx,
    )[0]!;
    const changed = { ...entry, note: 'підмінено', updatedAt: entry.updatedAt + 100 };
    const plan = planMerge(ds({ auditLog: [entry] }), ds({ auditLog: [changed] }));
    expect(plan.isNoop).toBe(true);
  });
});

describe('перевірка цілісності', () => {
  const g = gen();
  it('дві відкриті сесії й перетини', () => {
    const issues = checkIntegrity(
      ds({ generators: [g], workSessions: [session(g, 0, null), session(g, 5, null), session(g, -10, 12)] }),
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('multiple_open');
    expect(codes).toContain('overlap');
  });
  it('зменшення мотогодин', () => {
    const issues = checkIntegrity(
      ds({
        generators: [g],
        workSessions: [session(g, 0, 1, { startMeterMin: 6000, endMeterMin: 6060 })],
        refuels: [refuel(g, 2, 10, true, { meterMin: 5000 })],
      }),
    );
    expect(issues.map((i) => i.code)).toEqual(['meter_decrease']);
  });
  it('чисті дані — без проблем', () => {
    expect(checkIntegrity(ds({ generators: [g], workSessions: [session(g, 0, 1), session(g, 2, 1)] }))).toEqual([]);
  });
});
