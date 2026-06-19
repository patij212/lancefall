// src/cipherDecode.ts — PURE, read-only decode VIEW over a CipherState. This is the
// "READ THE KEY" skin (the Turing ode made into a played act): instead of printing the
// answer order as numbers and white-ringing the next core, we show ciphered SYMBOLS on the
// cores and a substitution KEY on the HUD, so the player must *read the cipher* to find the
// next core. It derives ONLY from cipher.order / cipher.glyphs — ZERO world.rng, the reducer
// (dashCipherCore) is untouched — so it can never perturb a seeded/Daily run.
import type { CipherClass, CipherState } from './cipher';

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
  /** the mark displayed on the core at each orbit slot (index = slot) */
  symbolForSlot: string[];
  /** the substitution key, in dash order: plaintext letter ↔ its (displayed) cipher mark */
  key: { plain: string; cipher: string }[];
  /** per step: is this key pair legible on the HUD? false = the player must deduce it */
  revealed: boolean[];
  /** the rotor step the player must account for (0 for non-rotor classes) */
  rotorOffset: number;
  /** the cipher class (so the HUD picks the right chrome) */
  cls: CipherClass;
  /** how many letters are decoded so far (= cipher.progress) */
  progress: number;
  /** true once fully decoded */
  solved: boolean;
}

/** Build the read-only, class-aware decode view for a cipher (pure; zero rng). */
export function decodeView(c: CipherState): DecodeView {
  const n = c.order.length;
  const word = plaintextFor(n);
  const plaintext = Array.from({ length: n }, (_, i) => word[i] ?? '?');
  // the mark each core wears (Greek glyph, or a shifted LETTER for Caesar — see coreSymbolForSlot)
  const symbolForSlot = Array.from({ length: n }, (_, slot) => coreSymbolForSlot(c, slot));
  const off = c.cls === 'rotor' ? rotorOffset(c) : 0;
  // the key, in dash order; the rotor shows each true mark rotated by the current offset
  const key = c.order.map((slot, i) => ({
    plain: plaintext[i],
    cipher: c.cls === 'rotor' ? rotateSymbol(symbolForSlot[slot], off) : symbolForSlot[slot],
  }));
  const revealed = revealPolicy(c);
  return { plaintext, symbolForSlot, key, revealed, rotorOffset: off, cls: c.cls, progress: c.progress, solved: c.solved };
}

/** Per-class key visibility. Substitution/rotor reveal the full key (the rotor's challenge is the
 *  rotation, not hiding); Caesar reveals only the crib; partial reveals a seeded ~half. */
function revealPolicy(c: CipherState): boolean[] {
  const n = c.order.length;
  if (c.cls === 'caesar') return Array.from({ length: n }, (_, i) => i === 0);
  if (c.cls === 'partial') return partialRevealed(c);
  return Array.from({ length: n }, () => true);
}

/** The mark a core wears, given its orbit slot. Default: the Greek cipher symbol (substitution /
 *  partial / rotor). Caesar overrides this with a shifted LETTER in Task 3. */
export function coreSymbolForSlot(c: CipherState, slot: number): string {
  return cipherSymbol(c.glyphs[slot]);
}

/** The rotor step to account for. 0 until Task 5 makes it step with progress. */
export function rotorOffset(_c: CipherState): number {
  return 0;
}

/** Rotate a Greek cipher mark by k positions within the alphabet (identity until Task 5). */
export function rotateSymbol(sym: string, _k: number): string {
  return sym;
}

/** Which key pairs are legible for a partial cipher (all true until Task 4). */
export function partialRevealed(c: CipherState): boolean[] {
  return Array.from({ length: c.order.length }, () => true);
}
