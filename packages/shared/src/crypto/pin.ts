import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from './random';

/**
 * Хеш PIN: PBKDF2-HMAC-SHA256 з 16-байтовою сіллю.
 * Увага: 4–6 цифр — це максимум мільйон варіантів, тож PIN захищає лише від
 * випадкового доступу на спільному телефоні; файл експорту захищає пароль команди.
 */
// Hermes без JIT: ~0,3–1 с на слабкому телефоні. Від перебору захищає блокування спроб, а не ітерації.
export const PIN_ITERATIONS = 5_000;
export const PIN_RE = /^\d{4,6}$/;

export interface PinHash {
  pinHash: string;
  pinSalt: string;
  pinAlgo: string;
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinHash> {
  if (!PIN_RE.test(pin)) throw new Error('PIN має містити 4–6 цифр');
  const salt = randomBytes(16);
  const dk = await pbkdf2Async(sha256, pin, salt, { c: iterations, dkLen: 32 });
  return { pinHash: bytesToHex(dk), pinSalt: bytesToHex(salt), pinAlgo: `pbkdf2-sha256:${iterations}` };
}

export async function verifyPin(pin: string, h: PinHash): Promise<boolean> {
  const m = /^pbkdf2-sha256:(\d+)$/.exec(h.pinAlgo);
  if (!m || !PIN_RE.test(pin)) return false;
  const dk = await pbkdf2Async(sha256, pin, hexToBytes(h.pinSalt), { c: Number(m[1]), dkLen: 32 });
  return constantTimeEqual(dk, hexToBytes(h.pinHash));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

// ---------- Блокування після невірних спроб ----------

export interface PinLockState {
  failedCount: number;
  lockUntil: number | null;
  /** Скільки разів профіль уже блокувався поспіль (для зростання часу) */
  lockLevel: number;
}

export const PIN_MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 60 * 60_000;

export const initialLockState = (): PinLockState => ({ failedCount: 0, lockUntil: null, lockLevel: 0 });

export function isLocked(s: PinLockState, now: number): boolean {
  return s.lockUntil !== null && now < s.lockUntil;
}

/** Невірний PIN: після 5 поспіль — блокування 1, 2, 4, 8… хв (до 60). */
export function registerFailure(s: PinLockState, now: number): PinLockState {
  const failed = s.failedCount + 1;
  if (failed < PIN_MAX_ATTEMPTS) return { ...s, failedCount: failed };
  const ms = Math.min(BASE_LOCK_MS * 2 ** s.lockLevel, MAX_LOCK_MS);
  return { failedCount: 0, lockUntil: now + ms, lockLevel: s.lockLevel + 1 };
}

/** Вірний PIN скидає все. */
export function registerSuccess(): PinLockState {
  return initialLockState();
}
