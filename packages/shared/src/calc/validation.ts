import { formatDateTime, formatMotoHours, formatLiters, MINUTE } from '../format';
import type { Generator, Maintenance, Refuel, WorkSession } from '../schemas/entities';
import { collectReadings, type MeterReading } from './hours';

export interface Issue {
  code: string;
  message: string;
}
export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}
const ok = (): ValidationResult => ({ errors: [], warnings: [] });

type S = Pick<WorkSession, 'id' | 'generatorId' | 'startedAt' | 'endedAt' | 'startMeterMin' | 'endMeterMin' | 'deletedAt'>;
type R = Pick<Refuel, 'id' | 'at' | 'meterMin' | 'deletedAt'>;
type M = Pick<Maintenance, 'id' | 'at' | 'meterMin' | 'deletedAt'>;

export interface GeneratorHistory {
  sessions: readonly S[];
  refuels: readonly R[];
  maintenance: readonly M[];
}

/** Чи перетинаються [a1, a2) і [b1, b2); null у кінці — «досі триває». */
export function intervalsOverlap(a1: number, a2: number | null, b1: number, b2: number | null): boolean {
  const ae = a2 ?? Infinity;
  const be = b2 ?? Infinity;
  return a1 < be && b1 < ae;
}

/** Показник лічильника не може бути меншим за попередній і більшим за наступний. */
export function checkMeterReading(time: number, value: number, readings: readonly MeterReading[]): Issue | null {
  for (const r of readings) {
    if (r.time <= time && r.value > value) {
      return {
        code: 'meter_decrease',
        message: `Мотогодини не можуть зменшуватися: ${formatDateTime(r.time)} було ${formatMotoHours(r.value)}`,
      };
    }
    if (r.time > time && r.value < value) {
      return {
        code: 'meter_after',
        message: `Показник більший за пізніший запис (${formatDateTime(r.time)}: ${formatMotoHours(r.value)})`,
      };
    }
  }
  return null;
}

const without = <T extends { id: string; deletedAt: number | null }>(xs: readonly T[], id: string) =>
  xs.filter((x) => x.id !== id && x.deletedAt === null);

export function validateSession(s: S, history: GeneratorHistory, now: number): ValidationResult {
  const res = ok();
  if (s.endedAt !== null && s.endedAt < s.startedAt) {
    res.errors.push({ code: 'end_before_start', message: 'Кінець сесії не може бути раніше за початок' });
  }
  if (s.startMeterMin !== null && s.endMeterMin !== null && s.endMeterMin < s.startMeterMin) {
    res.errors.push({ code: 'meter_end_lt_start', message: 'Показник у кінці менший за показник на початку' });
  }
  if (s.startedAt > now + 5 * MINUTE) {
    res.errors.push({ code: 'in_future', message: 'Початок сесії в майбутньому' });
  }
  const others = without(history.sessions, s.id).filter((o) => o.generatorId === s.generatorId);
  for (const o of others) {
    if (intervalsOverlap(s.startedAt, s.endedAt, o.startedAt, o.endedAt)) {
      res.errors.push({
        code: o.endedAt === null ? 'already_running' : 'overlap',
        message:
          o.endedAt === null
            ? `Генератор уже працює з ${formatDateTime(o.startedAt)}`
            : `Перетинається з сесією ${formatDateTime(o.startedAt)} – ${formatDateTime(o.endedAt)}`,
      });
      break;
    }
  }
  const readings = collectReadings(others, without(history.refuels, ''), without(history.maintenance, ''));
  if (s.startMeterMin !== null) {
    const i = checkMeterReading(s.startedAt, s.startMeterMin, readings);
    if (i) res.errors.push(i);
  }
  if (s.endMeterMin !== null && s.endedAt !== null) {
    const i = checkMeterReading(s.endedAt, s.endMeterMin, readings);
    if (i && !res.errors.some((e) => e.code === i.code)) res.errors.push(i);
  }
  if (s.endedAt !== null && s.endedAt - s.startedAt > 72 * 60 * MINUTE) {
    res.warnings.push({ code: 'long_session', message: 'Сесія триває понад 72 години — перевірте час' });
  }
  return res;
}

export function validateRefuel(
  r: R & Pick<Refuel, 'volumeMl'>,
  gen: Pick<Generator, 'tankMl'>,
  history: GeneratorHistory,
  now: number,
): ValidationResult {
  const res = ok();
  if (!(r.volumeMl > 0)) res.errors.push({ code: 'volume', message: 'Кількість літрів має бути більше 0' });
  if (r.volumeMl > gen.tankMl) {
    res.warnings.push({
      code: 'over_tank',
      message: `Більше за обʼєм бака (${formatLiters(gen.tankMl)}). Усе правильно?`,
    });
  }
  if (r.at > now + 5 * MINUTE) res.errors.push({ code: 'in_future', message: 'Дата заправки в майбутньому' });
  if (r.meterMin !== null) {
    const readings = collectReadings(history.sessions, without(history.refuels, r.id), without(history.maintenance, ''));
    const i = checkMeterReading(r.at, r.meterMin, readings);
    if (i) res.errors.push(i);
  }
  return res;
}

export function validateMaintenance(m: M & { meterMin: number }, history: GeneratorHistory, now: number): ValidationResult {
  const res = ok();
  if (m.at > now + 5 * MINUTE) res.errors.push({ code: 'in_future', message: 'Дата обслуговування в майбутньому' });
  const readings = collectReadings(history.sessions, without(history.refuels, ''), without(history.maintenance, m.id));
  const i = checkMeterReading(m.at, m.meterMin, readings);
  if (i) res.errors.push(i);
  return res;
}

/**
 * Годинник телефона явно некоректний, якщо «зараз» раніше за найсвіжіший запис у базі
 * (з невеликим допуском на розбіжність годинників між телефонами).
 */
export function isClockSuspicious(now: number, latestRecordAt: number | null, toleranceMs = 10 * MINUTE): boolean {
  return latestRecordAt !== null && now + toleranceMs < latestRecordAt;
}
