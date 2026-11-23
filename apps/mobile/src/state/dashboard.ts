import { buildDashboard, type Dashboard } from '@gen/shared';
import type { Repositories } from '../repositories';

/** Збирає вхідні дані для головної з репозиторіїв. */
export function loadDashboard(r: Repositories, now = Date.now()): Dashboard {
  return buildDashboard({
    generators: r.generators.list(),
    sessions: r.sessions.listAll(),
    refuels: r.refuels.listAll(),
    maintenance: r.maintenance.listAll(),
    receipts: r.fuel.receipts.list(),
    issues: r.fuel.issues.list(),
    inventories: r.fuel.inventories.list(),
    fuelTypes: r.fuel.types.list({ includeInactive: true }),
    settings: r.settings.get(),
    now,
  });
}
