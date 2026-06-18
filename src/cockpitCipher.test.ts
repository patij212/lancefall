import { describe, it, expect } from 'vitest';
import { hash01, isResolved, decodeCharAt, easeToward, clamp01 } from './cockpitCipher';

// Pure logic behind the cockpit CIPHER STORM overlay (Turing decode). The canvas/DOM
// half is verified visually; these are the deterministic, bug-prone bits.

describe('hash01 — stable per-column noise', () => {
  it('is deterministic for the same input', () => {
    expect(hash01(7)).toBe(hash01(7));
    expect(hash01(123)).toBe(hash01(123));
  });
  it('stays within [0, 1) across a range of inputs', () => {
    for (let i = 0; i < 500; i++) {
      const h = hash01(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
  it('varies across adjacent inputs (not constant)', () => {
    expect(hash01(1) === hash01(2) && hash01(2) === hash01(3)).toBe(false);
  });
});

describe('isResolved — coherence "breaks the key"', () => {
  it('resolves nothing at coherence 0', () => {
    for (let i = 0; i < 200; i++) expect(isResolved(i, 0)).toBe(false);
  });
  it('resolves everything at coherence 1', () => {
    for (let i = 0; i < 200; i++) expect(isResolved(i, 1)).toBe(true);
  });
  it('is monotonic: a column resolved at low coherence stays resolved higher', () => {
    for (let i = 0; i < 200; i++) {
      if (isResolved(i, 0.4)) expect(isResolved(i, 0.7)).toBe(true);
    }
  });
  it('resolves more columns as coherence rises', () => {
    const count = (coh: number) =>
      Array.from({ length: 400 }, (_, i) => isResolved(i, coh)).filter(Boolean).length;
    expect(count(0.8)).toBeGreaterThan(count(0.3));
  });
});

describe('decodeCharAt — readable phrase emerging from noise', () => {
  const phrase = 'ABCD';
  it('returns the char at the index', () => {
    expect(decodeCharAt(phrase, 0, 0)).toBe('A');
    expect(decodeCharAt(phrase, 2, 0)).toBe('C');
  });
  it('wraps past the end', () => {
    expect(decodeCharAt(phrase, 5, 0)).toBe('B'); // 5 % 4 = 1
  });
  it('applies the offset and wraps', () => {
    expect(decodeCharAt(phrase, 0, 3)).toBe('D'); // (0+3) % 4 = 3
    expect(decodeCharAt(phrase, 1, 3)).toBe('A'); // (1+3) % 4 = 0
  });
  it('handles negative offset without crashing', () => {
    expect(decodeCharAt(phrase, 0, -1)).toBe('D'); // (0-1) -> 3
  });
});

describe('easeToward — smooth coherence follow', () => {
  it('returns current when dt is 0', () => {
    expect(easeToward(0.2, 0.9, 0, 5)).toBe(0.2);
  });
  it('moves toward the target', () => {
    const next = easeToward(0, 1, 0.016, 5);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });
  it('does not overshoot the target even with a huge dt', () => {
    const next = easeToward(0, 1, 100, 5);
    expect(next).toBeLessThanOrEqual(1);
    expect(next).toBeGreaterThan(0.99);
  });
  it('converges to the target over many steps', () => {
    let v = 0;
    for (let i = 0; i < 600; i++) v = easeToward(v, 1, 0.016, 5);
    expect(v).toBeCloseTo(1, 3);
  });
});

describe('clamp01', () => {
  it('clamps below 0, above 1, and passes the middle through', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });
});
