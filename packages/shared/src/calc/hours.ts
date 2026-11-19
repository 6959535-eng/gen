import { MINUTE } from '../format';
import type { Generator, WorkSession } from '../schemas/entities';

type SessionLike = Pick<WorkSession, 'startedAt' | 'endedAt' | 'startMeterMin' | 'endMeterMin' | 'deletedAt'>;
type ReadingSource = { at: number; meterMin: number | null; deletedAt: number | null };

/** Опорна точка: «у момент time лічильник показував value хвилин». */
export interface MeterReading {
  time: number;
  value: number;
}

export interface HoursTimeline {
  /** Показник мотогодин (хв) у момент t */
  at(t: number): number;
  /** Напрацювання (хв) у проміжку (from, to] */
  worked(from: number, to: number): number;
}

const alive = <T extends { deletedAt: number | null }>(xs: readonly T[]) => xs.filter((x) => x.deletedAt === null);

/** Хвилини напрацювання за сесію (для відкритої — до now). */
export function sessionMinutes(s: SessionLike, now: number): number {
  if (s.endedAt !== null && s.startMeterMin !== null && s.endMeterMin !== null) {
    return Math.max(0, s.endMeterMin - s.startMeterMin);
  }
  const end = s.endedAt ?? now;
  return Math.max(0, (end - s.startedAt) / MINUTE);
}

/** Усі відомі показники лічильника генератора. */
export function collectReadings(
  sessions: readonly SessionLike[],
  refuels: readonly ReadingSource[] = [],
  maintenance: readonly ReadingSource[] = [],
): MeterReading[] {
  const out: MeterReading[] = [];
  for (const s of alive(sessions)) {
    if (s.startMeterMin !== null) out.push({ time: s.startedAt, value: s.startMeterMin });
    if (s.endMeterMin !== null && s.endedAt !== null) out.push({ time: s.endedAt, value: s.endMeterMin });
  }
  for (const r of [...alive(refuels), ...alive(maintenance)]) {
    if (r.meterMin !== null) out.push({ time: r.at, value: r.meterMin });
  }
  return out.sort((a, b) => a.time - b.time || a.value - b.value);
}

/**
 * Хронологія мотогодин генератора.
 * Показник у момент t = остання опорна точка до t + напрацювання сесій після неї.
 * Опорні точки: початкові мотогодини, показники лічильника в сесіях, заправках і ТО.
 * Для сесій з обома показниками лічильника напрацювання розподіляється рівномірно за часом.
 */
export function buildTimeline(
  gen: Pick<Generator, 'initialHoursMin' | 'createdAt'>,
  sessions: readonly SessionLike[],
  refuels: readonly ReadingSource[] = [],
  maintenance: readonly ReadingSource[] = [],
  now: number = Date.now(),
): HoursTimeline {
  const live = alive(sessions).slice().sort((a, b) => a.startedAt - b.startedAt);
  const anchors: MeterReading[] = [
    { time: -Infinity, value: gen.initialHoursMin },
    ...collectReadings(live, refuels, maintenance),
  ];

  const segs = live.map((s) => {
    const end = s.endedAt ?? Math.max(now, s.startedAt);
    const durMin = (end - s.startedAt) / MINUTE;
    const total = sessionMinutes(s, now);
    const rate = durMin > 0 ? total / durMin : 0; // хв мотогодин за хв реального часу
    return { start: s.startedAt, end, rate, total, durMin };
  });

  const worked = (from: number, to: number): number => {
    if (to <= from) return 0;
    let sum = 0;
    for (const g of segs) {
      if (g.durMin <= 0) {
        // миттєва сесія з показниками лічильника
        if (g.start > from && g.start <= to) sum += g.total;
        continue;
      }
      const a = Math.max(from, g.start);
      const b = Math.min(to, g.end);
      if (b > a) sum += ((b - a) / MINUTE) * g.rate;
    }
    return sum;
  };

  const at = (t: number): number => {
    let anchor = anchors[0]!;
    for (const a of anchors) {
      if (a.time <= t) anchor = a;
      else break;
    }
    return anchor.value + worked(anchor.time, t);
  };

  return { at, worked };
}

/** Поточні мотогодини (хв). */
export function currentHoursMin(
  gen: Pick<Generator, 'initialHoursMin' | 'createdAt'>,
  sessions: readonly SessionLike[],
  refuels: readonly ReadingSource[] = [],
  maintenance: readonly ReadingSource[] = [],
  now: number = Date.now(),
): number {
  return buildTimeline(gen, sessions, refuels, maintenance, now).at(now);
}

/** Мотогодини (хв) за період [from, to]. */
export function hoursForPeriod(sessions: readonly SessionLike[], from: number, to: number, now = Date.now()): number {
  return buildTimeline({ initialHoursMin: 0, createdAt: 0 }, sessions, [], [], now).worked(from, to);
}

/** Відкрита (поточна) сесія генератора. */
export function openSession<T extends SessionLike>(sessions: readonly T[]): T | undefined {
  return sessions.find((s) => s.deletedAt === null && s.endedAt === null);
}

export type { SessionLike, ReadingSource };
