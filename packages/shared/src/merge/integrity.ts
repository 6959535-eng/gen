import { formatDateTime } from '../format';
import type { Dataset } from '../schemas/entities';
import { collectReadings } from '../calc/hours';
import { intervalsOverlap } from '../calc/validation';
import { formatMotoHours } from '../format';

export interface IntegrityIssue {
  code: 'multiple_open' | 'overlap' | 'meter_decrease' | 'missing_generator';
  generatorId: string;
  generatorName: string;
  message: string;
  /** id записів, які варто перевірити */
  recordIds: string[];
}

/** Перевірка цілісності після злиття (або будь-коли з адмінки). */
export function checkIntegrity(ds: Dataset): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const gens = new Map(ds.generators.filter((g) => g.deletedAt === null).map((g) => [g.id, g]));
  const sessionsByGen = new Map<string, Dataset['workSessions']>();
  for (const s of ds.workSessions) {
    if (s.deletedAt !== null) continue;
    if (!gens.has(s.generatorId)) {
      issues.push({
        code: 'missing_generator',
        generatorId: s.generatorId,
        generatorName: '?',
        message: `Сесія ${formatDateTime(s.startedAt)} посилається на видалений або невідомий генератор`,
        recordIds: [s.id],
      });
      continue;
    }
    const arr = sessionsByGen.get(s.generatorId) ?? [];
    arr.push(s);
    sessionsByGen.set(s.generatorId, arr);
  }

  for (const [gid, g] of gens) {
    const ss = (sessionsByGen.get(gid) ?? []).slice().sort((a, b) => a.startedAt - b.startedAt);
    const open = ss.filter((s) => s.endedAt === null);
    if (open.length > 1) {
      issues.push({
        code: 'multiple_open',
        generatorId: gid,
        generatorName: g.name,
        message: `${g.name}: ${open.length} незакриті сесії одночасно (${open.map((s) => formatDateTime(s.startedAt)).join(', ')})`,
        recordIds: open.map((s) => s.id),
      });
    }
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const a = ss[i]!;
        const b = ss[j]!;
        if (a.endedAt === null && b.endedAt === null) continue; // уже враховано вище
        if (intervalsOverlap(a.startedAt, a.endedAt, b.startedAt, b.endedAt)) {
          issues.push({
            code: 'overlap',
            generatorId: gid,
            generatorName: g.name,
            message: `${g.name}: сесії ${formatDateTime(a.startedAt)} і ${formatDateTime(b.startedAt)} перетинаються`,
            recordIds: [a.id, b.id],
          });
        }
      }
    }
    const readings = collectReadings(
      ss,
      ds.refuels.filter((r) => r.generatorId === gid),
      ds.maintenance.filter((m) => m.generatorId === gid),
    );
    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1]!;
      const cur = readings[i]!;
      if (cur.value < prev.value) {
        issues.push({
          code: 'meter_decrease',
          generatorId: gid,
          generatorName: g.name,
          message: `${g.name}: мотогодини зменшуються — ${formatDateTime(prev.time)} ${formatMotoHours(prev.value)}, ${formatDateTime(cur.time)} ${formatMotoHours(cur.value)}`,
          recordIds: [],
        });
        break;
      }
    }
  }
  return issues;
}
