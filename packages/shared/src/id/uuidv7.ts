import { randomBytes, bytesToHex } from '../crypto/random';

let lastMs = -1;
let seq = 0;

/**
 * UUID v7 (RFC 9562): 48 біт часу в мс + 74 випадкових біти.
 * У межах однієї мілісекунди 12-бітне поле rand_a працює як лічильник,
 * тож id, згенеровані на одному пристрої, монотонно зростають.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const r = randomBytes(10);
  if (nowMs <= lastMs) {
    seq++;
    if (seq > 0xfff) {
      lastMs++;
      seq = r[0]! & 0x7f;
    }
    nowMs = lastMs;
  } else {
    lastMs = nowMs;
    seq = ((r[0]! & 0x07) << 8) | r[1]!; // випадковий старт, лишаємо запас на інкремент
  }
  const b = new Uint8Array(16);
  let t = nowMs;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | ((seq >> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (r[2]! & 0x3f);
  for (let i = 9; i < 16; i++) b[i] = r[i - 6]!;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function uuidv7Timestamp(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
