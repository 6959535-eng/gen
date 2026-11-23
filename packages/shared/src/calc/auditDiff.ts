import { formatDateTime, formatLiters, formatMotoHours, formatNumber } from '../format';
import { LABELS, META_KEYS } from '../schemas/entities';

/** Українські назви полів для журналу змін. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Назва / імʼя',
  role: 'Роль',
  isActive: 'Активний',
  pinHash: 'PIN',
  code: 'Код',
  inventoryNo: 'Інвентарний номер',
  model: 'Модель',
  powerW: 'Потужність',
  fuelTypeId: 'Тип пального',
  tankMl: 'Обʼєм бака',
  normMlPerH: 'Норма витрати',
  initialHoursMin: 'Початкові мотогодини',
  serviceIntervalMin: 'Інтервал ТО',
  status: 'Статус',
  responsible: 'Відповідальний',
  note: 'Примітка',
  generatorId: 'Генератор',
  startedAt: 'Початок',
  endedAt: 'Кінець',
  startMeterMin: 'Лічильник на початку',
  endMeterMin: 'Лічильник у кінці',
  at: 'Дата й час',
  volumeMl: 'Літри',
  isFull: 'До повного бака',
  source: 'Джерело',
  meterMin: 'Мотогодини',
  supplier: 'Від кого',
  recipient: 'Кому / куди',
  actualMl: 'Фактичний залишок',
  kind: 'Тип',
  resetsInterval: 'Скидає інтервал ТО',
  description: 'Опис',
  performedBy: 'Хто виконав',
  key: 'Параметр',
  valueJson: 'Значення',
  deletedAt: 'Видалено',
};

const HIDDEN = new Set(['pinSalt', 'pinAlgo', ...META_KEYS.filter((k) => k !== 'deletedAt')]);

export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface DiffContext {
  /** id → назва (генератори, типи пального, користувачі) */
  names?: ReadonlyMap<string, string>;
}

export function formatFieldValue(field: string, v: unknown, ctx: DiffContext = {}): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'pinHash') return '••••';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (typeof v === 'number') {
    if (field === 'at' || field.endsWith('At')) return formatDateTime(v);
    if (field.endsWith('Ml')) return formatLiters(v);
    if (field === 'normMlPerH') return `${formatNumber(v / 1000, 2)} л/год`;
    if (field.endsWith('Min')) return `${formatMotoHours(v)} мгод`;
    if (field === 'powerW') return `${formatNumber(v / 1000, 1)} кВт`;
    return formatNumber(v, 2);
  }
  if (typeof v === 'string') {
    if (field.endsWith('Id')) return ctx.names?.get(v) ?? v.slice(0, 8);
    if (field === 'role') return LABELS.role[v as 'admin'] ?? v;
    if (field === 'status') return LABELS.generatorStatus[v as 'active'] ?? v;
    if (field === 'source') return LABELS.refuelSource[v as 'warehouse'] ?? v;
    if (field === 'kind') return LABELS.maintenanceKind[v as 'oil'] ?? v;
    return v;
  }
  return JSON.stringify(v);
}

/** Які поля змінились між двома версіями запису (для створення — усі заповнені поля). */
export function diffRecords(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  ctx: DiffContext = {},
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (HIDDEN.has(k)) continue;
    const b = before?.[k];
    const a = after?.[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    if (!before && (a === null || a === '' || a === undefined)) continue;
    out.push({ field: k, label: FIELD_LABELS[k] ?? k, before: formatFieldValue(k, b, ctx), after: formatFieldValue(k, a, ctx) });
  }
  return out;
}

export function parseAuditJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}
