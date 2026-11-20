import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '../crypto/random';
import {
  ENTITY_NAMES,
  META_KEYS,
  type AuditEntry,
  type Dataset,
  type EntityName,
  type Meta,
} from '../schemas/entities';
import { canonicalJson } from './canonical';

type Row = Meta & Record<string, unknown>;

export interface MergeConflict {
  entity: EntityName;
  id: string;
  local: Row;
  incoming: Row;
  winner: 'local' | 'incoming';
}

export interface EntityMergePlan {
  /** Нових записів (немає локально) */
  inserts: Row[];
  /** Вхідний запис переміг — замінює локальний */
  updates: { local: Row; incoming: Row }[];
  /** Локальний запис переміг (вхідний старіший) */
  keptLocal: number;
  /** Записи ідентичні */
  unchanged: number;
}

export interface MergePlan {
  entities: Record<EntityName, EntityMergePlan>;
  conflicts: MergeConflict[];
  totals: { inserts: number; updates: number; conflicts: number; unchanged: number; keptLocal: number };
  /** true — нічого застосовувати не треба */
  isNoop: boolean;
}

/** Поля запису без службових (крім deletedAt — видалення теж «зміст»). */
function payload(r: Row): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'deletedAt' || !(META_KEYS as string[]).includes(k)) o[k] = v;
  }
  return canonicalJson(o);
}

/**
 * Порядок версій для last-write-wins: більший updated_at, при рівності — більший device_id,
 * при повній рівності — лексикографічно більший вміст (щоб результат був однаковий на всіх телефонах).
 * > 0 — a новіший.
 */
export function compareVersions(a: Row, b: Row): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  const ca = canonicalJson(a);
  const cb = canonicalJson(b);
  return ca === cb ? 0 : ca < cb ? -1 : 1;
}

/**
 * Конфлікт = обидві сторони змінювали запис незалежно. Ознаки:
 * однакова version (обидва відредагували з тієї ж базової версії) або
 * version і updated_at «суперечать» одна одній (більше правок, але старіший час).
 */
export function isConflict(local: Row, incoming: Row): boolean {
  if (payload(local) === payload(incoming)) return false;
  if (local.version === incoming.version) return true;
  return Math.sign(incoming.version - local.version) !== Math.sign(incoming.updatedAt - local.updatedAt);
}

/**
 * Будує план злиття вхідного набору даних у локальний. Нічого не змінює.
 * Ідемпотентно: plan(merge(L, I), I) — порожній.
 */
export function planMerge(local: Dataset, incoming: Dataset): MergePlan {
  const entities = {} as Record<EntityName, EntityMergePlan>;
  const conflicts: MergeConflict[] = [];
  const totals = { inserts: 0, updates: 0, conflicts: 0, unchanged: 0, keptLocal: 0 };

  for (const name of ENTITY_NAMES) {
    const plan: EntityMergePlan = { inserts: [], updates: [], keptLocal: 0, unchanged: 0 };
    const byId = new Map<string, Row>();
    for (const r of local[name] as unknown as Row[]) byId.set(r.id, r);
    const seen = new Set<string>();

    for (const inc of incoming[name] as unknown as Row[]) {
      if (seen.has(inc.id)) continue; // дубль усередині файла
      seen.add(inc.id);
      const loc = byId.get(inc.id);
      if (!loc) {
        plan.inserts.push(inc);
        continue;
      }
      // Журнал змін лише доповнюється.
      if (name === 'auditLog') {
        plan.unchanged++;
        continue;
      }
      const cmp = compareVersions(inc, loc);
      if (cmp === 0) {
        plan.unchanged++;
        continue;
      }
      const conflict = isConflict(loc, inc);
      if (conflict) {
        conflicts.push({ entity: name, id: inc.id, local: loc, incoming: inc, winner: cmp > 0 ? 'incoming' : 'local' });
      }
      if (cmp > 0) plan.updates.push({ local: loc, incoming: inc });
      else plan.keptLocal++;
    }
    entities[name] = plan;
    totals.inserts += plan.inserts.length;
    totals.updates += plan.updates.length;
    totals.unchanged += plan.unchanged;
    totals.keptLocal += plan.keptLocal;
  }
  totals.conflicts = conflicts.length;
  return { entities, conflicts, totals, isNoop: totals.inserts === 0 && totals.updates === 0 };
}

/** Записи, які треба вставити/замінити, згруповані по таблицях. */
export function rowsToWrite(plan: MergePlan): Record<EntityName, Row[]> {
  const out = {} as Record<EntityName, Row[]>;
  for (const name of ENTITY_NAMES) {
    const p = plan.entities[name];
    out[name] = [...p.inserts, ...p.updates.map((u) => u.incoming)];
  }
  return out;
}

/** Детермінований UUID (формат v7) з префіксом часу ts і хешем рядка key. */
export function deterministicId(ts: number, key: string): string {
  const h = sha256(new TextEncoder().encode(key));
  const b = new Uint8Array(16);
  let t = Math.max(0, Math.floor(ts));
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  for (let i = 6; i < 16; i++) b[i] = h[i]!;
  b[6] = 0x70 | (b[6]! & 0x0f);
  b[8] = 0x80 | (b[8]! & 0x3f);
  const x = bytesToHex(b);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Записи журналу про конфлікти. id детермінований — повторний імпорт того самого файла
 * не створить дублікати навіть коли переміг локальний запис.
 */
export function conflictAuditEntries(
  plan: MergePlan,
  ctx: { actorId: string; deviceId: string; now: number },
): AuditEntry[] {
  return plan.conflicts.map((c) => {
    const key = `conflict|${c.entity}|${c.id}|${canonicalJson(c.local)}|${canonicalJson(c.incoming)}`;
    const id = deterministicId(Math.max(c.local.updatedAt, c.incoming.updatedAt), key);
    return {
      id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      authorId: ctx.actorId,
      deviceId: ctx.deviceId,
      version: 1,
      at: ctx.now,
      action: 'import_conflict',
      entity: c.entity,
      entityId: c.id,
      beforeJson: JSON.stringify(c.local),
      afterJson: JSON.stringify(c.incoming),
      note: c.winner === 'incoming' ? 'Застосовано версію з файла (новіша)' : 'Залишено локальну версію (новіша)',
    };
  });
}

/** Застосовує план до набору даних у памʼяті (для тестів і для сервера). */
export function applyMergeInMemory(local: Dataset, plan: MergePlan, extraAudit: AuditEntry[] = []): Dataset {
  const writes = rowsToWrite(plan);
  const out = {} as Record<EntityName, Row[]>;
  for (const name of ENTITY_NAMES) {
    const map = new Map<string, Row>();
    for (const r of local[name] as unknown as Row[]) map.set(r.id, r);
    for (const r of writes[name]) map.set(r.id, r);
    if (name === 'auditLog') for (const a of extraAudit) if (!map.has(a.id)) map.set(a.id, a as unknown as Row);
    out[name] = [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return out as unknown as Dataset;
}
