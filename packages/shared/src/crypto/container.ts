import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { gunzipSync, gzipSync } from 'fflate';
import { base64ToBytes, bytesToBase64, randomBytes } from './random';

/**
 * Формат файла .gen:
 *   "GENF" | версія (1 байт) | довжина заголовка (2 байти, BE) | заголовок JSON | AES-256-GCM(gzip(JSON)) + тег
 * Заголовок не шифрується, але входить в AAD — його підміна ламає розшифрування.
 */
export const MAGIC = [0x47, 0x45, 0x4e, 0x46]; // GENF
export const CONTAINER_VERSION = 1;

export type KdfParams =
  | { name: 'scrypt'; N: number; r: number; p: number; salt: string }
  /** Ключ пристрою (автоматичні бекапи): ключ зберігається в захищеному сховищі телефона */
  | { name: 'device-key'; keyId: string };

export interface ContainerHeader {
  kdf: KdfParams;
  cipher: 'AES-256-GCM';
  nonce: string;
  createdAt: number;
  kind: 'export' | 'backup' | 'auto-backup';
}

export type GenFileErrorCode = 'not_gen_file' | 'unsupported_version' | 'bad_password' | 'corrupt' | 'need_password';

export class GenFileError extends Error {
  constructor(
    public code: GenFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenFileError';
  }
}

export const DEFAULT_SCRYPT = { N: 2 ** 15, r: 8, p: 1 };
export const MIN_PASSWORD_LENGTH = 8;

export type Secret = { password: string } | { deviceKey: Uint8Array; keyId: string };

async function deriveKey(kdf: KdfParams, secret: Secret, onProgress?: (p: number) => void): Promise<Uint8Array> {
  if (kdf.name === 'scrypt') {
    if (!('password' in secret)) throw new GenFileError('need_password', 'Потрібен пароль');
    return scryptAsync(secret.password.normalize('NFC'), base64ToBytes(kdf.salt), {
      N: kdf.N,
      r: kdf.r,
      p: kdf.p,
      dkLen: 32,
      onProgress,
    });
  }
  if (!('deviceKey' in secret)) throw new GenFileError('need_password', 'Потрібен ключ пристрою');
  if (secret.keyId !== kdf.keyId) {
    throw new GenFileError('bad_password', 'Цю копію створено на іншому телефоні або після перевстановлення');
  }
  return secret.deviceKey;
}

export interface PackOptions {
  kind: ContainerHeader['kind'];
  now?: number;
  scrypt?: { N: number; r: number; p: number };
  onProgress?: (p: number) => void;
}

export async function packContainer(json: unknown, secret: Secret, opts: PackOptions): Promise<Uint8Array> {
  if ('password' in secret && secret.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль має бути не коротший за ${MIN_PASSWORD_LENGTH} символів`);
  }
  const kdf: KdfParams =
    'password' in secret
      ? { name: 'scrypt', ...(opts.scrypt ?? DEFAULT_SCRYPT), salt: bytesToBase64(randomBytes(16)) }
      : { name: 'device-key', keyId: secret.keyId };
  const nonce = randomBytes(12);
  const header: ContainerHeader = {
    kdf,
    cipher: 'AES-256-GCM',
    nonce: bytesToBase64(nonce),
    createdAt: opts.now ?? Date.now(),
    kind: opts.kind,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  if (headerBytes.length > 0xffff) throw new Error('header too large');
  const prefix = new Uint8Array(7 + headerBytes.length);
  prefix.set(MAGIC, 0);
  prefix[4] = CONTAINER_VERSION;
  prefix[5] = headerBytes.length >> 8;
  prefix[6] = headerBytes.length & 0xff;
  prefix.set(headerBytes, 7);

  const key = await deriveKey(kdf, secret, opts.onProgress);
  const plain = gzipSync(new TextEncoder().encode(JSON.stringify(json)), { level: 6 });
  const ct = gcm(key, nonce, prefix).encrypt(plain);
  const out = new Uint8Array(prefix.length + ct.length);
  out.set(prefix, 0);
  out.set(ct, prefix.length);
  return out;
}

export function readContainerHeader(bytes: Uint8Array): { header: ContainerHeader; prefixLength: number } {
  if (bytes.length < 7 || MAGIC.some((m, i) => bytes[i] !== m)) {
    throw new GenFileError('not_gen_file', 'Це не файл резервної копії / експорту (.gen)');
  }
  if (bytes[4] !== CONTAINER_VERSION) {
    throw new GenFileError('unsupported_version', 'Файл створено новішою версією додатка — оновіть додаток');
  }
  const len = (bytes[5]! << 8) | bytes[6]!;
  if (bytes.length < 7 + len + 16) throw new GenFileError('corrupt', 'Файл пошкоджено (обрізаний)');
  try {
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(7, 7 + len))) as ContainerHeader;
    if (!header?.kdf || !header.nonce) throw new Error();
    return { header, prefixLength: 7 + len };
  } catch {
    throw new GenFileError('corrupt', 'Файл пошкоджено (заголовок)');
  }
}

export async function unpackContainer(
  bytes: Uint8Array,
  secret: Secret,
  onProgress?: (p: number) => void,
): Promise<{ header: ContainerHeader; json: unknown }> {
  const { header, prefixLength } = readContainerHeader(bytes);
  const key = await deriveKey(header.kdf, secret, onProgress);
  let plain: Uint8Array;
  try {
    plain = gcm(key, base64ToBytes(header.nonce), bytes.subarray(0, prefixLength)).decrypt(
      bytes.subarray(prefixLength),
    );
  } catch {
    throw new GenFileError('bad_password', 'Невірний пароль або файл пошкоджено');
  }
  try {
    return { header, json: JSON.parse(new TextDecoder().decode(gunzipSync(plain))) };
  } catch {
    throw new GenFileError('corrupt', 'Файл пошкоджено (вміст)');
  }
}
