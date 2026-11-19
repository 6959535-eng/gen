import { describe, expect, it } from 'vitest';
import { UUID_RE, uuidv7, uuidv7Timestamp } from '../id/uuidv7';

describe('uuidv7', () => {
  it('формат і час', () => {
    const t = 1_763_500_000_000;
    const id = uuidv7(t);
    expect(id).toMatch(UUID_RE);
    expect(id[14]).toBe('7');
    expect(uuidv7Timestamp(id)).toBe(t);
  });
  it('монотонність у межах мілісекунди', () => {
    const ids = Array.from({ length: 2000 }, () => uuidv7(1_763_500_000_000));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
