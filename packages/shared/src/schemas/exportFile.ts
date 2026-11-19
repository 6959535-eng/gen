import { z } from 'zod';
import { ENTITY_SCHEMAS, zId, zTime, type Dataset } from './entities';

/** Версія схеми даних. Збільшується разом із міграціями, що змінюють формат записів. */
export const SCHEMA_VERSION = 1;
export const FILE_FORMAT = 'gen-export';
export const FILE_FORMAT_VERSION = 1;
export const FILE_EXTENSION = 'gen';

const tablesShape = Object.fromEntries(
  Object.entries(ENTITY_SCHEMAS).map(([k, s]) => [k, z.array(s)]),
) as { [K in keyof typeof ENTITY_SCHEMAS]: z.ZodArray<(typeof ENTITY_SCHEMAS)[K]> };

export const zExportPayload = z.object({
  format: z.literal(FILE_FORMAT),
  formatVersion: z.literal(FILE_FORMAT_VERSION),
  schemaVersion: z.number().int().positive(),
  kind: z.enum(['export', 'backup', 'auto-backup']),
  appVersion: z.string(),
  deviceId: zId,
  exportedAt: zTime,
  exportedBy: zId.nullable(),
  tables: z.object(tablesShape),
});
export type ExportPayload = z.infer<typeof zExportPayload>;

export function buildExportPayload(
  data: Dataset,
  meta: { kind: ExportPayload['kind']; appVersion: string; deviceId: string; exportedAt: number; exportedBy: string | null },
): ExportPayload {
  return {
    format: FILE_FORMAT,
    formatVersion: FILE_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    ...meta,
    tables: data,
  };
}

export type PayloadParseResult =
  | { ok: true; payload: ExportPayload }
  | { ok: false; reason: 'newer_schema' | 'invalid'; message: string };

/**
 * Перевіряє вміст розшифрованого файла. Старіші schemaVersion проходять через upgradePayload
 * (дзеркало міграцій БД), новіші — відхиляються.
 */
export function parseExportPayload(json: unknown): PayloadParseResult {
  const sv = (json as { schemaVersion?: unknown })?.schemaVersion;
  if (typeof sv === 'number' && sv > SCHEMA_VERSION) {
    return { ok: false, reason: 'newer_schema', message: 'Файл створено новішою версією додатка — спершу оновіть додаток' };
  }
  const upgraded = upgradePayload(json);
  const r = zExportPayload.safeParse(upgraded);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, reason: 'invalid', message: `Некоректні дані у файлі: ${first?.path.join('.')} — ${first?.message}` };
  }
  return { ok: true, payload: r.data as ExportPayload };
}

/** Перетворення старих версій формату. Поки що версія одна. */
function upgradePayload(json: unknown): unknown {
  return json;
}
