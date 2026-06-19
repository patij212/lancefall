import { describe, it, expect } from 'vitest';
import { cipherSeed, makeCipher, dashCipherCore, ciphertext, cipherClassFor } from './cipher';

const isPermutation = (a: number[], n: number) =>
  a.length === n && new Set(a).size === n && a.every((v) => v >= 0 && v < n);

describe('cipher — the deterministic code-breaking layer', () => {
  it('cipherSeed is pure + stable, and varies with bossWave', () => {
    expect(cipherSeed(12345, 1)).toBe(cipherSeed(12345, 1));
    expect(cipherSeed(12345, 1)).not.toBe(cipherSeed(12345, 2));
    expect(cipherSeed(1, 1)).not.toBe(cipherSeed(2, 1));
    // always a uint32
    expect(cipherSeed(0xffffffff, 99)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(cipherSeed(7, 3))).toBe(true);
  });

  it('makeCipher yields glyph + order permutations of [0..n-1]', () => {
    for (const n of [3, 4, 6]) {
      const c = makeCipher(n, cipherSeed(999, 1));
      expect(isPermutation(c.order, n)).toBe(true);
      expect(isPermutation(c.glyphs, n)).toBe(true);
      expect(c.progress).toBe(0);
      expect(c.solved).toBe(false);
    }
  });

  it('is identical for the same seed (the Daily-shared property)', () => {
    const seed = cipherSeed(20260621, 6);
    const a = makeCipher(4, seed);
    const b = makeCipher(4, seed);
    expect(a.order).toEqual(b.order);
    expect(a.glyphs).toEqual(b.glyphs);
  });

  it('different seeds generally produce different orders', () => {
    const orders = new Set<string>();
    for (let s = 0; s < 20; s++) orders.add(makeCipher(4, cipherSeed(s, 1)).order.join(''));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('dashing in the decoded order advances to solved', () => {
    const c = makeCipher(4, cipherSeed(42, 6));
    const seq = [...c.order];
    expect(dashCipherCore(c, seq[0])).toBe('progress');
    expect(dashCipherCore(c, seq[1])).toBe('progress');
    expect(dashCipherCore(c, seq[2])).toBe('progress');
    expect(dashCipherCore(c, seq[3])).toBe('solved');
    expect(c.solved).toBe(true);
    expect(c.progress).toBe(4);
    // further dashes are a no-op once solved
    expect(dashCipherCore(c, seq[0])).toBe('noop');
  });

  it('a wrong dash is forgiving — keeps progress (no reset), flags a flash', () => {
    const c = makeCipher(4, cipherSeed(7, 2));
    const seq = [...c.order];
    expect(dashCipherCore(c, seq[0])).toBe('progress'); // progress 1
    const wrong = seq[2]; // not the expected second slot (seq[1])
    expect(dashCipherCore(c, wrong)).toBe('wrong');
    expect(c.progress).toBe(1); // KEPT — a mis-dash never wipes the code
    expect(c.wrongFlash).toBe(1);
    expect(c.solved).toBe(false);
    // continue right where we left off
    expect(dashCipherCore(c, seq[1])).toBe('progress'); // progress 2
  });

  it('ciphertext is the glyphs listed in required dash order', () => {
    const c = makeCipher(4, cipherSeed(3, 4));
    const ct = ciphertext(c);
    expect(ct).toEqual(c.order.map((slot) => c.glyphs[slot]));
    expect(isPermutation(ct, 4)).toBe(true);
  });
});

describe('cipher classes — the deduce-verb tagging', () => {
  it('makeCipher defaults to substitution and records its seed (additive, non-breaking)', () => {
    const seed = cipherSeed(123, 4);
    const c = makeCipher(4, seed);
    expect(c.cls).toBe('substitution');
    expect(c.seed).toBe(seed >>> 0);
  });

  it('makeCipher carries the requested class; generation is unchanged by it', () => {
    const seed = cipherSeed(123, 4);
    const sub = makeCipher(4, seed, 'substitution');
    const rot = makeCipher(4, seed, 'rotor');
    expect(rot.cls).toBe('rotor');
    // the SAME seed yields the SAME glyph/order permutations regardless of class —
    // the class is a VIEW tag only, so the seeded sim can never diverge by class.
    expect(rot.order).toEqual(sub.order);
    expect(rot.glyphs).toEqual(sub.glyphs);
  });

  it('cipherClassFor maps each ring boss to its escalating class', () => {
    expect(cipherClassFor('warden')).toBe('caesar');
    expect(cipherClassFor('weaver')).toBe('substitution');
    expect(cipherClassFor('beacon')).toBe('partial');
    expect(cipherClassFor('sovereign')).toBe('rotor');
    expect(cipherClassFor('darter')).toBe('substitution'); // unknown → plain key
  });
});
