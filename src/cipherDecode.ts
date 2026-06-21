// src/cipherDecode.ts — PURE, read-only decode VIEW over a CipherState. The "READ THE KEY"
// skin (the Turing ode made into a played act): instead of printing the answer order as
// numbers, the cores wear designed SIGILS — or, for the Warden's Caesar lock, shifted
// LETTERS — and the HUD shows a substitution KEY, so the player must *read the cipher* to
// find the next core. It derives ONLY from cipher.order / cipher.glyphs — ZERO world.rng,
// the reducer (dashCipherCore) untouched — so it can never perturb a seeded/Daily run.
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

/** The mark a cipher core wears: a designed sigil (substitution / partial / rotor classes)
 *  or a Caesar shifted LETTER (the Warden). Both renderers draw straight from this. */
export type Mark =
  | { kind: 'sigil'; index: number }
  | { kind: 'letter'; char: string };

/** A stable key for mark equality / distinctness checks (used in tests + de-dup). */
export function markKey(m: Mark): string {
  return m.kind === 'sigil' ? `s${m.index}` : `l${m.char}`;
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
  /** the substitution key, in dash order: plaintext letter ↔ its (displayed) mark */
  key: { plain: string; mark: Mark }[];
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
  // the mark each core wears (designed sigil, or a shifted LETTER for Caesar — see markFor)
  const markForSlot = Array.from({ length: n }, (_, slot) => markFor(c, slot));
  const off = c.cls === 'rotor' ? rotorOffset(c) : 0;
  // the key, in dash order; the rotor shows each true mark rotated by the current offset
  const key = c.order.map((slot, i) => ({
    plain: plaintext[i],
    mark: c.cls === 'rotor' ? rotateMark(markForSlot[slot], off) : markForSlot[slot],
  }));
  const revealed = revealPolicy(c);
  return { plaintext, markForSlot, key, revealed, rotorOffset: off, cls: c.cls, progress: c.progress, solved: c.solved };
}

/** Per-class key visibility. Substitution/rotor reveal the full key (the rotor's challenge is the
 *  rotation, not hiding); Caesar reveals only the crib; partial reveals a seeded ~half. */
function revealPolicy(c: CipherState): boolean[] {
  const n = c.order.length;
  if (c.cls === 'caesar') return Array.from({ length: n }, (_, i) => i === 0);
  if (c.cls === 'partial') return partialRevealed(c);
  return Array.from({ length: n }, () => true);
}

/** The Caesar shift for this cipher, in 1..25 (never 0 — a 0-shift would be no cipher). Derived
 *  purely from the seed, so it's stable + Daily-shared. */
export function caesarShift(c: CipherState): number {
  return 1 + (c.seed % 25);
}

/** Shift an A–Z letter forward by k (mod 26). The plaintext words are unique-lettered, so the
 *  shift is a clean bijection → the cores wear distinct letters. */
export function caesarShiftLetter(letter: string, k: number): string {
  const code = letter.charCodeAt(0) - 65;
  if (code < 0 || code > 25) return letter; // non-letter (e.g. the '?' fallback) passes through
  return String.fromCharCode(65 + ((code + k) % 26));
}

/** The mark a core wears, given its orbit slot. Caesar shows the SHIFTED LETTER of that core's
 *  decode step; all other classes show a designed sigil keyed to the glyph id. */
export function markFor(c: CipherState, slot: number): Mark {
  if (c.cls === 'caesar') {
    const step = c.order.indexOf(slot);
    const word = plaintextFor(c.order.length);
    const letter = word[step] ?? '?';
    return { kind: 'letter', char: caesarShiftLetter(letter, caesarShift(c)) };
  }
  return { kind: 'sigil', index: ((c.glyphs[slot] % SIGIL_COUNT) + SIGIL_COUNT) % SIGIL_COUNT };
}

/** The rotor's current step = how many cores you've keyed. The legend rotates by this each
 *  correct dash, so the key can't be memorised — you track the offset (shown on the HUD). */
export function rotorOffset(c: CipherState): number {
  return c.progress;
}

/** Rotate a sigil mark by k positions within the mark set (wraps; tolerates negative k for
 *  un-rotating). Letter marks pass through — the rotor class never uses letters. */
export function rotateMark(m: Mark, k: number): Mark {
  if (m.kind !== 'sigil') return m; // defensive: a non-rotatable mark
  return { kind: 'sigil', index: (((m.index + k) % SIGIL_COUNT) + SIGIL_COUNT) % SIGIL_COUNT };
}

/** Beacon's partial key: a seeded contiguous window (~half the legend) is legible, and the
 *  CURRENT step is always legible so the next move is never unfair. The rest you route to by
 *  forgiving trial. Pure + seeded; reveals shrink the read without ever blocking it. */
export function partialRevealed(c: CipherState): boolean[] {
  const n = c.order.length;
  const out = Array.from({ length: n }, () => false);
  const count = Math.ceil(n / 2);
  const start = c.seed % n;
  for (let k = 0; k < count; k++) out[(start + k) % n] = true;
  out[Math.min(c.progress, n - 1)] = true; // the immediate next step is ALWAYS readable
  return out;
}
