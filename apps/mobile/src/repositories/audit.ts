import type { AuditEntry, EntityName } from '@gen/shared';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { auditLog } from '../db/schema';
import type { RepoContext } from './context';
import { RepoError } from './errors';

export interface AuditFilter {
  entity?: EntityName;
  entityId?: string;
  actorId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

/** Журнал змін — лише для адміна. */
export function auditRepo(ctx: RepoContext) {
  return {
    list(f: AuditFilter = {}): AuditEntry[] {
      const a = ctx.actor();
      if (a?.role !== 'admin') throw new RepoError('forbidden', 'Журнал змін доступний лише адміну');
      const conds: SQL[] = [];
      if (f.entity) conds.push(eq(auditLog.entity, f.entity));
      if (f.entityId) conds.push(eq(auditLog.entityId, f.entityId));
      if (f.actorId) conds.push(eq(auditLog.authorId, f.actorId));
      if (f.from !== undefined) conds.push(gte(auditLog.at, f.from));
      if (f.to !== undefined) conds.push(lte(auditLog.at, f.to));
      return ctx.db
        .select()
        .from(auditLog)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(f.limit ?? 100)
        .offset(f.offset ?? 0)
        .all() as AuditEntry[];
    },
  };
}
