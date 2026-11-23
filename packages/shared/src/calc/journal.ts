import {
  formatLiters,
  formatMotoHours,
  formatDuration,
} from '../format';
import {
  LABELS,
  type FuelInventory,
  type FuelIssue,
  type FuelReceipt,
  type Generator,
  type Maintenance,
  type Refuel,
  type WorkSession,
} from '../schemas/entities';
import { sessionMinutes } from './hours';

export const JOURNAL_KINDS = ['session', 'refuel', 'maintenance', 'receipt', 'issue', 'inventory'] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];
export const JOURNAL_KIND_LABELS: Record<JournalKind, string> = {
  session: 'Робота',
  refuel: 'Заправка',
  maintenance: 'ТО',
  receipt: 'Надходження',
  issue: 'Видача',
  inventory: 'Інвентаризація',
};

export interface JournalItem {
  kind: JournalKind;
  id: string;
  at: number;
  generatorId: string | null;
  authorId: string;
  createdAt: number;
  title: string;
  details: string;
  /** Відкрита сесія */
  running?: boolean;
  /** Підсвітити (відхилення витрати) */
  flagged?: boolean;
}

export interface JournalFilter {
  generatorId?: string;
  kinds?: readonly JournalKind[];
  from?: number;
  to?: number;
  authorId?: string;
}

export interface JournalInput {
  generators: readonly Generator[];
  sessions: readonly WorkSession[];
  refuels: readonly Refuel[];
  maintenance: readonly Maintenance[];
  receipts: readonly FuelReceipt[];
  issues?: readonly FuelIssue[];
  inventories?: readonly FuelInventory[];
  fuelTypeNames: ReadonlyMap<string, string>;
  /** id заправок, після яких витрата відхилилась від норми */
  flaggedRefuelIds?: ReadonlySet<string>;
  now: number;
}

/** Єдиний список записів для екрана «Журнал», від нових до старих. */
export function buildJournal(i: JournalInput, f: JournalFilter = {}): JournalItem[] {
  const gName = new Map(i.generators.map((g) => [g.id, g.name]));
  const name = (id: string) => gName.get(id) ?? '—';
  const kinds = new Set(f.kinds?.length ? f.kinds : JOURNAL_KINDS);
  const out: JournalItem[] = [];

  if (kinds.has('session')) {
    for (const s of i.sessions) {
      if (s.deletedAt !== null) continue;
      const min = sessionMinutes(s, i.now);
      const meters =
        s.startMeterMin !== null || s.endMeterMin !== null
          ? ` · лічильник ${s.startMeterMin !== null ? formatMotoHours(s.startMeterMin) : '?'}→${s.endMeterMin !== null ? formatMotoHours(s.endMeterMin) : '…'}`
          : '';
      out.push({
        kind: 'session',
        id: s.id,
        at: s.startedAt,
        generatorId: s.generatorId,
        authorId: s.authorId,
        createdAt: s.createdAt,
        title: `${name(s.generatorId)} — ${s.endedAt === null ? 'працює' : 'робота'}`,
        details: `${formatDuration(min * 60_000)} (${formatMotoHours(min)} мгод)${meters}${s.note ? ` · ${s.note}` : ''}`,
        running: s.endedAt === null,
      });
    }
  }
  if (kinds.has('refuel')) {
    for (const r of i.refuels) {
      if (r.deletedAt !== null) continue;
      out.push({
        kind: 'refuel',
        id: r.id,
        at: r.at,
        generatorId: r.generatorId,
        authorId: r.authorId,
        createdAt: r.createdAt,
        title: `${name(r.generatorId)} — заправка ${formatLiters(r.volumeMl)}`,
        details: [
          r.isFull ? 'до повного' : 'доливка',
          LABELS.refuelSource[r.source],
          r.meterMin !== null ? `${formatMotoHours(r.meterMin)} мгод` : null,
          r.note || null,
        ]
          .filter(Boolean)
          .join(' · '),
        flagged: i.flaggedRefuelIds?.has(r.id),
      });
    }
  }
  if (kinds.has('maintenance')) {
    for (const m of i.maintenance) {
      if (m.deletedAt !== null) continue;
      out.push({
        kind: 'maintenance',
        id: m.id,
        at: m.at,
        generatorId: m.generatorId,
        authorId: m.authorId,
        createdAt: m.createdAt,
        title: `${name(m.generatorId)} — ${LABELS.maintenanceKind[m.kind]}`,
        details: [`${formatMotoHours(m.meterMin)} мгод`, m.description || null, m.performedBy || null]
          .filter(Boolean)
          .join(' · '),
      });
    }
  }
  if (kinds.has('receipt') && !f.generatorId) {
    for (const r of i.receipts) {
      if (r.deletedAt !== null) continue;
      out.push({
        kind: 'receipt',
        id: r.id,
        at: r.at,
        generatorId: null,
        authorId: r.authorId,
        createdAt: r.createdAt,
        title: `Склад +${formatLiters(r.volumeMl)} ${i.fuelTypeNames.get(r.fuelTypeId) ?? ''}`.trim(),
        details: [r.supplier || null, r.note || null].filter(Boolean).join(' · '),
      });
    }
  }

  if (kinds.has('issue') && !f.generatorId) {
    for (const r of i.issues ?? []) {
      if (r.deletedAt !== null) continue;
      out.push({
        kind: 'issue',
        id: r.id,
        at: r.at,
        generatorId: null,
        authorId: r.authorId,
        createdAt: r.createdAt,
        title: `Склад −${formatLiters(r.volumeMl)} ${i.fuelTypeNames.get(r.fuelTypeId) ?? ''}`.trim(),
        details: [r.recipient ? `кому: ${r.recipient}` : null, r.note || null].filter(Boolean).join(' · '),
      });
    }
  }
  if (kinds.has('inventory') && !f.generatorId) {
    for (const r of i.inventories ?? []) {
      if (r.deletedAt !== null) continue;
      out.push({
        kind: 'inventory',
        id: r.id,
        at: r.at,
        generatorId: null,
        authorId: r.authorId,
        createdAt: r.createdAt,
        title: `Інвентаризація: ${formatLiters(r.actualMl)} ${i.fuelTypeNames.get(r.fuelTypeId) ?? ''}`.trim(),
        details: r.note,
      });
    }
  }

  return out
    .filter(
      (x) =>
        (!f.generatorId || x.generatorId === f.generatorId) &&
        (!f.authorId || x.authorId === f.authorId) &&
        (f.from === undefined || x.at >= f.from) &&
        (f.to === undefined || x.at <= f.to),
    )
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}
