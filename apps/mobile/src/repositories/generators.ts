import type { Generator } from '@gen/shared';
import { asc, isNull } from 'drizzle-orm';
import { generators } from '../db/schema';
import { crud, type Fields } from './base';
import type { RepoContext } from './context';

export function generatorsRepo(ctx: RepoContext) {
  const base = crud(ctx, 'generators');
  return {
    ...base,
    /** Усі неудалені; списані — в кінці. */
    list(opts: { includeDecommissioned?: boolean } = {}): Generator[] {
      const rows = ctx.db
        .select()
        .from(generators)
        .where(isNull(generators.deletedAt))
        .orderBy(asc(generators.name))
        .all() as Generator[];
      const filtered = opts.includeDecommissioned ? rows : rows.filter((g) => g.status !== 'decommissioned');
      return filtered.sort(
        (a, b) => Number(a.status === 'decommissioned') - Number(b.status === 'decommissioned'),
      );
    },
    create(fields: Fields<'generators'>) {
      return base.create(fields);
    },
  };
}
