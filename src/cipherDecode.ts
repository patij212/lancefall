// src/cipherDecode.ts — PURE, read-only decode VIEW over a CipherState. Every boss cipher
// now reads the SAME clear way: each orbiting core wears a designed SIGIL, and the HUD shows
// ALL of those sigils in dash order — a 1:1 match with the cores, nothing hidden, shifted, or
// rotated. (The earlier per-class "deduce" variants — Caesar letters / partial hide / rotor —
// were unified to a single readable scheme: the new glyphs are always present and the key
// length always matches the cores.) Derives ONLY from cipher.order / cipher.glyphs — ZERO
// world.rng, the reducer (dashCipherCore) untouched — so it can never perturb a seeded run.
import type { CipherClass, CipherState } from './cipher';
import { SIGIL_COUNT } from './cipherSigils';

// The plaintext you decode and bring back — one short, unique-lettered word per ring size.
// (Unique letters keep the substitution a clean bijection.)
const PLAINTEXT: Record<number, string> = {
  2: 'GO',
  3: 'DAY',
  4: 'DAWN',
  5: 'LIGHT',
  6: 'SOLACE',
  7: 'DAYTIME',
};

/** The mark a cipher core wears: a designed sigil (the only variant the view produces now —
 *  the renderers stay general in case a future cipher reintroduces another mark kind). */
export type Mark = { kind: 'sigil'; index: number };

/** A stable key for mark equality / distinctness checks (used in tests + de-dup). */
export function markKey(m: Mark): string {
  return `s${m.index}`;
}

/** The plaintext message (length n) the player is decoding. */
export function plaintextFor(n: number): string {
  const w = PLAINTEXT[n];
  if (w) return w;
  // fallback for unusual sizes: a unique-letter slice of the alphabet
  return 'ABCDEFGHIJ'.slice(0, Math.max(1, Math.min(10, n)));
}

export interface DecodeView {
  /** the plaintext letters, in required dash order (the message being decoded) */
  plaintext: string[];
  /** the mark displayed on the core at each orbit slot (index = slot) */
  markForSlot: Mark[];
  /** the substitution key, in dash order: plaintext letter ↔ its mark (1:1 with the cores) */
  key: { plain: string; mark: Mark }[];
  /** per step: is this key pair legible on the HUD? always true now (unified full key) */
  revealed: boolean[];
  /** retained for the stable view shape; always 0 (the rotor variant was unified away) */
  rotorOffset: number;
  /** the cipher class (still carried as metadata; no longer changes the read) */
  cls: CipherClass;
  /** how many letters are decoded so far (= cipher.progress) */
  progress: number;
  /** true once fully decoded */
  solved: boolean;
}

/** The mark a core wears, given its orbit slot — a designed sigil keyed to the glyph id. */
export function markFor(c: CipherState, slot: number): Mark {
  return { kind: 'sigil', index: ((c.glyphs[slot] % SIGIL_COUNT) + SIGIL_COUNT) % SIGIL_COUNT };
}

/** Build the read-only decode view for a cipher (pure; zero rng). The key is the full set of
 *  core marks in dash order — read it, match each sigil to its core, dash in plaintext order. */
export function decodeView(c: CipherState): DecodeView {
  const n = c.order.length;
  const word = plaintextFor(n);
  const plaintext = Array.from({ length: n }, (_, i) => word[i] ?? '?');
  const markForSlot = Array.from({ length: n }, (_, slot) => markFor(c, slot));
  const key = c.order.map((slot, i) => ({ plain: plaintext[i], mark: markForSlot[slot] }));
  return {
    plaintext,
    markForSlot,
    key,
    revealed: markForSlot.map(() => true), // unified: the whole key is always legible
    rotorOffset: 0,
    cls: c.cls,
    progress: c.progress,
    solved: c.solved,
  };
}
