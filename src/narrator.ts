// src/narrator.ts — PURE, weighted, no-immediate-repeat line picker for the
// dead-world narrator. NO DOM. It owns its OWN rng (never world.rng/dropRng),
// so it can never perturb a seeded run. The Game wires picks to the existing
// non-blocking ui.toast / ui.announce surfaces. The line pools themselves are
// added (as data) in the Phase 4 "voice" pass.
import { createRng } from './rng';

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
