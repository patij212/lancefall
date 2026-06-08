import { describe, it, expect } from 'vitest';
import { mulberry32, createRng, seedFromDate, dateString } from './rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0,1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createRng helpers', () => {
  it('range stays within bounds', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('int is inclusive of both ends and integral', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('weighted picks respect relative weights', () => {
    const r = createRng(42);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[r.weighted([{ v: 'a', w: 3 }, { v: 'b', w: 1 }])]++;
    }
    // a should appear roughly 3x more than b
    expect(counts.a).toBeGreaterThan(counts.b * 2);
  });

  it('two rngs with the same seed produce identical pick streams', () => {
    const r1 = createRng(2026);
    const r2 = createRng(2026);
    const arr = ['x', 'y', 'z', 'w'];
    for (let i = 0; i < 50; i++) expect(r1.pick(arr)).toBe(r2.pick(arr));
  });
});

describe('seedFromDate', () => {
  it('packs a date as YYYYMMDD', () => {
    expect(seedFromDate(new Date(2026, 5, 8))).toBe(20260608);
    expect(seedFromDate(new Date(2024, 0, 1))).toBe(20240101);
  });

  it('produces a stable seed → identical daily run', () => {
    const seed = seedFromDate(new Date(2026, 5, 8));
    const a = createRng(seed);
    const b = createRng(seed);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it('dateString formats with zero padding', () => {
    expect(dateString(new Date(2026, 5, 8))).toBe('2026-06-08');
    expect(dateString(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});
