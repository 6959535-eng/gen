import { describe, expect, it } from 'vitest';
import {
  averageConsumption, buildTimeline, consumptionIntervals, currentHoursMin, hoursForPeriod, isClockSuspicious,
  openSession, serviceStatus, stockBalance, stockHoursLeft, stockMovements, validateMaintenance, validateRefuel,
  validateSession,
} from '../calc';
import { HOUR, T0, gen, maint, meta, refuel, session, DT } from './fixtures';

const NOW = T0 + 1000 * HOUR;

describe('мотогодини', () => {
  const g = gen(); // 100 год початково
  it('сума сесій за часом', () => {
    const ss = [session(g, 0, 2), session(g, 5, 3.5)];
    expect(currentHoursMin(g, ss, [], [], NOW)).toBe((100 + 5.5) * 60);
  });
  it('відкрита сесія рахується до «зараз»', () => {
    const ss = [session(g, 0, null)];
    expect(currentHoursMin(g, ss, [], [], T0 + 90 * 60_000)).toBe(100 * 60 + 90);
    expect(openSession(ss)).toBe(ss[0]);
  });
  it('показники лічильника мають пріоритет над часом', () => {
    const ss = [session(g, 0, 2, { startMeterMin: 110 * 60, endMeterMin: 111 * 60 })];
    // лічильник показав 110 на старті (генератор працював поза обліком) і 1 год напрацювання
    expect(currentHoursMin(g, ss, [], [], NOW)).toBe(111 * 60);
  });
  it('показник у заправці — опорна точка', () => {
    const ss = [session(g, 0, 2), session(g, 10, 1)];
    const rs = [refuel(g, 5, 10, true, { meterMin: 120 * 60 })];
    expect(currentHoursMin(g, ss, rs, [], NOW)).toBe(121 * 60);
  });
  it('видалені сесії не рахуються', () => {
    const s = { ...session(g, 0, 2), deletedAt: T0 + 3 * HOUR };
    expect(currentHoursMin(g, [s], [], [], NOW)).toBe(100 * 60);
  });
  it('мотогодини за період з частковим перекриттям', () => {
    const ss = [session(g, 0, 4), session(g, 10, 2)];
    expect(hoursForPeriod(ss, T0 + 2 * HOUR, T0 + 11 * HOUR, NOW)).toBe(3 * 60);
    expect(hoursForPeriod(ss, T0 - HOUR, T0 + 100 * HOUR, NOW)).toBe(6 * 60);
  });
  it('лічильникова сесія розподіляється пропорційно часу', () => {
    const ss = [session(g, 0, 4, { startMeterMin: 100 * 60, endMeterMin: 102 * 60 })];
    expect(hoursForPeriod(ss, T0, T0 + 2 * HOUR, NOW)).toBe(60);
  });
});

describe('фактична витрата між заправками «до повного»', () => {
  const g = gen({ normMlPerH: 1000 });
  it('рахує л/год і відхилення', () => {
    const ss = [session(g, 1, 10), session(g, 20, 10)];
    const rs = [
      refuel(g, 0, 20, true),
      refuel(g, 15, 5, false), // доливка
      refuel(g, 40, 7, true), // 12 л на 20 год = 0,6 л/год
    ];
    const tl = buildTimeline(g, ss, rs, [], NOW);
    const iv = consumptionIntervals(rs, tl, g.normMlPerH, 15);
    expect(iv).toHaveLength(1);
    expect(iv[0]!.volumeMl).toBe(12_000);
    expect(iv[0]!.workedMin).toBe(20 * 60);
    expect(iv[0]!.mlPerHour).toBe(600);
    expect(iv[0]!.deviation).toBeCloseTo(-0.4);
    expect(iv[0]!.flagged).toBe(true);
  });
  it('в межах порогу — не підсвічується', () => {
    const ss = [session(g, 1, 10)];
    const rs = [refuel(g, 0, 20, true), refuel(g, 12, 11, true)];
    const iv = consumptionIntervals(rs, buildTimeline(g, ss, rs, [], NOW), 1000, 15);
    expect(iv[0]!.mlPerHour).toBeCloseTo(1100);
    expect(iv[0]!.flagged).toBe(false);
  });
  it('без напрацювання — витрата невідома', () => {
    const rs = [refuel(g, 0, 20, true), refuel(g, 1, 1, true)];
    const iv = consumptionIntervals(rs, buildTimeline(g, [], rs, [], NOW), 1000, 15);
    expect(iv[0]!.mlPerHour).toBeNull();
    expect(averageConsumption(iv)).toBeNull();
  });
  it('середня зважена', () => {
    const ss = [session(g, 1, 10), session(g, 20, 30)];
    const rs = [refuel(g, 0, 20, true), refuel(g, 12, 10, true), refuel(g, 60, 36, true)];
    const avg = averageConsumption(consumptionIntervals(rs, buildTimeline(g, ss, rs, [], NOW), 1000, 15));
    expect(avg!.mlPerHour).toBeCloseTo(46_000 / 40);
  });
});

