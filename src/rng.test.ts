import { describe, it, expect } from 'vitest';
import { mulberry32, createRng, seedFromDate, dateString, seedFromWeek, weekString, weekStart } from './rng';

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

// WEEKLY CHALLENGE — the week seed must be WEEK-STABLE: the same value for every player
// for the whole week (Mon..Sun, UTC), changing only when a new week begins. This is the
// determinism guarantee the shared weekly board/run depends on.
describe('seedFromWeek — a week-stable challenge seed', () => {
  // Mon 2026-06-15 .. Sun 2026-06-21 is one ISO week (UTC); next week's Monday is 2026-06-22.
  it('weekStart snaps any day of a week to that week\'s Monday 00:00 UTC', () => {
    const mon = weekStart(new Date('2026-06-15T09:30:00Z')); // Monday
    const sun = weekStart(new Date('2026-06-21T23:59:00Z')); // Sunday (same week)
    expect(mon.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(sun.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('is CONSTANT for every day within one week (the whole world shares it)', () => {
    const seeds = [
      '2026-06-15T00:00:00Z', // Mon
      '2026-06-17T14:00:00Z', // Wed
      '2026-06-21T23:59:59Z', // Sun
    ].map((d) => seedFromWeek(new Date(d)));
    expect(seeds[0]).toBe(20260615); // the week's Monday packed as YYYYMMDD (UTC)
    expect(new Set(seeds).size).toBe(1); // identical all week
  });

  it('DIFFERS across weeks (a fresh siege every Monday)', () => {
    const thisWeek = seedFromWeek(new Date('2026-06-17T12:00:00Z')); // week of Mon Jun 15
    const nextWeek = seedFromWeek(new Date('2026-06-24T12:00:00Z')); // week of Mon Jun 22
    expect(thisWeek).toBe(20260615);
    expect(nextWeek).toBe(20260622);
    expect(thisWeek).not.toBe(nextWeek);
  });

  it('weekString labels the week\'s Monday (UTC) with zero padding', () => {
    expect(weekString(new Date('2026-06-21T23:00:00Z'))).toBe('2026-06-15');
    expect(weekString(new Date('2026-01-04T10:00:00Z'))).toBe('2025-12-29'); // crosses the year
  });

  it('a week seed reproduces an identical run for everyone (like the Daily)', () => {
    const seed = seedFromWeek(new Date('2026-06-17T12:00:00Z'));
    const a = createRng(seed);
    const b = createRng(seed);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});
