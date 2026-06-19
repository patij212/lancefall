// THE SOVEREIGN — pure helpers for the 6th & final boss. Side-effect-free math so
// the tricky bits (gravity-well bullet bending, the rotating crown-beam hit test,
// core orbit geometry) are unit-tested in isolation, and the armor/expose rules
// live in one place. The stateful pattern loop lives in boss.ts (updateSovereign).

import { SOVEREIGN } from './tune';
import type { Enemy } from './types';

/** Velocity delta from the Sovereign's gravity well at (wellX,wellY) on a bullet
 *  at (bx,by) over dt. A softened ~1/d field, so straight volleys bend into
 *  sweeping galaxy arms without blowing up near the body. */
export function gravityPull(bx: number, by: number, wellX: number, wellY: number, dt: number): { dvx: number; dvy: number } {
  const gx = wellX - bx;
  const gy = wellY - by;
  const d = Math.hypot(gx, gy) || 1;
  const a = (SOVEREIGN.gravity * dt) / (d + SOVEREIGN.gravitySoftening);
  return { dvx: (gx / d) * a, dvy: (gy / d) * a };
}

/** Even-spaced orbit position for core `index` of `count`, spun to angle `spin`. */
export function coreOrbitPos(
  cx: number, cy: number, spin: number, index: number, count: number, radius: number,
): { x: number; y: number; angle: number } {
  const angle = spin + (index / count) * Math.PI * 2;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle };
}

/** True if (px,py) lies within halfWidthPlusR of any of the `arms` diameter beams
 *  through (cx,cy) at base angle. Beams are full diameters, so spaced by π/arms. */
export function beamHitsPoint(
  cx: number, cy: number, baseAngle: number, arms: number, halfWidthPlusR: number, px: number, py: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  for (let k = 0; k < arms; k++) {
    const a = baseAngle + (k * Math.PI) / arms;
    const perp = Math.abs(dx * -Math.sin(a) + dy * Math.cos(a));
    if (perp <= halfWidthPlusR) return true;
  }
  return false;
}

// ── Phase predicates — the rules in one place ──

/** EXPOSED: all cores down, body vulnerable (the punish window). */
export function isSovereignExposed(e: Enemy): boolean {
  return e.kind === 'sovereign' && e.phase === 2;
}

/** While armored (not exposed) the body ignores dash damage — shatter the cores. */
export function sovereignBodyArmored(e: Enemy): boolean {
  return e.kind === 'sovereign' && e.phase !== 2;
}

/** The crown beams are lethal only during their active sub-phase. */
export function sovereignBeamActive(e: Enemy): boolean {
  return e.kind === 'sovereign' && e.phase === 0 && e.subPhase === 1;
}

/** Crack the crown open: enter the EXPOSED punish window. */
export function exposeSovereign(e: Enemy): void {
  e.phase = 2;
  e.timer = SOVEREIGN.exposeDuration;
  e.fireTimer = 0;
  e.subPhase = 0;
  e.ringTimer = SOVEREIGN.exposeRingEvery; // arm the first desperation ring
}

/** FINALE: below the finale HP fraction the crown stops reforming — the body stays
 *  open and the armored volleys (beams + spiral) fire WITH the expose ring. The
 *  "everything at once" climax. Pure HP predicate (no rng, no timing state). */
export function sovereignFinale(e: Enemy): boolean {
  return e.kind === 'sovereign' && e.hp / e.maxHp < SOVEREIGN.finaleFrac;
}

/** On-beat dash TEETH: shattering a Sovereign core ON THE BEAT doubles the crown chunk
 *  it deals (the beat's mechanical reward vs the final boss). Pure — fixed multiplier, no rng. */
export function sovereignCoreBonusForBeat(onBeat: boolean): number {
  return onBeat ? SOVEREIGN.coreWeakBonus * 2 : SOVEREIGN.coreWeakBonus;
}

/** NOVA SPIRAL wind-up progress 0..1 from the telegraph countdown `fireTimer`
 *  (fireTimer = spiralTelegraph at entry, 0 when the spiral arms). Pure ramp for
 *  the tracer draw; clamped so it reads correctly at the window edges. */
export function novaSpiralTelegraphFrac(fireTimer: number): number {
  const f = 1 - fireTimer / SOVEREIGN.spiralTelegraph;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}
