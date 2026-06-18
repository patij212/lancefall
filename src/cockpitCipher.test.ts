import { describe, it, expect } from 'vitest';
import {
  hash01,
  isResolved,
  decodeCharAt,
  easeToward,
  clamp01,
  choiceCoherence,
  beatEnvelope,
  parseAccentRgb,
  audioBands,
} from './cockpitCipher';

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

describe('choiceCoherence — the backdrop reflects THE CHOICE', () => {
  it('held the light (catch) → mostly decoded', () => {
    expect(choiceCoherence('catch')).toBeGreaterThan(0.8);
  });
  it('let it fall → near-noise', () => {
    const c = choiceCoherence('fall');
    expect(c).not.toBeNull();
    expect(c as number).toBeLessThan(0.25);
  });
  it('no choice yet → null (defer to the boot --coh rise)', () => {
    expect(choiceCoherence('none')).toBeNull();
    expect(choiceCoherence('whatever')).toBeNull();
  });
});

describe('beatEnvelope — free-running 120bpm pulse', () => {
  it('spikes to ~1 at the start of each beat', () => {
    expect(beatEnvelope(0, 0.5)).toBeCloseTo(1, 5);
    expect(beatEnvelope(0.5, 0.5)).toBeCloseTo(1, 5);
    expect(beatEnvelope(1.0, 0.5)).toBeCloseTo(1, 5);
  });
  it('decays across a beat', () => {
    expect(beatEnvelope(0.25, 0.5)).toBeLessThan(beatEnvelope(0.05, 0.5));
  });
  it('stays within [0, 1]', () => {
    for (let i = 0; i < 120; i++) {
      const v = beatEnvelope(i * 0.037, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('returns 0 when there is no beat (non-positive period)', () => {
    expect(beatEnvelope(1, 0)).toBe(0);
    expect(beatEnvelope(1, -1)).toBe(0);
  });
});

describe('parseAccentRgb — per-mode accent tint', () => {
  it('parses an "r, g, b" triple', () => {
    expect(parseAccentRgb('34, 211, 238')).toEqual([34, 211, 238]);
    expect(parseAccentRgb('251,191,36')).toEqual([251, 191, 36]);
  });
  it('tolerates extra whitespace', () => {
    expect(parseAccentRgb('  129 ,  140 , 248 ')).toEqual([129, 140, 248]);
  });
  it('falls back to cyan on empty or malformed input', () => {
    expect(parseAccentRgb('')).toEqual([34, 211, 238]);
    expect(parseAccentRgb('not-a-color')).toEqual([34, 211, 238]);
    expect(parseAccentRgb('1,2')).toEqual([34, 211, 238]);
  });
});

describe('audioBands — split the FFT into bass/mid/treble/level (music reactivity)', () => {
  it('returns zeros for empty input', () => {
    expect(audioBands(new Uint8Array(0))).toEqual({ bass: 0, mid: 0, treble: 0, level: 0 });
  });
  it('normalizes a full-scale spectrum to ~1 across the board', () => {
    const b = audioBands(new Uint8Array(128).fill(255));
    expect(b.bass).toBeCloseTo(1, 5);
    expect(b.mid).toBeCloseTo(1, 5);
    expect(b.treble).toBeCloseTo(1, 5);
    expect(b.level).toBeCloseTo(1, 5);
  });
  it('isolates bass when only the low bins are hot', () => {
    const a = new Uint8Array(128);
    for (let i = 0; i < 10; i++) a[i] = 255;
    const b = audioBands(a);
    expect(b.bass).toBeGreaterThan(0.5);
    expect(b.treble).toBeLessThan(0.05);
  });
  it('isolates treble when only the high bins are hot', () => {
    const a = new Uint8Array(128);
    for (let i = 64; i < 128; i++) a[i] = 255;
    const b = audioBands(a);
    expect(b.treble).toBeGreaterThan(0.5);
    expect(b.bass).toBe(0);
  });
  it('keeps every band within [0, 1]', () => {
    const a = new Uint8Array(128);
    for (let i = 0; i < 128; i++) a[i] = (i * 2) % 256;
    const b = audioBands(a);
    for (const v of [b.bass, b.mid, b.treble, b.level]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
