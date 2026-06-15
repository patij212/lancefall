// src/stillpoint.ts — THE STILLPOINT meta-layer (PURE display data + helpers).
// No DOM/ctx. The Echo vignette allocates its OWN rng (a mask distinct from every
// sim stream) so it is deterministic per date AND can never perturb the seeded
// Daily run. THE CHOICE narration + nemesis lookup are pure reads of save state.
import { createRng } from './rng';

export type Choice = 'catch' | 'fall' | 'none';

// ── THE CHOICE — on a Sovereign kill, the player decides the kingdom's fate ──
export interface ChoiceEnding {
  head: string;
  line: string;
}
export function choiceEnding(choice: Choice): ChoiceEnding {
  if (choice === 'catch')
    return { head: 'THE LIGHT HOLDS', line: 'You held it. The longest day stands, and the city wakes in full light.' };
  if (choice === 'fall')
    return { head: 'THE LIGHT RELEASED', line: 'You let it go. The day completes, the dark comes gently, and it is finally, mercifully over.' };
  return { head: 'THE LIGHT HOLDS', line: 'Lancefall remembers itself.' };
}

// ── ECHO OF THE FALL — one citizen's last memory, deterministic per daily seed ──
const ECHO_NAMES = [
  'a lamplighter', 'an archivist', 'a gardener', 'a gate-warden', 'a chorister',
  'a clockwright', 'a ferryman', 'a glassblower', 'a cartographer', 'a bell-ringer',
  'a stargazer', 'a stonemason', 'a weaver', 'a vintner', 'a candle-maker', 'a courier',
] as const;
const ECHO_MEMORIES = [
  'remembers the bells, and how the whole street would answer them.',
  'remembers the lattice-lights coming on, one tower at a time.',
  'remembers the gardens in bloom, before the ash.',
  'remembers the river running gold under the bridges.',
  'remembers the choir, and how the king wept to hear it.',
  'remembers the markets at dusk — loud and warm and endless.',
  'remembers the courtyard where the children raced the dark.',
  'remembers the last festival, and not knowing it was the last.',
  'remembers the spires holding the light long after sundown.',
  'remembers a hand held out, and meaning to take it.',
] as const;

export interface EchoVignette {
  citizen: string;
  memory: string;
}
export function echoVignette(daySeed: number): EchoVignette {
  // OWN rng — mask distinct from 0x1f83d9ab / 0x5bd1e995 / 0xc0ffee, so it draws
  // ZERO entropy from any sim stream (the Daily run is identical for everyone).
  const rng = createRng((daySeed ^ 0x5715e6c0) >>> 0);
  return {
    citizen: ECHO_NAMES[rng.int(0, ECHO_NAMES.length - 1)],
    memory: ECHO_MEMORIES[rng.int(0, ECHO_MEMORIES.length - 1)],
  };
}
/** A capitalised one-line citizen vignette for the daily caption / run-start. */
export function echoLine(daySeed: number): string {
  const v = echoVignette(daySeed);
  const s = `${v.citizen} ${v.memory}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── MEMORY FRAGMENTS — earned per descent; the caller pushes the new ids ──
export interface RunFragmentCtx {
  runOrdinal: number; // save.totalRuns (post-increment) → a unique per-run carry id
  bossKills: number;
  deepestWave: number;
  bestComboRun: number;
  sovereignDown: boolean;
}
/** Fragment ids this run qualifies for (caller filters to the not-yet-owned and
 *  pushes them). Pure — no rng. The per-run carry is always unique; the milestone
 *  fragments earn once ever (dedup is the caller's plain includes() check). */
export function fragmentsForRun(c: RunFragmentCtx): string[] {
  const ids = [`run-${c.runOrdinal}`]; // THE LIGHT DIMS — carry one fragment out of every descent
  if (c.bossKills >= 1) ids.push('m-firstboss');
  if (c.deepestWave >= 10) ids.push('m-deep');
  if (c.bestComboRun >= 25) ids.push('m-combo');
  if (c.sovereignDown) ids.push('m-sovereign');
  return ids;
}

// ── NEMESIS — the boss the player has died to most (hub run-state read) ──
export function nemesisOf(nemesis: Record<string, number>): { kind: string; count: number } | null {
  let best: string | null = null;
  let bestN = 0;
  for (const k of Object.keys(nemesis)) {
    const n = nemesis[k] ?? 0;
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best ? { kind: best, count: bestN } : null;
}

// ── NG+ — a difficulty loop unlocked by felling the Sovereign. CRITICAL: this is
//    the only place the loop touches difficulty, and it is HARD-gated to
//    non-seeded modes (any seeded kind: 'date'/Daily or 'week'/Weekly) so a
//    seeded run is bit-identical for everyone regardless of their NG+ progress. ──
export function ngPlusIntensityMul(
  baseMul: number,
  ngPlusActive: boolean,
  ngPlusLevel: number,
  seedKind: string,
  perLoop: number,
  maxLoop: number,
): number {
  if (!ngPlusActive || seedKind === 'date' || seedKind === 'week') return baseMul; // any seeded mode: untouched, always
  const lvl = Math.min(maxLoop, Math.max(0, ngPlusLevel));
  return baseMul * (1 + lvl * perLoop);
}
