import { validateRefuel, type Refuel } from '@gen/shared';
import { desc, isNull } from 'drizzle-orm';
import { refuels } from '../db/schema';
import { getById } from './base';
import type { RepoContext } from './context';
import { RepoError } from './errors';
import { loadHistory } from './history';
import { validatedCrud } from './validated';

export function refuelsRepo(ctx: RepoContext) {
  const base = validatedCrud(ctx, 'refuels', {
    label: 'Заправка',
    // Тип пального фіксується з генератора в момент заправки — для обліку складу.
    prepare: (tx, f) => {
      const g = getById(tx, 'generators', f.generatorId);
      if (!g || g.deletedAt !== null) throw new RepoError('not_found', 'Генератор не знайдено');
      return { ...f, fuelTypeId: g.fuelTypeId };
    },
    validate: (tx, r) => {
      const g = getById(tx, 'generators', r.generatorId);
      if (!g) throw new RepoError('not_found', 'Генератор не знайдено');
      return validateRefuel(r, g, loadHistory(tx, r.generatorId), ctx.now());
    },
  });
  return {
    ...base,
    listAll(): Refuel[] {
      return ctx.db.select().from(refuels).where(isNull(refuels.deletedAt)).orderBy(desc(refuels.at)).all() as Refuel[];
    },
    listByGenerator: (generatorId: string) =>
      loadHistory(ctx.db, generatorId).refuels.sort((a, b) => b.at - a.at),
  };
}

/** Поля для швидкої заправки (тип пального підставиться з генератора). */
export type RefuelInput = Omit<Refuel, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'authorId' | 'deviceId' | 'version'>;
