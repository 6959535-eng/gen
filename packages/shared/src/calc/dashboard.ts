import { DAY, formatMotoHours } from '../format';
import type { AppSettings } from '../schemas/settings';
import type { FuelReceipt, FuelType, Generator, Maintenance, Refuel, WorkSession } from '../schemas/entities';
import { averageConsumption, consumptionIntervals, type ConsumptionInterval } from './consumption';
import { buildTimeline, openSession } from './hours';
import { serviceStatus, type ServiceStatus } from './service';
import { stockBalance, stockHoursLeft, stockMovements } from './stock';

export interface DashboardInput {
  generators: readonly Generator[];
  sessions: readonly WorkSession[];
  refuels: readonly Refuel[];
  maintenance: readonly Maintenance[];
  receipts: readonly FuelReceipt[];
  fuelTypes: readonly FuelType[];
  settings: AppSettings;
  now: number;
}

export interface GeneratorCard {
  generator: Generator;
  fuelType: FuelType | undefined;
  running: WorkSession | null;
  currentHoursMin: number;
  service: ServiceStatus;
  /** Середня фактична витрата (мл/год) за всю історію; null — недостатньо даних */
  avgMlPerHour: number | null;
  intervals: ConsumptionInterval[];
  lastInterval: ConsumptionInterval | null;
}

export interface StockRow {
  fuelType: FuelType;
  balanceMl: number;
  /** Витрата, за якою рахується запас: фактична за 14 днів або норма */
  rateMlPerHour: number | null;
  rateIsNorm: boolean;
  hoursLeft: number | null;
}

export type WarningLevel = 'danger' | 'warn' | 'info';
export interface DashboardWarning {
  level: WarningLevel;
  text: string;
  generatorId?: string;
}

export interface Dashboard {
  cards: GeneratorCard[];
  stock: StockRow[];
  warnings: DashboardWarning[];
}

const RATE_WINDOW = 14 * DAY;

export function buildDashboard(i: DashboardInput): Dashboard {
  const by = <T extends { generatorId: string; deletedAt: number | null }>(xs: readonly T[], id: string) =>
    xs.filter((x) => x.generatorId === id && x.deletedAt === null);
  const ftById = new Map(i.fuelTypes.map((f) => [f.id, f]));
  const warnings: DashboardWarning[] = [];

  const cards: GeneratorCard[] = i.generators
    .filter((g) => g.deletedAt === null && g.status !== 'decommissioned')
    .map((g) => {
      const sessions = by(i.sessions, g.id);
      const refuels = by(i.refuels, g.id);
      const maint = by(i.maintenance, g.id);
      const tl = buildTimeline(g, sessions, refuels, maint, i.now);
      const currentHoursMin = tl.at(i.now);
      const service = serviceStatus(g, maint, currentHoursMin, i.settings.serviceWarnPct);
      const intervals = consumptionIntervals(refuels, tl, g.normMlPerH, i.settings.deviationThresholdPct);
      const lastInterval = intervals.at(-1) ?? null;
      const avg = averageConsumption(intervals);

      if (service.overdue) {
        warnings.push({ level: 'danger', generatorId: g.id, text: `${g.name}: ТО прострочено на ${formatMotoHours(-service.remainingMin)} мгод` });
      } else if (service.warn) {
        warnings.push({ level: 'warn', generatorId: g.id, text: `${g.name}: до ТО лишилось ${formatMotoHours(service.remainingMin)} мгод` });
      }
      if (lastInterval?.flagged && lastInterval.deviation !== null) {
        const pct = Math.round(lastInterval.deviation * 100);
        warnings.push({
          level: 'warn',
          generatorId: g.id,
          text: `${g.name}: витрата ${pct > 0 ? '+' : ''}${pct}% від норми (остання заправка)`,
        });
      }
      return {
        generator: g,
        fuelType: ftById.get(g.fuelTypeId),
        running: openSession(sessions) ?? null,
        currentHoursMin,
        service,
        avgMlPerHour: avg?.mlPerHour ?? null,
        intervals,
        lastInterval,
      };
    });

  // Склад: залишок і запас годин на типи пального, що використовуються або мають рух
  const balance = stockBalance(stockMovements(i.receipts, i.refuels));
  const usedTypes = new Set([...balance.keys(), ...cards.map((c) => c.generator.fuelTypeId)]);
  const stock: StockRow[] = i.fuelTypes
    .filter((f) => f.deletedAt === null && usedTypes.has(f.id))
    .map((ft) => {
      const ofType = cards.filter((c) => c.generator.fuelTypeId === ft.id);
      const recent = ofType.flatMap((c) => c.intervals);
      const avg = averageConsumption(recent, i.now - RATE_WINDOW);
      const active = ofType.filter((c) => c.generator.status === 'active');
      const working = active.length ? active : ofType;
      const norm = working.length
        ? working.reduce((s, c) => s + c.generator.normMlPerH, 0) / working.length
        : null;
      const rate = avg?.mlPerHour ?? norm;
      const balanceMl = balance.get(ft.id) ?? 0;
      if (balanceMl <= 0 && ofType.length) {
        warnings.push({ level: 'danger', text: `${ft.name}: на складі немає пального` });
      }
      return {
        fuelType: ft,
        balanceMl,
        rateMlPerHour: rate,
        rateIsNorm: !avg && norm !== null,
        hoursLeft: stockHoursLeft(balanceMl, rate),
      };
    });

  const order: Record<WarningLevel, number> = { danger: 0, warn: 1, info: 2 };
  warnings.sort((a, b) => order[a.level] - order[b.level]);
  return { cards, stock, warnings };
}
