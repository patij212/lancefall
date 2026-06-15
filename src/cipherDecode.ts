// src/cipherDecode.ts — PURE, read-only decode VIEW over a CipherState. This is the
// "READ THE KEY" skin (the Turing ode made into a played act): instead of printing the
// answer order as numbers and white-ringing the next core, we show ciphered SYMBOLS on the
// cores and a substitution KEY on the HUD, so the player must *read the cipher* to find the
// next core. It derives ONLY from cipher.order / cipher.glyphs — ZERO world.rng, the reducer
// (dashCipherCore) is untouched — so it can never perturb a seeded/Daily run.
import type { CipherState } from './cipher';

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

// A scrambled cipher alphabet — the symbols shown on the cores (distinct glyph → distinct mark).
const CIPHER_ALPHABET = ['Σ', 'Δ', 'Λ', 'Φ', 'Ψ', 'Ω', 'Θ', 'Ξ', 'Π', 'Γ'];

/** The plaintext message (length n) the player is decoding. */
export function plaintextFor(n: number): string {
  const w = PLAINTEXT[n];
  if (w) return w;
  // fallback for unusual sizes: a unique-letter slice of the alphabet
  return 'ABCDEFGHIJ'.slice(0, Math.max(1, Math.min(10, n)));
}

/** The cipher symbol shown on a core, given its glyph id. */
export function cipherSymbol(glyph: number): string {
  return CIPHER_ALPHABET[((glyph % CIPHER_ALPHABET.length) + CIPHER_ALPHABET.length) % CIPHER_ALPHABET.length];
}

export interface DecodeView {
  /** the plaintext letters, in required dash order (the message being decoded) */
  plaintext: string[];
  /** cipher symbol displayed on the core at each orbit slot (index = slot) */
  symbolForSlot: string[];
  /** the substitution key, in dash order: plaintext letter ↔ its cipher symbol */
  key: { plain: string; cipher: string }[];
  /** how many letters are decoded so far (= cipher.progress) */
  progress: number;
  /** true once fully decoded */
  solved: boolean;
}

/** Build the read-only decode view for a cipher (pure). */
export function decodeView(c: CipherState): DecodeView {
  const n = c.order.length;
  const word = plaintextFor(n);
  const plaintext = Array.from({ length: n }, (_, i) => word[i] ?? '?');
  const symbolForSlot = c.glyphs.map((g) => cipherSymbol(g));
  // key[i]: the i-th plaintext letter maps to the cipher symbol on the core you dash at step i
  const key = c.order.map((slot, i) => ({ plain: plaintext[i], cipher: cipherSymbol(c.glyphs[slot]) }));
  return { plaintext, symbolForSlot, key, progress: c.progress, solved: c.solved };
}
