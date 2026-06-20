// src/cityVoice.ts — THE CITY SPEAKS. The delivery layer that makes lancefall's authored story
// land on the median path. PURE: no DOM, no ctx, and (determinism invariant) NO './rng' import.
// Citizens wake through PLAY here (deed-wake), in parallel to decryption; the Codebreaker still
// gates the deeper truth. Also: the dose (ceremony vs toast), the Vigil's Heat floor, and the
// personified long-game composers.
import type { SaveData } from './save';
import { daysHeld } from './ending';
import { MAX_HEAT } from './heat';

/** Run-stats a deed predicate reads. Filled by the caller from World/run state. */
export interface RunDeedCtx {
  bossKindsKilled: string[]; // EnemyKind ids of bosses felled this run
  sovereignDown: boolean;
  bestCombo: number;
  bossKills: number;
  daybreaks: number;     // overdrive/DAYBREAK fires this run
  maxDashChain: number;  // most kills in one dash this run
  timeSec: number;       // elapsed run seconds
  wave: number;          // deepest wave reached
}

/** Each citizen id → the predicate that wakes them through play. Pure. */
const DEEDS: Record<string, (c: RunDeedCtx) => boolean> = {
  // the 6 figure-tied — you meet the person as you fell the keeper they served
  gatewarden:    (c) => c.bossKindsKilled.includes('warden'),
  chorister:     (c) => c.bossKindsKilled.includes('weaver'),
  ferryman:      (c) => c.bossKindsKilled.includes('beacon'),
  glassblower:   (c) => c.bossKindsKilled.includes('mirrorblade'),
  stonemason:    (c) => c.bossKindsKilled.includes('hollow'),
  courier:       (c) => c.bossKindsKilled.includes('sovereign'),
  // the longest day — the Vintner's wine, opened on the Sovereign kill
  vintner:       (c) => c.sovereignDown,
  // the others, on fitting deeds
  lamplighter:   (c) => c.bestCombo >= 10,   // the first window lights
  candlemaker:   (c) => c.bestCombo >= 25,   // light against the dark
  bellringer:    (c) => c.timeSec >= 90,     // the hours kept
  archivist:     (c) => c.wave >= 8,         // the long evening, recorded
  cartographer:  (c) => c.wave >= 12,        // mapped far
  clockwright:   (c) => c.maxDashChain >= 4, // the mechanism aligned
  stargazer:     (c) => c.daybreaks >= 1,    // watched for the dawn
  gardener:      (c) => c.timeSec >= 210,    // reached the Bloomgardens (biome 3 ≥ 3×70s)
  'weaver-cloth':(c) => c.bossKills >= 3,    // the city's colours rewoven
};

export function deedsMet(ctx: RunDeedCtx): string[] {
  return Object.keys(DEEDS).filter((id) => DEEDS[id](ctx));
}

// The dose: the 6 figure-tied + the 2 milestone citizens get the "A FACE REMEMBERED" ceremony;
// everything else is a restrained toast (restraint preserved for the common case).
export const CEREMONY_CITIZENS: ReadonlySet<string> = new Set([
  'gatewarden', 'chorister', 'ferryman', 'glassblower', 'stonemason', 'courier', 'candlemaker', 'weaver-cloth',
]);
export function wakeIsCeremony(citizenId: string): boolean {
  return CEREMONY_CITIZENS.has(citizenId);
}

// THE VIGIL'S WEIGHT — holding the light raises the Heat floor (the dark presses in). Pure read off
// daysHeld; resets to 0 the moment the day is let turn (daysHeld returns 0 when not catch/released).
// The non-seeded gate lives at the call site (game.ts) so the Daily stays bit-identical.
export function vigilHeatFloor(save: SaveData): number {
  return Math.min(MAX_HEAT, Math.floor(daysHeld(save) / 5));
}
