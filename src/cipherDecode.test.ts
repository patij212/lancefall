import { describe, it, expect } from 'vitest';
import { makeCipher, cipherSeed, dashCipherCore } from './cipher';
import { decodeView, plaintextFor, cipherSymbol } from './cipherDecode';

// READ THE KEY must be a REAL substitution decode (not follow-the-highlight): reading the
// on-HUD key and finding each core by its cipher symbol, in plaintext order, must reproduce
// the solution. And it must stay pure — it only reads a CipherState (no World, no rng).

describe('cipherDecode — a real, solvable substitution view', () => {
  it('plaintext + symbols + key are all sized to the ring', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97));
    const v = decodeView(c);
    expect(v.plaintext.length).toBe(5);
    expect(v.symbolForSlot.length).toBe(5);
    expect(v.key.length).toBe(5);
    expect(v.plaintext.join('')).toBe('LIGHT');
  });

  it('the cipher symbols on the cores are distinct (the key is a bijection)', () => {
    const v = decodeView(makeCipher(6, cipherSeed(777, 2)));
    expect(new Set(v.symbolForSlot).size).toBe(6);
  });

  it('reading the key and finding each core by its symbol, in order, solves the cipher', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [5, 999], [6, 20260621]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 97));
      const v = decodeView(c);
      // simulate a player decoding: for each plaintext letter in order, the key gives its
      // cipher symbol; the core showing that symbol is the one to dash.
      for (let step = 0; step < n; step++) {
        const sym = v.key[step].cipher;
        const slot = v.symbolForSlot.indexOf(sym); // the core displaying that ciphered mark
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true); // never a wrong key
      }
      expect(c.solved).toBe(true);
    }
  });

  it('plaintextFor / cipherSymbol are stable pure lookups', () => {
    expect(plaintextFor(3)).toBe('DAY');
    expect(plaintextFor(4)).toBe('DAWN');
    expect(cipherSymbol(0)).toBe(cipherSymbol(0));
    expect(cipherSymbol(0)).not.toBe(cipherSymbol(1));
  });
});

describe('decodeView — extended, class-aware shape', () => {
  it('substitution is unchanged: full key, all revealed, no rotor', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97), 'substitution');
    const v = decodeView(c);
    expect(v.cls).toBe('substitution');
    expect(v.rotorOffset).toBe(0);
    expect(v.revealed).toEqual([true, true, true, true, true]);
    // the legacy solve property still holds (read the full key in order → solve)
    expect(v.key.length).toBe(5);
    expect(new Set(v.symbolForSlot).size).toBe(5);
  });
});