describe('до наступного ТО', () => {
  const g = gen({ initialHoursMin: 0, serviceIntervalMin: 100 * 60 });
  it('від початкових мотогодин', () => {
    const st = serviceStatus(g, [], 95 * 60, 10);
    expect(st.remainingMin).toBe(5 * 60);
    expect(st.warn).toBe(true);
    expect(st.overdue).toBe(false);
  });
  it('від останнього ТО, ремонт не скидає', () => {
    const ms = [maint(g, 1, 80), maint(g, 2, 90, { kind: 'repair', resetsInterval: false })];
    const st = serviceStatus(g, ms, 120 * 60, 10);
    expect(st.remainingMin).toBe(60 * 60);
    expect(st.warn).toBe(false);
  });
  it('прострочено', () => {
    expect(serviceStatus(g, [], 130 * 60, 10).overdue).toBe(true);
  });
});

describe('склад', () => {
  const g = gen();
  it('залишок = надходження − видача зі складу', () => {
    const receipts = [{ ...meta(), at: T0, fuelTypeId: DT, volumeMl: 100_000, supplier: '', note: '' }];
    const rs = [refuel(g, 1, 20, true), refuel(g, 2, 5, false, { source: 'canister' })];
    const mv = stockMovements(receipts, rs);
    expect(mv).toHaveLength(2);
    expect(stockBalance(mv).get(DT)).toBe(80_000);
    expect(stockHoursLeft(80_000, 1000)).toBe(80);
    expect(stockHoursLeft(80_000, null)).toBeNull();
  });
});

describe('валідація', () => {
  const g = gen();
  const hist = (sessions = [session(g, 0, 2)]) => ({ sessions, refuels: [], maintenance: [] });

  it('кінець раніше за початок', () => {
    const s = session(g, 10, null);
    s.endedAt = s.startedAt - 1;
    expect(validateSession(s, hist(), NOW).errors[0]!.code).toBe('end_before_start');
  });
  it('перетин сесій', () => {
    expect(validateSession(session(g, 1, 3), hist(), NOW).errors[0]!.code).toBe('overlap');
    expect(validateSession(session(g, 2, 3), hist(), NOW).errors).toHaveLength(0);
  });
  it('друга відкрита сесія', () => {
    const r = validateSession(session(g, 10, null), hist([session(g, 5, null)]), NOW);
    expect(r.errors[0]!.code).toBe('already_running');
  });
  it('інший генератор не заважає', () => {
    const other = gen({ name: 'Г-2' });
    expect(validateSession(session(other, 1, 3), hist(), NOW).errors).toHaveLength(0);
  });
  it('мотогодини не зменшуються', () => {
    const prev = session(g, 0, 2, { startMeterMin: 100 * 60, endMeterMin: 102 * 60 });
    const bad = session(g, 5, 1, { startMeterMin: 101 * 60, endMeterMin: 102 * 60 });
    expect(validateSession(bad, hist([prev]), NOW).errors[0]!.code).toBe('meter_decrease');
    const m = maint(g, 10, 101);
    expect(validateMaintenance(m, hist([prev]), NOW).errors[0]!.code).toBe('meter_decrease');
  });
  it('редагування сесії не конфліктує сама з собою', () => {
    const s = session(g, 0, 2);
    expect(validateSession({ ...s, endedAt: s.endedAt! + HOUR }, hist([s]), NOW).errors).toHaveLength(0);
  });
  it('заправка: 0 літрів — помилка, більше бака — попередження', () => {
    expect(validateRefuel(refuel(g, 3, 0, true), g, hist(), NOW).errors[0]!.code).toBe('volume');
    const r = validateRefuel(refuel(g, 3, 25, true), g, hist(), NOW);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings[0]!.code).toBe('over_tank');
  });
  it('некоректний годинник', () => {
    expect(isClockSuspicious(T0, T0 + 2 * HOUR)).toBe(true);
    expect(isClockSuspicious(T0, T0 + 60_000)).toBe(false);
    expect(isClockSuspicious(T0, null)).toBe(false);
  });
});
