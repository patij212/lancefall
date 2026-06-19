// Shared boss helpers. Pure — no rng, no side effects (the determinism contract:
// low-HP escalation is an HP predicate, never a fresh world.rng draw).
import type { Enemy } from '../types';

/** Universal low-HP ENRAGE gate: below `frac` of max HP a boss changes BEHAVIOR
 *  (a second beam, two closing gaps, a rear back-spray) — not just its fire rate.
 *  Pure HP read, so it stays bit-identical on a replay. */
export function bossEnraged(e: Enemy, frac: number): boolean {
  return e.hp / e.maxHp < frac;
}
