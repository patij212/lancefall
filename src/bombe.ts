// src/bombe.ts — THE BOMBE: a meta-tool that cracks the intercepts faster (an ode to Turing's
// bombe), plus the cockpit's optional cryptanalysis PUZZLES. PURE + save-side (no rng, no sim):
// upgradeBombe/runBombe/solvePuzzle only spend Fragments / push decrypted words / push solved ids.
import type { SaveData } from './save';
import { vocabulary, wordCost, wordRarity, isWordDecrypted } from './intercepts';

/** Three upgrade specialisation branches — THRIFT (cost discount), SPEED (free cracks/run),
 *  INSIGHT (cracks key/rare words first). Each branch caps at BRANCH_MAX. bombeLevel stays
 *  as the synced derived total (thrift+speed+insight) for back-compat with ~15 read sites. */
export type BombeBranch = 'thrift' | 'speed' | 'insight';

/** Per-branch level cap (0..3). */
export const BRANCH_MAX = 3;

/** Total level cap (= 3×BRANCH_MAX = 9). bombeLevel is the sum of all branches. */
export const BOMBE_MAX_LEVEL = 9;

/** Word-cost multiplier driven by the THRIFT branch level: 1.0 at L0 down to 0.5 at BRANCH_MAX.
 *  Caller passes `save.bombeBranches.thrift`. Signature unchanged — level is now the thrift level. */
export function bombeCostMul(level: number): number {
  const l = Math.max(0, Math.min(BRANCH_MAX, level));
  return 1 - (l / BRANCH_MAX) * 0.5;
}

/** Free auto-cracks per run, driven by the SPEED branch level (0..BRANCH_MAX).
 *  Caller passes `save.bombeBranches.speed`. Signature unchanged. */
export function bombeAutoCracks(level: number): number {
  // one free crack per SPEED level (0..3)
  return Math.max(0, Math.min(BRANCH_MAX, level));
}

/** Fragment price to go from `level` to `level+1` on any single branch (rising). */
export function upgradeBombeCost(level: number): number {
  return 8 + level * 6;
}

/** Alias for clarity in callers that read a branch cost — same formula as upgradeBombeCost. */
export function upgradeBranchCost(level: number): number {
  return 8 + level * 6;
}

const RARITY_RANK: Record<string, number> = { key: 0, rare: 1, common: 2 };

/** Decrypt `n` still-undecrypted words for FREE (no Fragment spend). Pure save mutation;
 *  deterministic. When `insightFirst` is true, sorts by rarity (key>rare>common) THEN cost —
 *  so the INSIGHT branch preferentially reveals the load-bearing vocabulary. */
export function crackCheapestFree(save: SaveData, n: number, insightFirst = false): string[] {
  if (n <= 0) return [];
  const undone = vocabulary()
    .filter((w) => !isWordDecrypted(save, w))
    .sort((a, b) => {
      if (insightFirst) {
        const rd = (RARITY_RANK[wordRarity(a)] ?? 2) - (RARITY_RANK[wordRarity(b)] ?? 2);
        if (rd !== 0) return rd;
      }
      return wordCost(a) - wordCost(b) || a.localeCompare(b);
    });
  const cracked = undone.slice(0, n);
  for (const w of cracked) save.decryptedWords.push(w);
  return cracked;
}

/** Run the Bombe: auto-crack undecrypted words for FREE (no spend). Uses the SPEED branch level
 *  for crack count; uses INSIGHT ordering when the insight branch > 0. Returns words cracked. */
export function runBombe(save: SaveData): string[] {
  const count = bombeAutoCracks(save.bombeBranches?.speed ?? 0);
  const insightFirst = (save.bombeBranches?.insight ?? 0) > 0;
  return crackCheapestFree(save, count, insightFirst);
}

/** Available Fragment balance (mirrors lore.fragmentBalance; kept local to avoid an import cycle). */
function balance(save: SaveData): number {
  return Math.max(0, save.stillpointFragments.length - save.fragmentsSpent);
}

/** Upgrade one of the three Bombe branches (THRIFT / SPEED / INSIGHT).
 *  Returns false if that branch is already at BRANCH_MAX or balance is insufficient.
 *  On success: charges Fragments, increments that branch, resyncs bombeLevel = sum. */
export function upgradeBombeBranch(save: SaveData, branch: BombeBranch): boolean {
  const branches = save.bombeBranches ?? { thrift: 0, speed: 0, insight: 0 };
  if (branches[branch] >= BRANCH_MAX) return false;
  const cost = upgradeBranchCost(branches[branch]);
  if (balance(save) < cost) return false;
  save.fragmentsSpent += cost;
  branches[branch] += 1;
  save.bombeBranches = branches;
  // resync the derived total so all existing bombeLevel read-sites keep working
  save.bombeLevel = branches.thrift + branches.speed + branches.insight;
  return true;
}

/** @deprecated Use upgradeBombeBranch instead. Kept for any legacy callers during migration. */
export function upgradeBombe(save: SaveData): boolean {
  // Legacy single-ladder: try to upgrade the cheapest maxed branch (thrift → speed → insight)
  for (const branch of ['thrift', 'speed', 'insight'] as BombeBranch[]) {
    if (upgradeBombeBranch(save, branch)) return true;
  }
  return false;
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
