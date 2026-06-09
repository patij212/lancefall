import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import { choiceEnding, echoVignette, echoLine, nemesisOf, ngPlusIntensityMul } from './stillpoint';

describe('stillpoint — THE CHOICE + ECHO + nemesis', () => {
  it('choiceEnding is distinct for catch vs fall', () => {
    const c = choiceEnding('catch');
    const f = choiceEnding('fall');
    expect(c.head).not.toBe(f.head);
    expect(c.line).not.toBe(f.line);
    expect(choiceEnding('none').line.length).toBeGreaterThan(0);
  });

  it('echoVignette is deterministic per seed', () => {
    expect(echoVignette(20260609)).toEqual(echoVignette(20260609));
    expect(echoLine(20260609)).toBe(echoLine(20260609));
  });

  it('echoVignette varies across seeds and stays in-bounds', () => {
    const lines = new Set<string>();
    for (let d = 20260101; d < 20260131; d++) {
      const v = echoVignette(d);
      expect(v.citizen.length).toBeGreaterThan(0);
      expect(v.memory.length).toBeGreaterThan(0);
      lines.add(echoLine(d));
    }
    expect(lines.size).toBeGreaterThan(5); // not all identical
  });

  it('echoVignette uses its OWN generator (no shared/global rng state)', () => {
    const seed = 20260609;
    const before = createRng(seed).next();
    echoVignette(seed); // allocates a separate generator internally
    const after = createRng(seed).next();
    expect(after).toBe(before); // a fresh createRng(seed) is identical before/after
  });

  it('echoLine is capitalised', () => {
    const s = echoLine(42);
    expect(s[0]).toBe(s[0]!.toUpperCase());
  });

  it('nemesisOf returns the most-died-to kind, null when empty', () => {
    expect(nemesisOf({})).toBeNull();
    expect(nemesisOf({ warden: 2, sovereign: 5, hollow: 1 })).toEqual({ kind: 'sovereign', count: 5 });
  });
});

describe('NG+ intensity gate — the determinism invariant', () => {
  it('NEVER scales a date-seeded run, even at max level + active', () => {
    expect(ngPlusIntensityMul(1, true, 8, 'date', 0.14, 8)).toBe(1);
    expect(ngPlusIntensityMul(2.5, true, 99, 'date', 0.2, 8)).toBe(2.5);
  });
  it('does not scale when NG+ is inactive', () => {
    expect(ngPlusIntensityMul(1, false, 5, 'random', 0.14, 8)).toBe(1);
  });
  it('scales a non-seeded active run by level, capped at maxLoop', () => {
    expect(ngPlusIntensityMul(1, true, 0, 'random', 0.14, 8)).toBe(1);
    expect(ngPlusIntensityMul(1, true, 1, 'random', 0.14, 8)).toBeCloseTo(1.14, 6);
    expect(ngPlusIntensityMul(1, true, 100, 'random', 0.1, 8)).toBeCloseTo(1.8, 6); // capped at 8 loops
  });
});
