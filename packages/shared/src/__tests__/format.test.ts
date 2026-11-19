import { describe, expect, it } from 'vitest';
import {
  formatDate, formatDateTime, formatNumber, fromKyiv, kyivOffsetMinutes, parseDateTime, parseDecimal,
  startOfKyivDay, formatDuration, formatLiters, formatMotoHours,
} from '../format';

describe('формати Europe/Kyiv', () => {
  it('зимовий і літній зсув', () => {
    expect(kyivOffsetMinutes(Date.UTC(2026, 0, 15, 12))).toBe(120);
    expect(kyivOffsetMinutes(Date.UTC(2026, 6, 15, 12))).toBe(180);
  });
  it('ДД.ММ.РРРР ГГ:ХХ у 24-год форматі', () => {
    const ms = Date.UTC(2026, 10, 19, 21, 5); // 23:05 Київ
    expect(formatDate(ms)).toBe('19.11.2026');
    expect(formatDateTime(ms)).toBe('19.11.2026 23:05');
    expect(formatDateTime(Date.UTC(2026, 10, 19, 22, 30))).toBe('20.11.2026 00:30');
  });
  it('fromKyiv / parseDateTime — туди й назад, зокрема біля переходу на літній час', () => {
    for (const [y, m, d, h, mi] of [[2026, 3, 29, 2, 30], [2026, 10, 25, 5, 0], [2026, 1, 1, 0, 0]] as const) {
      const ms = fromKyiv(y, m, d, h, mi);
      expect(parseDateTime(formatDateTime(ms))).toBe(ms);
    }
    expect(parseDateTime('31.02.2026')).toBeNull();
    expect(parseDateTime('сміття')).toBeNull();
  });
  it('початок доби за Києвом', () => {
    expect(formatDateTime(startOfKyivDay(Date.UTC(2026, 10, 19, 23, 0)))).toBe('20.11.2026 00:00');
  });
  it('десяткова кома', () => {
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(1.26, 2)).toBe('1,26');
    expect(formatLiters(20_500)).toBe('20,5 л');
    expect(formatMotoHours(90)).toBe('1,5');
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 7.25 ')).toBe(7.25);
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
  it('тривалість', () => {
    expect(formatDuration(125 * 60_000)).toBe('2 год 05 хв');
    expect(formatDuration(65_000, true)).toBe('0:01:05');
  });
});

import { __fallbackOffsetMin } from '../format';
describe('резервні правила переходу на літній час', () => {
  it('збігаються з Intl протягом року', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000 * 7) {
      expect(__fallbackOffsetMin(t)).toBe(kyivOffsetMinutes(t));
    }
  });
});
