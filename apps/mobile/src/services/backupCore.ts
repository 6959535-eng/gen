/**
 * Експорт / імпорт / резервні копії — логіка без привʼязки до платформи.
 * Файлова система, захищене сховище й поширення файлів передаються як залежності,
 * тож усе тестується в Node.
 */
import {
  buildExportPayload,
  bytesToHex,
  GenFileError,
  hexToBytes,
  kyivParts,
  packContainer,
  parseExportPayload,
  randomBytes,
  readContainerHeader,
  unpackContainer,
  type ContainerHeader,
  type ExportPayload,
  type IntegrityIssue,
  type MergePlan,
  type Secret,
} from '@gen/shared';
import type { Repositories } from '../repositories';
import { markNeedsSnapshot } from './syncCore';

/** Мінімальний інтерфейс файлового сховища (внутрішня памʼять додатка). */
export interface FileStore {
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Захищене сховище (Android Keystore / iOS Keychain). */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface BackupDeps {
  repos: Repositories;
  files: FileStore;
  secrets: SecretStore;
  appVersion: string;
  /** Хто створює файл (для метаданих) */
  actorId?: string | null;
  now?: () => number;
  scrypt?: { N: number; r: number; p: number };
  onProgress?: (p: number) => void;
}

export const BACKUP_DIR = 'backups';
export const KEEP_AUTO = 7;
export const KEEP_MANUAL = 7;
const TEAM_PASSWORD_KEY = 'team_password';
const DEVICE_KEY = 'device_backup_key';

export type BackupKind = ExportPayload['kind'];

// ---------- Пароль команди та ключ пристрою ----------

export const teamPassword = {
  get: (s: SecretStore) => s.get(TEAM_PASSWORD_KEY),
  set: (s: SecretStore, p: string) => s.set(TEAM_PASSWORD_KEY, p),
  clear: (s: SecretStore) => s.remove(TEAM_PASSWORD_KEY),
};

/** Ключ для автоматичних копій: 32 випадкові байти, створюється один раз і лишається в Keystore. */
export async function deviceSecret(s: SecretStore): Promise<Secret & { deviceKey: Uint8Array }> {
  let raw = await s.get(DEVICE_KEY);
  if (!raw) {
    raw = JSON.stringify({ keyId: bytesToHex(randomBytes(8)), key: bytesToHex(randomBytes(32)) });
    await s.set(DEVICE_KEY, raw);
  }
  const { keyId, key } = JSON.parse(raw) as { keyId: string; key: string };
  return { keyId, deviceKey: hexToBytes(key) };
}

// ---------- Імена файлів ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** gen-auto-20261119-1530.gen (київський час — щоб людям було зрозуміло) */
export function backupFileName(kind: BackupKind, now: number): string {
  const p = kyivParts(now);
  const tag = kind === 'auto-backup' ? 'auto' : kind === 'backup' ? 'backup' : 'export';
  return `gen-${tag}-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}${pad(p.second)}.gen`;
}

export function kindFromFileName(name: string): BackupKind | null {
  const m = /^gen-(auto|backup|export)-\d{8}-\d{4,6}\.gen$/.exec(name);
  if (!m) return null;
  return m[1] === 'auto' ? 'auto-backup' : m[1] === 'backup' ? 'backup' : 'export';
}

// ---------- Створення файлів ----------

export async function createGenFile(
  d: BackupDeps,
  kind: BackupKind,
  secret: Secret,
): Promise<{ bytes: Uint8Array; fileName: string; createdAt: number }> {
  const now = (d.now ?? Date.now)();
  const payload = buildExportPayload(d.repos.data.snapshot(), {
    kind,
    appVersion: d.appVersion,
    deviceId: d.repos.deviceId,
    exportedAt: now,
    exportedBy: d.actorId ?? null,
  });
  const bytes = await packContainer(payload, secret, { kind, now, scrypt: d.scrypt, onProgress: d.onProgress });
  return { bytes, fileName: backupFileName(kind, now), createdAt: now };
}

/** Видаляє найстаріші копії понад ліміт (окремо для автоматичних і ручних). */
async function rotate(files: FileStore, kind: BackupKind, keep: number) {
  const names = (await files.list(BACKUP_DIR)).filter((n) => kindFromFileName(n) === kind).sort();
  for (const n of names.slice(0, Math.max(0, names.length - keep))) await files.remove(`${BACKUP_DIR}/${n}`);
}

/**
 * Щоденна автоматична копія у внутрішню памʼять (шифрується ключем пристрою).
 * Викликається при старті й поверненні в додаток. Повертає імʼя файла або null, якщо ще рано.
 */
export async function runAutoBackupIfDue(d: BackupDeps, force = false): Promise<string | null> {
  const now = (d.now ?? Date.now)();
  const last = Number(d.repos.local.get('last_auto_backup_at') ?? 0);
  if (!force && now - last < 24 * 3_600_000) return null;
  if (!d.repos.users.hasAny()) return null; // порожня база — нічого зберігати
  const secret = await deviceSecret(d.secrets);
  const { bytes, fileName } = await createGenFile({ ...d, now: () => now }, 'auto-backup', secret);
  await d.files.write(`${BACKUP_DIR}/${fileName}`, bytes);
  d.repos.local.set('last_auto_backup_at', String(now));
  await rotate(d.files, 'auto-backup', KEEP_AUTO);
  return fileName;
}

/** Ручна копія паролем команди: зберігається локально й повертається для «Поділитися». */
export async function createManualBackup(d: BackupDeps, password: string) {
  const f = await createGenFile(d, 'backup', { password });
  await d.files.write(`${BACKUP_DIR}/${f.fileName}`, f.bytes);
  d.repos.local.set('last_manual_backup_at', String(f.createdAt));
  await rotate(d.files, 'backup', KEEP_MANUAL);
  return f;
}

export async function createExport(d: BackupDeps, password: string) {
  return createGenFile(d, 'export', { password });
}

export interface LocalBackup {
  name: string;
  path: string;
  kind: BackupKind;
  /** З імені файла; точний час — у заголовку */
  sortKey: string;
}

export async function listLocalBackups(files: FileStore): Promise<LocalBackup[]> {
  const names = await files.list(BACKUP_DIR);
  return names
    .map((name) => ({ name, kind: kindFromFileName(name) }))
    .filter((x): x is { name: string; kind: BackupKind } => x.kind !== null)
    .map((x) => ({ ...x, path: `${BACKUP_DIR}/${x.name}`, sortKey: x.name.replace(/^gen-\w+-/, '') }))
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
}

// ---------- Читання файлів ----------

export type SecretNeed = 'password' | 'device';

/** Що потрібно, щоб відкрити файл: пароль чи ключ цього пристрою. */
export function inspectGenFile(bytes: Uint8Array): { header: ContainerHeader; need: SecretNeed } {
  const { header } = readContainerHeader(bytes);
  return { header, need: header.kdf.name === 'scrypt' ? 'password' : 'device' };
}

/** Розшифровує й перевіряє вміст файла. */
export async function openGenFile(
  d: Pick<BackupDeps, 'secrets' | 'onProgress'>,
  bytes: Uint8Array,
  password?: string,
): Promise<{ header: ContainerHeader; payload: ExportPayload }> {
  const { need } = inspectGenFile(bytes);
  const secret: Secret =
    need === 'device' ? await deviceSecret(d.secrets) : { password: password ?? '' };
  const { header, json } = await unpackContainer(bytes, secret, d.onProgress);
  const parsed = parseExportPayload(json);
  if (!parsed.ok) throw new GenFileError(parsed.reason === 'newer_schema' ? 'unsupported_version' : 'corrupt', parsed.message);
  return { header, payload: parsed.payload };
}

// ---------- Імпорт і відновлення ----------

export function previewImport(repos: Repositories, payload: ExportPayload): MergePlan {
  return repos.data.planImport(payload.tables);
}

/** Злиття з автоматичною копією поточного стану перед ним. */
export async function applyImport(
  d: BackupDeps,
  payload: ExportPayload,
): Promise<{ plan: MergePlan; integrity: IntegrityIssue[]; safetyBackup: string | null }> {
  const safetyBackup = await runAutoBackupIfDue(d, true);
  const res = d.repos.data.applyImport(payload.tables, {
    sourceDeviceId: payload.deviceId,
    exportedAt: payload.exportedAt,
  });
  if (!res.plan.isNoop) markNeedsSnapshot(d.repos);
  return { ...res, safetyBackup };
}

/** Повна заміна даних з копії; перед нею — автоматична копія поточного стану. */
export async function restoreFromPayload(d: BackupDeps, payload: ExportPayload, label: string) {
  const safetyBackup = await runAutoBackupIfDue(d, true);
  d.repos.data.replaceAll(payload.tables, label);
  markNeedsSnapshot(d.repos);
  return { safetyBackup };
}

/** Перший запуск на новому телефоні: база порожня, переносимо все з файла. */
export function importIntoEmpty(repos: Repositories, payload: ExportPayload) {
  return repos.data.importIntoEmpty(payload.tables, {
    sourceDeviceId: payload.deviceId,
    exportedAt: payload.exportedAt,
  });
}
