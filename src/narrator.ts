// src/narrator.ts — PURE, weighted, no-immediate-repeat line picker for the
// dead-world narrator. NO DOM. It owns its OWN rng (never world.rng/dropRng),
// so it can never perturb a seeded run. The Game wires picks to the existing
// non-blocking ui.toast / ui.announce surfaces. The line pools themselves are
// added (as data) in the Phase 4 "voice" pass.
import { createRng } from './rng';
import type { EnemyKind } from './types';

export type Surface = 'toast' | 'announce';

export interface NarratorState {
  rng: ReturnType<typeof createRng>;
  /** bucket → last picked index (avoid immediate repeats) */
  last: Record<string, number>;
  /** bucket → last surfaced time in seconds (ambient cooldown gate) */
  cooldown: Record<string, number>;
}

export function newNarrator(seed = 0x9e3779b1): NarratorState {
  return { rng: createRng(seed >>> 0), last: {}, cooldown: {} };
}

/** Pure pick: the chosen index for a bucket, never repeating the
 *  immediate-previous index. NOTE: rng.int is INCLUSIVE of its max, so the top
 *  valid index is poolLen - 1. */
export function pickLine(n: NarratorState, bucket: string, poolLen: number): number {
  if (poolLen <= 1) return 0;
  let i = n.rng.int(0, poolLen - 1);
  if (i === n.last[bucket]) i = (i + 1) % poolLen; // no immediate repeat
  n.last[bucket] = i;
  return i;
}

/** Pure cooldown gate for ambient (toast) buckets: returns true if allowed to
 *  fire now (stamping the bucket), false if still within the gap. Keeps the
 *  dead-world narrator restrained and prevents aria-live spam. */
export function ambientReady(n: NarratorState, bucket: string, nowSec: number, gapSec: number): boolean {
  if ((n.cooldown[bucket] ?? -1e9) + gapSec > nowSec) return false;
  n.cooldown[bucket] = nowSec;
  return true;
}

// ── THE NARRATOR POOL (data) ──────────────────────────────────────────────
// The dead world is mostly silent — restraint IS the soul. ~30 terse,
// second-person lines, surfaced on the existing non-blocking toast/announce.
export const NARRATOR = {
  runStart: ['The city is grey. You remember it lit.', 'One lance. One last descent.'],
  firstKill: ['One. The dark notices.'],
  // keyed by the combo-tier cut point (COHERENCE.tierCombo); only some tiers speak
  comboTier: {
    10: 'Ten. The streets begin to remember.',
    20: 'Twenty. A whole street remembers.',
    50: 'Fifty. The whole skyline remembers now.',
    100: 'A hundred. Lancefall stands again.',
  } as Record<number, string>,
  comboBreak: ['The colour drains. Get it back.', 'The city forgets a little. Remind it again.'],
  bossApproach: {
    warden: 'He held the walls, then chose the dark.',
    weaver: 'Find the true thread in all her lies.',
    beacon: 'The light that lied still turns above.',
    mirrorblade: 'It wears your colour. It is your doubt.',
    hollow: "Strike only when it remembers it's real.",
    sovereign: 'It could have saved everything. Make it answer.',
  } as Partial<Record<EnemyKind, string>>,
  bossKill: {
    warden: '"I only locked the doors you forgot."',
    weaver: 'The threads fall slack. The story is yours now.',
    beacon: 'The false light goes out for good.',
    mirrorblade: 'Your doubt, face-down. You outlasted it.',
    hollow: 'You caught it in the one true moment.',
    sovereign: 'The crown is bare. You proved it could be saved.',
  } as Partial<Record<EnemyKind, string>>,
  // keyed by biome index 0..5 (Court / Emberwall / Lattice-vaults / Bloomgardens / Warrens / Null)
  strata: [
    'The throne-hall, gone grey. It started here.',
    'The ramparts still burn at the breach.',
    'The archives, locked. Everything sealed away.',
    'The royal gardens, gone to ruin and seed.',
    "The undercity. Things hatch where light won't reach.",
    'The edge of erasure. Memory runs out here.',
  ],
  lastBreath: ["Not yet. The city isn't done with you."],
  victory: ['The light holds. Lancefall remembers itself.', 'The crown is bare. The kingdom is yours to keep.'],
  highCoherence: ['The city remembers. Hold it here.'],
} as const;
