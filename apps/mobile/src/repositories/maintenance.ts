import { validateMaintenance, type Maintenance } from '@gen/shared';
import { desc, isNull } from 'drizzle-orm';
import { maintenance } from '../db/schema';
import type { RepoContext } from './context';
import { loadHistory } from './history';
import { validatedCrud } from './validated';

export function maintenanceRepo(ctx: RepoContext) {
  const base = validatedCrud(ctx, 'maintenance', {
    label: 'Обслуговування',
    validate: (tx, m) => validateMaintenance(m, loadHistory(tx, m.generatorId), ctx.now()),
  });
  return {
    ...base,
    listAll(): Maintenance[] {
      return ctx.db
        .select()
        .from(maintenance)
        .where(isNull(maintenance.deletedAt))
        .orderBy(desc(maintenance.at))
        .all() as Maintenance[];
    },
    listByGenerator: (generatorId: string) =>
      loadHistory(ctx.db, generatorId).maintenance.sort((a, b) => b.at - a.at),
  };
}
