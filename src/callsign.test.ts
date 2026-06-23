import { describe, it, expect } from 'vitest';
import { generateCallsign, applyCallsign } from './callsign';
import { sanitizeHandle, defaultSave } from './save';

/** Deterministic rand stub: replays the given values, cycling. */
const seq = (xs: number[]): (() => number) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('generateCallsign', () => {
  it('is deterministic for a fixed rand (word index then number)', () => {
    // rand()#1 picks the word (0 -> first word), rand()#2 picks the number (0 -> 100).
    expect(generateCallsign(seq([0, 0]))).toBe('LANCER-100');
  });

  it('maps the top of the rand range to the last word and the max number', () => {
    expect(generateCallsign(seq([0.999999, 0.999999]))).toBe('VESPER-9999');
  });

  it('always matches WORD-NUMBER, is <=16 chars, and is sanitize-stable', () => {
    for (let i = 0; i < 500; i++) {
      const s = generateCallsign(); // real Math.random
      expect(s).toMatch(/^[A-Z]+-\d{3,4}$/);
      expect(s.length).toBeLessThanOrEqual(16);
      expect(sanitizeHandle(s)).toBe(s); // already canonical => sanitize is a no-op
      const n = Number(s.split('-')[1]);
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it('spans more than one word and number across many draws (distribution sanity)', () => {
    const words = new Set<string>();
    const nums = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const [w, n] = generateCallsign().split('-');
      words.add(w);
      nums.add(n);
    }
    expect(words.size).toBeGreaterThan(1);
    expect(nums.size).toBeGreaterThan(1);
  });
});

describe('applyCallsign', () => {
  it('fills a blank handle and reports it assigned', () => {
    const save = defaultSave(); // handle === ''
    expect(applyCallsign(save, seq([0, 0]))).toBe(true);
    expect(save.handle).toBe('LANCER-100');
    expect(sanitizeHandle(save.handle)).toBe(save.handle);
  });

  it('leaves an existing handle untouched and reports no change', () => {
    const save = defaultSave();
    save.handle = 'NEONKNIGHT';
    expect(applyCallsign(save, seq([0, 0]))).toBe(false);
    expect(save.handle).toBe('NEONKNIGHT');
  });
});
