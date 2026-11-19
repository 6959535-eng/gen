import type { Generator, Maintenance } from '../schemas/entities';

export interface ServiceStatus {
  /** Мотогодини (хв) на момент останнього ТО (або початкові) */
  baseMin: number;
  lastServiceAt: number | null;
  /** Скільки хвилин мотогодин лишилося до ТО (від'ємне — прострочено) */
  remainingMin: number;
  /** Частка інтервалу, що лишилася (0..1, може бути < 0) */
  remainingRatio: number;
  warn: boolean;
  overdue: boolean;
}

/**
 * До наступного ТО. Відлік — від показника останнього ТО, що скидає інтервал;
 * якщо ТО ще не було — від мотогодин на момент внесення генератора.
 */
export function serviceStatus(
  gen: Pick<Generator, 'id' | 'initialHoursMin' | 'serviceIntervalMin'>,
  maintenance: readonly Pick<Maintenance, 'generatorId' | 'at' | 'meterMin' | 'resetsInterval' | 'deletedAt'>[],
  currentMin: number,
  warnPct: number,
): ServiceStatus {
  let last: (typeof maintenance)[number] | null = null;
  for (const m of maintenance) {
    if (m.deletedAt !== null || !m.resetsInterval || m.generatorId !== gen.id) continue;
    if (!last || m.at > last.at) last = m;
  }
  const baseMin = last ? last.meterMin : gen.initialHoursMin;
  const remainingMin = gen.serviceIntervalMin - (currentMin - baseMin);
  const remainingRatio = remainingMin / gen.serviceIntervalMin;
  return {
    baseMin,
    lastServiceAt: last?.at ?? null,
    remainingMin,
    remainingRatio,
    warn: remainingRatio < warnPct / 100,
    overdue: remainingMin <= 0,
  };
}
