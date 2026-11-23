import type { FuelInventory, FuelIssue, FuelReceipt } from '../schemas/entities';

/**
 * Склад пального ведеться окремо від генераторів:
 * надходження (+), видача (−), інвентаризація (фактичний залишок на дату).
 * Заправки генераторів на склад не впливають.
 */
export interface StockMovement {
  id: string;
  at: number;
  fuelTypeId: string;
  kind: 'receipt' | 'issue' | 'inventory';
  /** + надходження, − видача; для інвентаризації — різниця «факт − облік» (нестача < 0, надлишок > 0) */
  deltaMl: number;
  /** Залишок після цього запису */
  balanceMl: number;
  /** Видача: кому / куди; надходження: від кого */
  party: string;
}

type Receipt = Pick<FuelReceipt, 'id' | 'at' | 'fuelTypeId' | 'volumeMl' | 'supplier' | 'deletedAt'>;
type Issue = Pick<FuelIssue, 'id' | 'at' | 'fuelTypeId' | 'volumeMl' | 'recipient' | 'deletedAt'>;
type Inventory = Pick<FuelInventory, 'id' | 'at' | 'fuelTypeId' | 'actualMl' | 'deletedAt'>;

const ORDER = { inventory: 0, receipt: 1, issue: 2 } as const;

/**
 * Рух пального з наростаючим залишком, від нових до старих.
 * Інвентаризація встановлює залишок (у той самий момент — до надходжень і видач).
 */
export function stockMovements(
  receipts: readonly Receipt[],
  issues: readonly Issue[],
  inventories: readonly Inventory[] = [],
): StockMovement[] {
  type Ev = { id: string; at: number; fuelTypeId: string; kind: StockMovement['kind']; ml: number; party: string };
  const ev: Ev[] = [];
  for (const r of receipts) if (r.deletedAt === null) ev.push({ id: r.id, at: r.at, fuelTypeId: r.fuelTypeId, kind: 'receipt', ml: r.volumeMl, party: r.supplier });
  for (const r of issues) if (r.deletedAt === null) ev.push({ id: r.id, at: r.at, fuelTypeId: r.fuelTypeId, kind: 'issue', ml: r.volumeMl, party: r.recipient });
  for (const r of inventories) if (r.deletedAt === null) ev.push({ id: r.id, at: r.at, fuelTypeId: r.fuelTypeId, kind: 'inventory', ml: r.actualMl, party: '' });
  ev.sort((a, b) => a.at - b.at || ORDER[a.kind] - ORDER[b.kind] || a.id.localeCompare(b.id));

  const bal = new Map<string, number>();
  const out: StockMovement[] = [];
  for (const e of ev) {
    const before = bal.get(e.fuelTypeId) ?? 0;
    const after = e.kind === 'receipt' ? before + e.ml : e.kind === 'issue' ? before - e.ml : e.ml;
    bal.set(e.fuelTypeId, after);
    out.push({ id: e.id, at: e.at, fuelTypeId: e.fuelTypeId, kind: e.kind, deltaMl: after - before, balanceMl: after, party: e.party });
  }
  return out.reverse();
}

/** Поточний залишок по кожному типу пального (мл). */
export function stockBalance(movements: readonly StockMovement[]): Map<string, number> {
  const m = new Map<string, number>();
  // movements — від нових до старих: перший трапляється найсвіжіший залишок
  for (const x of movements) if (!m.has(x.fuelTypeId)) m.set(x.fuelTypeId, x.balanceMl);
  return m;
}

/** Дата останньої інвентаризації по кожному типу. */
export function lastInventoryAt(inventories: readonly Inventory[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of inventories) {
    if (r.deletedAt !== null) continue;
    if ((m.get(r.fuelTypeId) ?? -Infinity) < r.at) m.set(r.fuelTypeId, r.at);
  }
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
