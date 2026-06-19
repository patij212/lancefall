// src/bombe.ts — THE BOMBE: a meta-tool that cracks the intercepts faster (an ode to Turing's
// bombe), plus the cockpit's optional cryptanalysis PUZZLES. PURE + save-side (no rng, no sim):
// upgradeBombe/runBombe/solvePuzzle only spend Fragments / push decrypted words / push solved ids.
import type { SaveData } from './save';
import { vocabulary, wordCost, isWordDecrypted } from './intercepts';

export const BOMBE_MAX_LEVEL = 5;

/** Word-cost multiplier from the Bombe level: 1.0 at L0 down to 0.5 at max (a smooth discount). */
export function bombeCostMul(level: number): number {
  const l = Math.max(0, Math.min(BOMBE_MAX_LEVEL, level));
  return 1 - (l / BOMBE_MAX_LEVEL) * 0.5;
}

/** How many words the Bombe auto-cracks for free at run-end (0 until built; +1 per ~2 levels). */
export function bombeAutoCracks(level: number): number {
  return level <= 0 ? 0 : Math.ceil(level / 2);
}

/** Fragment price to go from `level` to `level+1` (rising). */
export function upgradeBombeCost(level: number): number {
  return 8 + level * 6;
}

/** Decrypt the globally-cheapest `n` still-undecrypted words for FREE (no Fragment spend). Pure
 *  save mutation; deterministic (cost then alphabetical tiebreak — no rng). Returns the words. */
export function crackCheapestFree(save: SaveData, n: number): string[] {
  if (n <= 0) return [];
  const undone = vocabulary()
    .filter((w) => !isWordDecrypted(save, w))
    .sort((a, b) => wordCost(a) - wordCost(b) || a.localeCompare(b));
  const cracked = undone.slice(0, n);
  for (const w of cracked) save.decryptedWords.push(w);
  return cracked;
}

/** Run the Bombe: decrypt the globally-cheapest still-undecrypted words for FREE (no spend). The
 *  "it ran overnight" payoff. Returns the words cracked. Pure save mutation. */
export function runBombe(save: SaveData): string[] {
  return crackCheapestFree(save, bombeAutoCracks(save.bombeLevel));
}

/** Available Fragment balance (mirrors lore.fragmentBalance; kept local to avoid an import cycle). */
function balance(save: SaveData): number {
  return Math.max(0, save.stillpointFragments.length - save.fragmentsSpent);
}

/** Build / upgrade the Bombe (spends Fragments). Returns false if maxed or unaffordable. */
export function upgradeBombe(save: SaveData): boolean {
  if (save.bombeLevel >= BOMBE_MAX_LEVEL) return false;
  const cost = upgradeBombeCost(save.bombeLevel);
  if (balance(save) < cost) return false;
  save.fragmentsSpent += cost;
  save.bombeLevel += 1;
  return true;
}

export interface ConsolePuzzle {
  id: string;
  kind: 'caesar' | 'substitution' | 'vigenere';
  prompt: string; // the ciphertext shown
  hint: string; // a one-line nudge
  answer: string; // the plaintext solution
  reward: string; // human-readable reward label (matches what solvePuzzleReward actually grants)
}

/** Bonus Fragments granted on a first puzzle solve (on top of the free word-crack). The honest,
 *  fungible payoff so a solve always advances the decryption — even before the Bombe is built. */
export const PUZZLE_FRAGMENT_REWARD = 3;

/** The trail unlocked once ALL console puzzles are solved (granted in game.ts when the
 *  `cryptanalyst` achievement fires). The cryptanalyst's prize. */
export const CRYPTANALYST_TRAIL = 'cipher';

/** Canonicalise a puzzle guess/answer for comparison (case + whitespace insensitive). */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Three hand-authored cryptograms — each honestly decodes to its answer (verify by hand before
// editing): a Caesar +3, a glyph substitution, and an Atbash (the mirror alphabet).
export const CONSOLE_PUZZLES: ConsolePuzzle[] = [
  {
    id: 'pz-caesar-1', kind: 'caesar',
    prompt: 'EULQJ EDFN WKH OLJKW',
    hint: 'A Caesar shift of 3 — every letter pushed three forward. Turn it back.',
    answer: 'BRING BACK THE LIGHT',
    reward: `a free word + ◆${PUZZLE_FRAGMENT_REWARD} Fragments`,
  },
  {
    id: 'pz-sub-1', kind: 'substitution',
    prompt: '★◆● ◇▲■■',
    hint: 'A simple substitution. Three glyphs spell the commonest word; four spell a fall with a doubled letter.',
    answer: 'THE FALL',
    reward: `a free word + ◆${PUZZLE_FRAGMENT_REWARD} Fragments`,
  },
  {
    id: 'pz-atbash-1', kind: 'substitution',
    prompt: 'ORTSG GSV HRTMZO',
    hint: 'Atbash — the mirror alphabet, A↔Z, B↔Y. The signal the Beacon never sent.',
    answer: 'LIGHT THE SIGNAL',
    reward: `a free word + ◆${PUZZLE_FRAGMENT_REWARD} Fragments · solve all three for the CIPHER trail`,
  },
];

export function checkPuzzle(id: string, guess: string): boolean {
  const p = CONSOLE_PUZZLES.find((x) => x.id === id);
  return !!p && norm(guess) === norm(p.answer);
}

/** Record a correct, first-time solve. Returns true only on the transition to solved. */
export function solvePuzzle(save: SaveData, id: string, guess: string): boolean {
  if (save.solvedPuzzles.includes(id)) return false;
  if (!checkPuzzle(id, guess)) return false;
  save.solvedPuzzles.push(id);
  return true;
}

export interface PuzzleSolveResult {
  /** true only on the first-time transition to solved */
  solved: boolean;
  /** the word the solve cracked for free (always one, independent of the Bombe), or null */
  crackedWord: string | null;
  /** bonus Fragments granted */
  fragments: number;
  /** true if this solve completed the FULL set (the cryptanalyst — the trail unlocks) */
  allSolved: boolean;
}

/** Solve a puzzle AND grant its REAL reward (the old labels granted nothing until the Bombe was
 *  built): a guaranteed free word-crack + bonus Fragments, every time, on the first solve. Pure +
 *  save-side — pushes synthetic Fragment ids (dedup-safe, like the run grant) + a decrypted word.
 *  No rng. Returns what happened so the host can juice + sound it + grant the all-solved trail. */
export function solvePuzzleReward(save: SaveData, id: string, guess: string): PuzzleSolveResult {
  const none: PuzzleSolveResult = { solved: false, crackedWord: null, fragments: 0, allSolved: false };
  if (!solvePuzzle(save, id, guess)) return none;
  for (let i = 0; i < PUZZLE_FRAGMENT_REWARD; i++) {
    const fid = `puzzle:${id}#${i}`;
    if (!save.stillpointFragments.includes(fid)) save.stillpointFragments.push(fid);
  }
  const cracked = crackCheapestFree(save, 1);
  const allSolved = CONSOLE_PUZZLES.every((p) => save.solvedPuzzles.includes(p.id));
  return { solved: true, crackedWord: cracked[0] ?? null, fragments: PUZZLE_FRAGMENT_REWARD, allSolved };
}
