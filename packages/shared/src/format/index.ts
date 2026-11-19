/**
 * Формати для України: часовий пояс Europe/Kyiv, 24 години, ДД.ММ.РРРР, десяткова кома.
 * Усі моменти часу в системі зберігаються як мс UTC (number).
 */
export const TIME_ZONE = 'Europe/Kyiv';
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface KyivParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Остання неділя місяця (0-based) о 01:00 UTC — момент переходу за правилами ЄС. */
function lastSundayUtc(year: number, month0: number): number {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  return Date.UTC(year, month0, lastDay.getUTCDate() - lastDay.getUTCDay(), 1);
}

/** Резерв на випадок, якщо рушій JS не підтримує часові пояси в Intl: правила ЄС (EET/EEST). */
function fallbackOffsetMin(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  return ms >= lastSundayUtc(y, 2) && ms < lastSundayUtc(y, 9) ? 180 : 120;
}

let intlOk: boolean | null = null;
function intlWorks(): boolean {
  if (intlOk !== null) return intlOk;
  try {
    // 15.07.2026 12:00 UTC має бути 15:00 у Києві
    const parts = partsFmt.formatToParts(new Date(Date.UTC(2026, 6, 15, 12)));
    intlOk = parts.find((x) => x.type === 'hour')?.value === '15';
  } catch {
    intlOk = false;
  }
  return intlOk;
}

export function kyivParts(ms: number): KyivParts {
  if (!intlWorks()) {
    const d = new Date(ms + fallbackOffsetMin(ms) * MINUTE);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    };
  }
  const p: Record<string, number> = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) {
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    hour: p.hour === 24 ? 0 : p.hour!,
    minute: p.minute!,
    second: p.second!,
  };
}

/** Зсув Києва від UTC у хвилинах для даного моменту (+120 взимку, +180 влітку). */
/** @internal для тестів */
export const __fallbackOffsetMin = fallbackOffsetMin;

export function kyivOffsetMinutes(ms: number): number {
  const p = kyivParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

/** Локальний київський час → мс UTC. Для «неіснуючої» години переходу береться найближча валідна. */
export function fromKyiv(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - kyivOffsetMinutes(guess) * MINUTE;
  const off2 = kyivOffsetMinutes(ms);
  ms = guess - off2 * MINUTE;
  return ms;
}

export function startOfKyivDay(ms: number): number {
  const p = kyivParts(ms);
  return fromKyiv(p.year, p.month, p.day);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ДД.ММ.РРРР */
export function formatDate(ms: number): string {
  const p = kyivParts(ms);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

/** ГГ:ХХ */
export function formatTime(ms: number): string {
  const p = kyivParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** ДД.ММ.РРРР ГГ:ХХ */
export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** Розбір «ДД.ММ.РРРР» (+ необов'язково «ГГ:ХХ») як київського часу. */
export function parseDateTime(s: string): number | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/.exec(s);
  if (!m) return null;
  const [d, mo, y, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number) as [
    number, number, number, number, number,
  ];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = fromKyiv(y, mo, d, h, mi);
  const p = kyivParts(ms);
  if (p.day !== d || p.month !== mo) return null; // 31.02 тощо
  return ms;
}

/** Число з десятковою комою, без групування тисяч пробілом за замовчуванням. */
export function formatNumber(value: number, maxFractionDigits = 1, minFractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const f = 10 ** maxFractionDigits;
  const rounded = Math.round(value * f) / f;
  let s = rounded.toFixed(maxFractionDigits);
  if (maxFractionDigits > minFractionDigits) {
    // прибираємо зайві нулі до minFractionDigits
    const [i, frac = ''] = s.split('.');
    let fr = frac;
    while (fr.length > minFractionDigits && fr.endsWith('0')) fr = fr.slice(0, -1);
    s = fr ? `${i}.${fr}` : i!;
  }
  if (s === '-0') s = '0';
  return s.replace('.', ',');
}

/** «12,5» / «12.5» / « 12 » → 12.5; порожнє чи сміття → null. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$|^-?\d+\.$|^-?\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---- Одиниці зберігання ----
// Об'єм: цілі мілілітри. Мотогодини: цілі хвилини. Потужність: цілі вати.

export const litersToMl = (l: number) => Math.round(l * 1000);
export const mlToLiters = (ml: number) => ml / 1000;
export const hoursToMin = (h: number) => Math.round(h * 60);
export const minToHours = (min: number) => min / 60;

/** 125,5 л */
export const formatLiters = (ml: number) => `${formatNumber(mlToLiters(ml), 1)} л`;
/** 1234,5 мгод (мотогодини, одна цифра після коми) */
export const formatMotoHours = (min: number) => formatNumber(minToHours(min), 1);

/** Тривалість для живого таймера: «2 год 05 хв» або «0:05:12» */
export function formatDuration(ms: number, withSeconds = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (withSeconds) return `${h}:${pad(m)}:${pad(s)}`;
  return h > 0 ? `${h} год ${pad(m)} хв` : `${m} хв`;
}
