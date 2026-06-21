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
  runStart: ['The city is grey. You remember it lit.', 'One key. One last descent.'],
  loop: ['Again. The cipher knows your shape now.', 'Down again. The lock remembers your hand.'],
  firstKill: ['One. The noise resolves.'],
  // keyed by the combo-tier cut point (COHERENCE.tierCombo); the city decrypts, tier by tier
  comboTier: {
    10: 'A window lights. Then another.',
    20: 'The street comes back, lamp by lamp.',
    35: 'A whole quarter resolves to light.',
    50: 'The skyline catches. The grey gives ground.',
    75: 'Lancefall blazes. The grey breaks.',    // §E voice-slip fix: restrained form
    100: 'The city stands whole, decrypted, and the day is yours.',
  } as Record<number, string>,
  comboBreak: ['The city forgets a street.', 'A quarter goes dark — the grey takes it back.', 'Block by block, the lights blink out.'],
  // C2/C3 — the dial's own-threshold transients (the FALL, and the lights returning)
  collapse: ['The signal collapses. Lancefall dims.', 'The grey floods back in.', 'The pattern breaks; the dark closes.'],
  rise: ['A window lights. The city remembers a little.', 'The grey gives ground again.', 'The pattern holds — the lights climb back.'],
  // bossApproach[biomeIndex][bossKind]; index 0 (THE COURT) is the generic fallback for every boss.
  // Add located lines at their biome index; the call site falls back to [0] when no match.
  bossApproach: [
    { // 0 — generic fallback (original lines, cover every boss)
      warden: 'He held the walls, then turned the first key against us.',
      weaver: 'She enciphered every thread. Read her, or stay lost.',
      beacon: 'The light that lied still turns above. The key it kept never went out.',
      mirrorblade: 'It wears your colour. It learned you move for move.',
      hollow: 'Its key shows for one instant. Strike then.',
      sovereign: 'The master cipher. It could have unlocked everything.',
    },
    { warden: 'He held the throne, then turned the first key against us.', beacon: 'The beacon should have warned the breach. It stayed dark.' }, // 1 EMBERWALL: Warden + Beacon located
    { weaver: 'She enciphered the vaults shut — every key sealed in her threads.' }, // 2 VAULTS
    { mirrorblade: 'It moves among the bloom-patterns, wearing your colour. The garden learned you too.' }, // 3 BLOOMGARDENS
    { hollow: 'The one who stayed is here, in the dark it could not leave.' }, // 4 WARRENS
    { sovereign: 'The master cipher, at the edge of erasure. It warps the ground to keep the last word from you.' }, // 5 NULL
  ] as Partial<Record<EnemyKind, string>>[],
  bossKill: {
    warden: '"I bolted it from the inside. Forgive me."',
    weaver: 'The cipher unspools. The threads are yours to read now.',
    beacon: 'The true signal turns again. Someone will see it.',
    mirrorblade: 'Your doubt fell. You are still here.',  // §E voice-slip fix: a statement
    hollow: 'You caught the one true instant. Rest now.',
    sovereign: 'The master key turns. You proved it could be undone.',
  } as Partial<Record<EnemyKind, string>>,
  // keyed by biome index 0..5 (Court / Emberwall / Lattice-vaults / Bloomgardens / Warrens / Null)
  strata: [
    'The throne-hall, gone to grey. The first wheel turned here.',
    'The ramparts, still burning at the breach.',
    'The vaults, sealed. Every key locked inside.',
    'The gardens, run to ruin and seed — the old patterns still bloom.',
    "The undercity. Things hatch where the light won't reach.",
    'The edge of erasure. The signal runs out here.',
  ],
  // mid-biome (~30s): teach the biome's rule AS flavour, keyed by biome index 0..5
  biomeBeat: [
    ['The throne-hall remembers. You are reading the code.'],
    ['The heat climbs — the fire is patient, and it accelerates. Read the flame.'],
    ['The vaults lock tighter. Every key sealed inside.'],
    ['The patterns bloom at your touch — the garden is generous here.'],
    ['The undercity stirs. Things move in the shadow, and they wait.'],
    ['The signal dies. Grazing won\'t mend it here — dash, only dash, will save you.'],
  ],
  // late-biome (~60s): the boss nears; the place closes in
  biomeLate: [
    ['The throne-hall closes in.'],
    ['The ramparts burn hotter. Faster. Closer.'],
    ['The vaults seal toward you.'],
    ['The garden riots — all petals and thorns.'],
    ['The undercity swarms.'],
    ['The null reaches the edge of everything.'],
  ],
  descent: ['Below, the signal weakens. The cipher spirals down.', 'Deeper. The dark has further to fall.'],
  lastBreath: ["Not yet. The city isn't decrypted yet."],
  victory: ['The light holds. Lancefall remembers itself.', 'The crown is bare. The day is yours to keep.'],
  // THE LONGEST DAY — the Sovereign-kill DAYBREAK beat (any mode). The summit, paid off.
  daybreak: ['The longest day is won. The light comes back to stay.', 'The code is broken. Dawn over Lancefall.'],
  highCoherence: ['The city resolves. Hold the signal here.'],
  // pre-Sovereign: the moment that is coming is named, so THE CHOICE never arrives cold
  sovereignForeshadow: [
    'The master cipher kept the last word from everyone. It will offer it to you.',
    'There is always a moment. Below, it is waiting for yours.',
  ],
};
