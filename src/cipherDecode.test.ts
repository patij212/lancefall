import { describe, it, expect } from 'vitest';
import { makeCipher, cipherSeed, dashCipherCore } from './cipher';
import { decodeView, plaintextFor, markFor, markKey, type Mark } from './cipherDecode';

// READ THE KEY is now a single UNIFIED read for every boss: each core wears a designed sigil,
// and the HUD shows ALL of those sigils in dash order — a 1:1 match with the cores (no hidden,
// shifted, or rotated marks). It must stay pure (only reads a CipherState; no World, no rng)
// and must reproduce the solution by reading the key and dashing the matching core in order.

/** index of the core (slot) wearing a given mark */
const slotOf = (marks: Mark[], m: Mark) => marks.findIndex((x) => markKey(x) === markKey(m));

describe('cipherDecode — unified, solvable sigil view', () => {
  it('plaintext + marks + key are all sized to the ring', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97));
    const v = decodeView(c);
    expect(v.plaintext.length).toBe(5);
    expect(v.markForSlot.length).toBe(5);
    expect(v.key.length).toBe(5);
    expect(v.plaintext.join('')).toBe('LIGHT');
  });

  it('every mark is a designed sigil (no letters), and the key is fully legible', () => {
    const v = decodeView(makeCipher(6, cipherSeed(777, 2)));
    expect(v.markForSlot.every((m) => m.kind === 'sigil')).toBe(true);
    expect(v.key.every((k) => k.mark.kind === 'sigil')).toBe(true);
    expect(v.revealed.every(Boolean)).toBe(true); // the whole key is always shown
    expect(v.rotorOffset).toBe(0); // no rotation
  });

  it('the marks on the cores are distinct (the key is a bijection)', () => {
    const v = decodeView(makeCipher(6, cipherSeed(777, 2)));
    expect(new Set(v.markForSlot.map(markKey)).size).toBe(6);
  });

  it('the key matches the cores 1:1 — every key mark sits on a real core', () => {
    const v = decodeView(makeCipher(6, cipherSeed(3, 6)));
    for (const step of v.key) {
      expect(slotOf(v.markForSlot, step.mark)).toBeGreaterThanOrEqual(0);
    }
    // key length equals the core count (the player's complaint: lengths must match)
    expect(v.key.length).toBe(v.markForSlot.length);
  });

  it('reading the key and dashing the matching core, in order, solves it — for EVERY class', () => {
    const classes = ['substitution', 'caesar', 'partial', 'rotor'] as const;
    for (const cls of classes) {
      for (const [n, seed] of [[3, 1], [4, 42], [5, 999], [6, 20260621]] as const) {
        const c = makeCipher(n, cipherSeed(seed, n * 97), cls);
        const v = decodeView(c);
        for (let step = 0; step < n; step++) {
          const slot = slotOf(v.markForSlot, v.key[step].mark);
          const r = dashCipherCore(c, slot);
          expect(r === 'progress' || r === 'solved').toBe(true);
        }
        expect(c.solved).toBe(true);
      }
    }
  });

  it('the cipher CLASS no longer changes the read (unified view)', () => {
    const seed = cipherSeed(123, 6);
    const sub = decodeView(makeCipher(6, seed, 'substitution'));
    const cae = decodeView(makeCipher(6, seed, 'caesar'));
    const rot = decodeView(makeCipher(6, seed, 'rotor'));
    // same seed → identical marks + key regardless of class
    expect(cae.markForSlot.map(markKey)).toEqual(sub.markForSlot.map(markKey));
    expect(rot.key.map((k) => markKey(k.mark))).toEqual(sub.key.map((k) => markKey(k.mark)));
    expect(cae.revealed.every(Boolean)).toBe(true);
    expect(rot.rotorOffset).toBe(0);
  });

  it('plaintextFor / markFor are stable pure lookups', () => {
    expect(plaintextFor(3)).toBe('DAY');
    expect(plaintextFor(4)).toBe('DAWN');
    const c = makeCipher(4, cipherSeed(1, 4));
    expect(markKey(markFor(c, 0))).toBe(markKey(markFor(c, 0)));
    expect(markKey(markFor(c, 0))).not.toBe(markKey(markFor(c, 1)));
  });
});
