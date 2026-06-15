// src/cipher.ts — PURE. The code-breaking layer (an ode to Alan Turing): a boss
// is ARMORED until you READ its cipher and dash its cores in the DECODED order.
//
// Determinism: this draws ZERO world.rng. The order is derived from a stable
// hash of (runSeed, bossWave) via a LOCAL generator, so the cipher is identical
// for everyone on a given Daily seed AND can never perturb the seeded run — the
// scoring stream (world.rng) is never touched. No DOM, no ctx; fully unit-tested.
import { createRng } from './rng';

export interface CipherState {
  /** glyph id shown on the core at orbit-slot i (a permutation of 0..n-1) */
  glyphs: number[];
  /** the required dash order, as orbit-slot indices (a permutation of 0..n-1) */
  order: number[];
  /** correct dashes so far (0..order.length) */
  progress: number;
  /** cosmetic: 1 right after a wrong dash, decays in render — never gates sim */
  wrongFlash: number;
  solved: boolean;
}

/** Stable 32-bit seed from (runSeed, bossWave) — pure, no rng draw. A given
 *  Daily seed therefore yields the same cipher for every player; random runs vary. */
export function cipherSeed(runSeed: number, bossWave: number): number {
  let h = (runSeed ^ Math.imul(bossWave + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Build a cipher for `n` cores from a deterministic seed, using its OWN
 *  generators (independent glyph + order permutations). */
export function makeCipher(n: number, seed: number): CipherState {
  return {
    glyphs: shuffle(n, createRng((seed ^ 0xa5a5a5a5) >>> 0)),
    order: shuffle(n, createRng(seed >>> 0)),
    progress: 0,
    wrongFlash: 0,
    solved: false,
  };
}

/** Fisher–Yates over [0..n-1] with the given local generator. */
function shuffle(n: number, rng: ReturnType<typeof createRng>): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i); // rng.int is inclusive of its max
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export type DashResult = 'progress' | 'solved' | 'wrong' | 'noop';

/** Register a dash on the core at orbit-slot `slot`. Pure reducer (mutates the
 *  passed state). The correct next slot advances progress; a wrong slot is a
 *  FORGIVING no-op — progress is KEPT (this is a bullet-hell; one mis-dash must
 *  not wipe the whole code) with only a cosmetic flash. Never a full reset. */
export function dashCipherCore(c: CipherState, slot: number): DashResult {
  if (c.solved) return 'noop';
  if (slot === c.order[c.progress]) {
    c.progress++;
    if (c.progress >= c.order.length) {
      c.solved = true;
      return 'solved';
    }
    return 'progress';
  }
  c.wrongFlash = 1; // a soft "not that one" cue — progress is preserved
  return 'wrong';
}

/** The ciphertext the player must read, as glyph ids in required dash order. */
export function ciphertext(c: CipherState): number[] {
  return c.order.map((slot) => c.glyphs[slot]);
}
