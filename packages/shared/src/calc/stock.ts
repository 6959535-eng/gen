import type { FuelReceipt, Refuel } from '../schemas/entities';

export interface StockMovement {
  id: string;
  at: number;
  fuelTypeId: string;
  /** + надходження, − видача */
  deltaMl: number;
  kind: 'receipt' | 'issue';
  generatorId: string | null;
}

/** Рух пального на складі: надходження та заправки з джерелом «склад». */
export function stockMovements(
  receipts: readonly Pick<FuelReceipt, 'id' | 'at' | 'fuelTypeId' | 'volumeMl' | 'deletedAt'>[],
  refuels: readonly Pick<Refuel, 'id' | 'at' | 'fuelTypeId' | 'volumeMl' | 'source' | 'generatorId' | 'deletedAt'>[],
): StockMovement[] {
  const out: StockMovement[] = [];
  for (const r of receipts) {
    if (r.deletedAt !== null) continue;
    out.push({ id: r.id, at: r.at, fuelTypeId: r.fuelTypeId, deltaMl: r.volumeMl, kind: 'receipt', generatorId: null });
  }
  for (const r of refuels) {
    if (r.deletedAt !== null || r.source !== 'warehouse') continue;
    out.push({ id: r.id, at: r.at, fuelTypeId: r.fuelTypeId, deltaMl: -r.volumeMl, kind: 'issue', generatorId: r.generatorId });
  }
  return out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/** Залишок по кожному типу пального (мл). Може бути від'ємним, якщо надходження не внесли. */
export function stockBalance(movements: readonly StockMovement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of movements) m.set(x.fuelTypeId, (m.get(x.fuelTypeId) ?? 0) + x.deltaMl);
  return m;
}

/**
 * На скільки мотогодин вистачить залишку при поточній середній витраті (мл/год).
 * null — немає даних про витрату або залишок ≤ 0.
 */
export function stockHoursLeft(balanceMl: number, avgMlPerHour: number | null): number | null {
  if (!avgMlPerHour || avgMlPerHour <= 0 || balanceMl <= 0) return null;
  return balanceMl / avgMlPerHour;
}
