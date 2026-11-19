import type { Refuel } from '../schemas/entities';
import type { HoursTimeline } from './hours';

type RefuelLike = Pick<Refuel, 'id' | 'at' | 'volumeMl' | 'isFull' | 'meterMin' | 'deletedAt'>;

export interface ConsumptionInterval {
  fromRefuelId: string;
  toRefuelId: string;
  from: number;
  to: number;
  /** Літри (мл), залиті після першої «до повного» включно з другою */
  volumeMl: number;
  /** Напрацювання між заправками, хв */
  workedMin: number;
  /** Фактична витрата, мл/год; null — якщо напрацювання 0 */
  mlPerHour: number | null;
  /** Відхилення від норми, частка (0,2 = +20 %) */
  deviation: number | null;
  /** Відхилення перевищує поріг */
  flagged: boolean;
}

/**
 * Фактична витрата між послідовними заправками «до повного бака».
 * Між F1 і F2 спалено рівно стільки, скільки долито в (F1, F2] — бо обидва рази бак повний.
 */
export function consumptionIntervals(
  refuels: readonly RefuelLike[],
  timeline: HoursTimeline,
  normMlPerH: number,
  thresholdPct: number,
): ConsumptionInterval[] {
  const live = refuels
    .filter((r) => r.deletedAt === null)
    .slice()
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const meterAt = (r: RefuelLike) => r.meterMin ?? timeline.at(r.at);

  const out: ConsumptionInterval[] = [];
  let prevFull: RefuelLike | null = null;
  let acc = 0;
  for (const r of live) {
    if (prevFull) acc += r.volumeMl;
    if (!r.isFull) continue;
    if (prevFull) {
      const workedMin = meterAt(r) - meterAt(prevFull);
      const mlPerHour = workedMin > 0 ? acc / (workedMin / 60) : null;
      const deviation = mlPerHour !== null && normMlPerH > 0 ? (mlPerHour - normMlPerH) / normMlPerH : null;
      out.push({
        fromRefuelId: prevFull.id,
        toRefuelId: r.id,
        from: prevFull.at,
        to: r.at,
        volumeMl: acc,
        workedMin,
        mlPerHour,
        deviation,
        flagged: deviation !== null && Math.abs(deviation) * 100 > thresholdPct,
      });
    }
    prevFull = r;
    acc = 0;
  }
  return out;
}

export interface AverageConsumption {
  mlPerHour: number;
  volumeMl: number;
  workedMin: number;
}

/** Середня фактична витрата за інтервалами (зважена: Σ літрів / Σ годин). */
export function averageConsumption(
  intervals: readonly ConsumptionInterval[],
  since = -Infinity,
): AverageConsumption | null {
  let v = 0;
  let w = 0;
  for (const i of intervals) {
    if (i.to < since || i.mlPerHour === null) continue;
    v += i.volumeMl;
    w += i.workedMin;
  }
  return w > 0 ? { mlPerHour: v / (w / 60), volumeMl: v, workedMin: w } : null;
}
