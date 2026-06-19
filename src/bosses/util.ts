// Shared boss helpers. Pure — no rng, no side effects (the determinism contract:
// low-HP escalation is an HP predicate, never a fresh world.rng draw).
import { ZONE } from '../tune';
import type { Enemy } from '../types';

/** Universal low-HP ENRAGE gate: below `frac` of max HP a boss changes BEHAVIOR
 *  (a second beam, two closing gaps, a rear back-spray) — not just its fire rate.
 *  Pure HP read, so it stays bit-identical on a replay. */
export function bossEnraged(e: Enemy, frac: number): boolean {
  return e.hp / e.maxHp < frac;
}

/** ZONE the player: nudge a boss's drift target (curTx,curTy) TOWARD the player by
 *  `bias` so the boss pressures the player's spot instead of letting them turtle a
 *  safe corner. A fraction of the way (modest bias keeps the readable lissajous wander),
 *  clamped to the arena with a margin so the boss never leaves bounds. Pure: reads only
 *  the player position (already seeded state) + arena dims — NO rng. bias=0 is identity. */
export function zoneTarget(
  px: number, py: number, arenaW: number, arenaH: number, curTx: number, curTy: number, bias: number,
): { tx: number; ty: number } {
  const m = ZONE.margin;
  const tx = clampRange(curTx + bias * (px - curTx), m, arenaW - m);
  const ty = clampRange(curTy + bias * (py - curTy), m, arenaH - m);
  return { tx, ty };
}

function clampRange(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
