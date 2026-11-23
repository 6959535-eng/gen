import {
  formatLiters,
  MINUTE,
  stockBalance,
  stockMovements,
  type FuelInventory,
  type FuelIssue,
  type FuelReceipt,
  type FuelType,
  type ValidationResult,
} from '@gen/shared';
import { asc, desc, isNull } from 'drizzle-orm';
import { fuelInventories, fuelIssues, fuelReceipts, fuelTypes } from '../db/schema';
import type { DbOrTx } from '../db/types';
import { crud, getById } from './base';
import type { RepoContext } from './context';
import { validatedCrud } from './validated';

/**
 * Склад пального — окремо від генераторів: надходження, видача, інвентаризація.
 * Заправки генераторів на склад не впливають.
 */
export function fuelRepo(ctx: RepoContext) {
  const basic = (tx: DbOrTx, r: { fuelTypeId: string; at: number }): ValidationResult => {
    const res: ValidationResult = { errors: [], warnings: [] };
    const ft = getById(tx, 'fuelTypes', r.fuelTypeId);
    if (!ft || ft.deletedAt !== null) res.errors.push({ code: 'fuel_type', message: 'Оберіть тип пального' });
    if (r.at > ctx.now() + 5 * MINUTE) res.errors.push({ code: 'in_future', message: 'Дата в майбутньому' });
    return res;
  };

  const all = (tx: DbOrTx) => ({
    receipts: tx.select().from(fuelReceipts).all() as FuelReceipt[],
    issues: tx.select().from(fuelIssues).all() as FuelIssue[],
    inventories: tx.select().from(fuelInventories).all() as FuelInventory[],
  });

  /** Залишок типу пального на момент at, не враховуючи запис excludeId (для перевірки редагування). */
  const balanceAt = (tx: DbOrTx, fuelTypeId: string, at: number, excludeId: string): number => {
    const d = all(tx);
    const f = <T extends { id: string; at: number }>(xs: T[]) => xs.filter((x) => x.id !== excludeId && x.at <= at);
    return stockBalance(stockMovements(f(d.receipts), f(d.issues), f(d.inventories))).get(fuelTypeId) ?? 0;
  };

  const receipts = validatedCrud(ctx, 'fuelReceipts', {
    label: 'Надходження',
    validate: (tx, r) => {
      const res = basic(tx, r);
      if (!(r.volumeMl > 0)) res.errors.push({ code: 'volume', message: 'Кількість літрів має бути більше 0' });
      return res;
    },
  });

  const issues = validatedCrud(ctx, 'fuelIssues', {
    label: 'Видача',
    validate: (tx, r) => {
      const res = basic(tx, r);
      if (!(r.volumeMl > 0)) res.errors.push({ code: 'volume', message: 'Кількість літрів має бути більше 0' });
      if (!res.errors.length) {
        const bal = balanceAt(tx, r.fuelTypeId, r.at, r.id);
        if (r.volumeMl > bal) {
          res.warnings.push({
            code: 'over_stock',
            message: `За обліком на складі ${formatLiters(Math.max(0, bal))} — видаєте більше. Усе правильно?`,
          });
        }
      }
      return res;
    },
  });

  const inventories = validatedCrud(ctx, 'fuelInventories', {
    label: 'Інвентаризація',
    validate: (tx, r) => {
      const res = basic(tx, r);
      if (r.actualMl < 0) res.errors.push({ code: 'volume', message: 'Залишок не може бути відʼємним' });
      return res;
    },
  });

  const types = crud(ctx, 'fuelTypes');
  const listOf = <T>(table: typeof fuelReceipts | typeof fuelIssues | typeof fuelInventories) =>
    ctx.db.select().from(table).where(isNull(table.deletedAt)).orderBy(desc(table.at)).all() as T[];

  return {
    receipts: { ...receipts, list: () => listOf<FuelReceipt>(fuelReceipts) },
    issues: { ...issues, list: () => listOf<FuelIssue>(fuelIssues) },
    inventories: { ...inventories, list: () => listOf<FuelInventory>(fuelInventories) },
    /** Обліковий залишок зараз (для підказки у формі інвентаризації). */
    balanceNow: (fuelTypeId: string) => balanceAt(ctx.db, fuelTypeId, ctx.now() + 1, ''),
    types: {
      ...types,
      list(opts: { includeInactive?: boolean } = {}): FuelType[] {
        const rows = ctx.db
          .select()
          .from(fuelTypes)
          .where(isNull(fuelTypes.deletedAt))
          .orderBy(asc(fuelTypes.code))
          .all() as FuelType[];
        return opts.includeInactive ? rows : rows.filter((t) => t.isActive);
      },
    },
  };
}
