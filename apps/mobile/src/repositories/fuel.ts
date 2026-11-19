import { MINUTE, type FuelReceipt, type FuelType, type ValidationResult } from '@gen/shared';
import { asc, desc, isNull } from 'drizzle-orm';
import { fuelReceipts, fuelTypes } from '../db/schema';
import { crud, getById } from './base';
import type { RepoContext } from './context';
import { validatedCrud } from './validated';

export function fuelRepo(ctx: RepoContext) {
  const receipts = validatedCrud(ctx, 'fuelReceipts', {
    label: 'Надходження',
    validate: (tx, r): ValidationResult => {
      const res: ValidationResult = { errors: [], warnings: [] };
      const ft = getById(tx, 'fuelTypes', r.fuelTypeId);
      if (!ft || ft.deletedAt !== null) res.errors.push({ code: 'fuel_type', message: 'Оберіть тип пального' });
      if (!(r.volumeMl > 0)) res.errors.push({ code: 'volume', message: 'Кількість літрів має бути більше 0' });
      if (r.at > ctx.now() + 5 * MINUTE) res.errors.push({ code: 'in_future', message: 'Дата в майбутньому' });
      return res;
    },
  });
  const types = crud(ctx, 'fuelTypes');
  return {
    receipts: {
      ...receipts,
      list(): FuelReceipt[] {
        return ctx.db
          .select()
          .from(fuelReceipts)
          .where(isNull(fuelReceipts.deletedAt))
          .orderBy(desc(fuelReceipts.at))
          .all() as FuelReceipt[];
      },
    },
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
