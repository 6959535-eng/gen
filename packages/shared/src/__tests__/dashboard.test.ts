import { describe, expect, it } from 'vitest';
import { buildDashboard, buildJournal } from '../calc';
import { DEFAULT_FUEL_TYPES, DEFAULT_SETTINGS } from '../schemas/settings';
import { HOUR, T0, gen, maint, meta, refuel, session, DT } from './fixtures';

const fuelTypes = DEFAULT_FUEL_TYPES.map((f) => ({ ...meta(), id: f.id, code: f.code, name: f.name, isActive: true }));

describe('головна', () => {
  const g = gen({ initialHoursMin: 0, serviceIntervalMin: 20 * 60, normMlPerH: 1000 });
  const sessions = [session(g, 1, 10), session(g, 20, 8), session(g, 40, null)];
  const refuels = [refuel(g, 0, 20, true), refuel(g, 12, 15, true)]; // 15 л / 10 год = +50 %
  const receipts = [{ ...meta(), at: T0, fuelTypeId: DT, volumeMl: 100_000, supplier: '', note: '' }];
  const now = T0 + 42 * HOUR;
  const d = buildDashboard({
    generators: [g], sessions, refuels, maintenance: [], receipts, fuelTypes, settings: DEFAULT_SETTINGS, now,
  });

  it('картка: працює зараз, мотогодини, ТО', () => {
    const c = d.cards[0]!;
    expect(c.running?.id).toBe(sessions[2]!.id);
    expect(c.currentHoursMin).toBe(20 * 60);
    expect(c.service.overdue).toBe(true);
  });
  it('попередження: ТО і відхилення витрати', () => {
    expect(d.warnings[0]!.level).toBe('danger');
    expect(d.warnings.some((w) => w.text.includes('+50%'))).toBe(true);
  });
  it('склад: залишок і запас годин за фактичною витратою', () => {
    const s = d.stock.find((x) => x.fuelType.id === DT)!;
    expect(s.balanceMl).toBe(65_000);
    expect(s.rateIsNorm).toBe(false);
    expect(s.hoursLeft).toBeCloseTo(65 / 1.5);
  });
  it('без історії витрат — запас за нормою', () => {
    const d2 = buildDashboard({
      generators: [g], sessions: [], refuels: [], maintenance: [], receipts, fuelTypes, settings: DEFAULT_SETTINGS, now,
    });
    const s = d2.stock.find((x) => x.fuelType.id === DT)!;
    expect(s.rateIsNorm).toBe(true);
    expect(s.hoursLeft).toBe(100);
  });
});

describe('журнал', () => {
  const g1 = gen({ name: 'Г-1' });
  const g2 = gen({ name: 'Г-2' });
  const input = {
    generators: [g1, g2],
    sessions: [session(g1, 0, 2), session(g2, 5, null)],
    refuels: [refuel(g1, 3, 10, true)],
    maintenance: [maint(g2, 4, 120)],
    receipts: [{ ...meta(T0 + 6 * HOUR), at: T0 + 6 * HOUR, fuelTypeId: DT, volumeMl: 50_000, supplier: 'АЗС', note: '' }],
    fuelTypeNames: new Map([[DT, 'Дизель']]),
    now: T0 + 10 * HOUR,
  };
  it('усі типи від нових до старих', () => {
    const j = buildJournal(input);
    expect(j.map((x) => x.kind)).toEqual(['receipt', 'session', 'maintenance', 'refuel', 'session']);
    expect(j[1]!.running).toBe(true);
    expect(j[0]!.title).toBe('Склад +50 л Дизель');
  });
  it('фільтри: генератор, тип, період', () => {
    expect(buildJournal(input, { generatorId: g1.id }).map((x) => x.kind)).toEqual(['refuel', 'session']);
    expect(buildJournal(input, { kinds: ['refuel'] })).toHaveLength(1);
    expect(buildJournal(input, { from: T0 + 4 * HOUR, to: T0 + 5 * HOUR })).toHaveLength(2);
  });
});
