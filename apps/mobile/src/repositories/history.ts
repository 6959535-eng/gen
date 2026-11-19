import type { GeneratorHistory, Maintenance, Refuel, WorkSession } from '@gen/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { maintenance, refuels, workSessions } from '../db/schema';
import type { DbOrTx } from '../db/types';

/** Уся (неудалена) історія генератора — для валідації й розрахунків. */
export function loadHistory(db: DbOrTx, generatorId: string): GeneratorHistory & {
  sessions: WorkSession[];
  refuels: Refuel[];
  maintenance: Maintenance[];
} {
  return {
    sessions: db
      .select()
      .from(workSessions)
      .where(and(eq(workSessions.generatorId, generatorId), isNull(workSessions.deletedAt)))
      .all() as WorkSession[],
    refuels: db
      .select()
      .from(refuels)
      .where(and(eq(refuels.generatorId, generatorId), isNull(refuels.deletedAt)))
      .all() as Refuel[],
    maintenance: db
      .select()
      .from(maintenance)
      .where(and(eq(maintenance.generatorId, generatorId), isNull(maintenance.deletedAt)))
      .all() as Maintenance[],
  };
}
