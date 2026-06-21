import { describe, it, expect } from 'vitest';
import { makeCipher, cipherSeed, dashCipherCore } from './cipher';
import { decodeView, plaintextFor, markFor, markKey, caesarShiftLetter, rotateMark, type Mark } from './cipherDecode';

// READ THE KEY must be a REAL decode (not follow-the-highlight): reading the on-HUD key and
// finding each core by its mark, in plaintext order, must reproduce the solution. And it must
// stay pure — it only reads a CipherState (no World, no rng). Marks are designed sigils (or
// shifted letters for Caesar); a mark identifies a core via its stable markKey.

/** index of the core (slot) wearing a given mark */
const slotOf = (marks: Mark[], m: Mark) => marks.findIndex((x) => markKey(x) === markKey(m));

describe('cipherDecode — a real, solvable substitution view', () => {
  it('plaintext + marks + key are all sized to the ring', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97));
    const v = decodeView(c);
    expect(v.plaintext.length).toBe(5);
    expect(v.markForSlot.length).toBe(5);
    expect(v.key.length).toBe(5);
    expect(v.plaintext.join('')).toBe('LIGHT');
  });

  it('the marks on the cores are distinct (the key is a bijection)', () => {
    const v = decodeView(makeCipher(6, cipherSeed(777, 2)));
    expect(new Set(v.markForSlot.map(markKey)).size).toBe(6);
  });

  it('reading the key and finding each core by its mark, in order, solves the cipher', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [5, 999], [6, 20260621]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 97));
      const v = decodeView(c);
      // simulate a player decoding: for each plaintext letter in order, the key gives its
      // mark; the core showing that mark is the one to dash.
      for (let step = 0; step < n; step++) {
        const slot = slotOf(v.markForSlot, v.key[step].mark);
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true); // never a wrong key
      }
      expect(c.solved).toBe(true);
    }
  });

  it('plaintextFor / markFor are stable pure lookups', () => {
    expect(plaintextFor(3)).toBe('DAY');
    expect(plaintextFor(4)).toBe('DAWN');
    const c = makeCipher(4, cipherSeed(1, 4));
    expect(markKey(markFor(c, 0))).toBe(markKey(markFor(c, 0)));
    expect(markKey(markFor(c, 0))).not.toBe(markKey(markFor(c, 1))); // distinct slots, distinct marks
  });
});

describe('decodeView — extended, class-aware shape', () => {
  it('substitution is unchanged: full key, all revealed, no rotor, all sigils', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97), 'substitution');
    const v = decodeView(c);
    expect(v.cls).toBe('substitution');
    expect(v.rotorOffset).toBe(0);
    expect(v.revealed).toEqual([true, true, true, true, true]);
    expect(v.key.length).toBe(5);
    expect(new Set(v.markForSlot.map(markKey)).size).toBe(5);
    expect(v.markForSlot.every((m) => m.kind === 'sigil')).toBe(true);
  });
});

describe('decodeView — Caesar (the crib)', () => {
  it('cores wear shifted LETTERS; only the crib pair is revealed', () => {
    const c = makeCipher(5, cipherSeed(7, 5), 'caesar'); // n=5 → plaintext LIGHT
    const v = decodeView(c);
    expect(v.cls).toBe('caesar');
    expect(v.revealed.filter(Boolean).length).toBe(1); // just the crib
    expect(v.revealed[0]).toBe(true);
    expect(new Set(v.markForSlot.map(markKey)).size).toBe(5); // distinct shifted letters
    expect(v.markForSlot.every((m) => m.kind === 'letter' && /^[A-Z]$/.test(m.char))).toBe(true);
  });

  it('deducing k from the crib, then shifting each letter, solves the cipher', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [5, 999]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 13), 'caesar');
      const v = decodeView(c);
      // a player derives k from the one revealed pair (plain[0] → its shifted letter)…
      const crib = v.key[0];
      const cribChar = crib.mark.kind === 'letter' ? crib.mark.char : '?';
      const k = (cribChar.charCodeAt(0) - crib.plain.charCodeAt(0) + 26) % 26;
      // …then for each plaintext letter computes its shifted mark and finds that core.
      for (let step = 0; step < n; step++) {
        const mark: Mark = { kind: 'letter', char: caesarShiftLetter(v.plaintext[step], k) };
        const slot = slotOf(v.markForSlot, mark);
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true);
      }
      expect(c.solved).toBe(true);
    }
  });
});

describe('decodeView — partial (the earned key)', () => {
  it('reveals ~half the key, ALWAYS including the current step (fair next move)', () => {
    const c = makeCipher(6, cipherSeed(3, 6), 'partial');
    const v = decodeView(c);
    expect(v.cls).toBe('partial');
    expect(v.revealed.filter(Boolean).length).toBeGreaterThanOrEqual(3); // >= ceil(6/2)
    expect(v.revealed[v.progress]).toBe(true); // the next step is legible
  });

  it('does NOT reveal the whole key (it is partial)', () => {
    const c = makeCipher(6, cipherSeed(3, 6), 'partial');
    expect(decodeView(c).revealed.some((r) => r === false)).toBe(true);
  });

  it('revealed pairs are the TRUE key, and decoding still solves under fire', () => {
    const c = makeCipher(6, cipherSeed(20260621, 6), 'partial');
    // the true substitution key (what a fully-revealed view would show) for cross-check
    const truth = decodeView({ ...c, cls: 'substitution' }).key;
    for (let step = 0; step < 6; step++) {
      const v = decodeView(c); // re-read each step (reveal of the current step tracks progress)
      expect(v.revealed[step]).toBe(true);
      expect(markKey(v.key[step].mark)).toBe(markKey(truth[step].mark)); // a revealed pair is never a lie
      const slot = slotOf(v.markForSlot, v.key[step].mark);
      const r = dashCipherCore(c, slot);
      expect(r === 'progress' || r === 'solved').toBe(true);
    }
    expect(c.solved).toBe(true);
  });
});

describe('decodeView — rotor (the stepping key, Enigma)', () => {
  it('the rotor offset steps with progress; the legend rotates each step', () => {
    const c = makeCipher(5, cipherSeed(11, 5), 'rotor');
    expect(decodeView(c).rotorOffset).toBe(0);
    dashCipherCore(c, c.order[0]); // one correct key (order[0] is always the right first slot)
    expect(decodeView(c).rotorOffset).toBe(1);
  });

  it('accounting for the offset (un-rotating the displayed key) solves it', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [6, 999]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 17), 'rotor');
      for (let step = 0; step < n; step++) {
        const v = decodeView(c);
        const off = v.rotorOffset;            // shown on the HUD as a dial
        const displayed = v.key[step].mark;   // the rotated mark the player reads
        const trueMark = rotateMark(displayed, -off); // un-rotate by the offset
        const slot = slotOf(v.markForSlot, trueMark);
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true);
      }
      expect(c.solved).toBe(true);
    }
  });
});
