import { describe, it, expect } from 'vitest';
import { newNarrator, pickLine, ambientReady } from './narrator';

describe('narrator — pure weighted no-repeat picker', () => {
  it('never repeats the immediate previous index', () => {
    const n = newNarrator(1234);
    let prev = -1;
    for (let i = 0; i < 200; i++) {
      const idx = pickLine(n, 'X', 4);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
      expect(idx).not.toBe(prev);
      prev = idx;
    }
  });

  it('returns 0 for a pool of length 1 (no crash)', () => {
    const n = newNarrator();
    expect(pickLine(n, 'solo', 1)).toBe(0);
    expect(pickLine(n, 'solo', 1)).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
    const a = newNarrator(42);
    const b = newNarrator(42);
    const seqA = Array.from({ length: 30 }, () => pickLine(a, 'B', 5));
    const seqB = Array.from({ length: 30 }, () => pickLine(b, 'B', 5));
    expect(seqA).toEqual(seqB);
  });

  it('distributes across the whole pool', () => {
    const n = newNarrator(7);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(pickLine(n, 'D', 6));
    expect(seen.size).toBe(6);
  });

  it('ambientReady gates within the gap', () => {
    const n = newNarrator();
    expect(ambientReady(n, 'a', 10, 6)).toBe(true);
    expect(ambientReady(n, 'a', 13, 6)).toBe(false); // inside the 6s gap
    expect(ambientReady(n, 'a', 16.1, 6)).toBe(true); // after the gap
  });

  it('ambientReady stamps independently per bucket', () => {
    const n = newNarrator();
    expect(ambientReady(n, 'a', 10, 6)).toBe(true);
    expect(ambientReady(n, 'b', 10, 6)).toBe(true); // different bucket, not gated
  });

  it('stays in range over many picks (its own rng, no external stream)', () => {
    const n = newNarrator(99);
    for (let i = 0; i < 100; i++) {
      const idx = pickLine(n, 'iso', 3);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it('is pure: identical inputs give identical outputs; edge buckets never throw', () => {
    const run = () =>
      (() => {
        const n = newNarrator(5);
        return [pickLine(n, 'p', 4), pickLine(n, 'p', 4), pickLine(n, 'q', 1)];
      })();
    expect(run()).toEqual(run());
    const n = newNarrator();
    expect(() => pickLine(n, 'empty', 0)).not.toThrow();
    expect(pickLine(n, 'empty', 0)).toBe(0);
  });
});
