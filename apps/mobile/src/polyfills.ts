/**
 * Поліфіли для Hermes, потрібні криптографії та стисненню з @gen/shared.
 * Імпортується першим у кореневому _layout.
 */
import { getRandomValues } from 'expo-crypto';
import { strFromU8, strToU8 } from 'fflate';

const g = globalThis as Record<string, unknown>;

if (!(g.crypto as { getRandomValues?: unknown } | undefined)?.getRandomValues) {
  g.crypto = { ...(g.crypto as object), getRandomValues };
}

if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = class {
    readonly encoding = 'utf-8';
    encode(s = '') {
      return strToU8(s);
    }
  };
}

if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = class {
    readonly encoding = 'utf-8';
    decode(b?: Uint8Array | ArrayBuffer) {
      if (!b) return '';
      return strFromU8(b instanceof Uint8Array ? b : new Uint8Array(b));
    }
  };
}
