// DARTER — the dash-duelist (enemy overhaul). Extracted to its own module (mirrors
// src/bosses/*) because its behaviour is a reactive 4-phase state machine, not a one-liner.
//
// It counter-lunges ALONG YOUR LINE, but ONLY when you dash TOWARD it (within range + a
// cone). The phases: PATROL (slow approach, watching for a dash to bait) → WINDUP (a
// telegraphed brace; the counter line is locked to your dash direction) → COUNTER (a
// committed, COASTING lunge — sidestep/parry-able) → RECOVER (wide-open and slow, easy to
// punish). A cooldown gates re-triggering. Deterministic: it reads replayed player state
// only, draws ZERO world.rng — the seeded Daily stays bit-identical.

import { DARTER } from '../tune';
import { norm, clamp } from '../vec';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Does the player's CURRENT dash aim toward this darter? The counter trigger. PURE:
 *  `dpx,dpy` = darter − player; `ddx,ddy` = the dash UNIT direction; `range` = max
 *  distance; `cosCone` = cos(half-cone). True iff the darter is inside the dash range
 *  AND within the forward cone of the dash. Exported for the unit test. */
export function darterDetectsDash(
  dpx: number,
  dpy: number,
  ddx: number,
  ddy: number,
  range: number,
  cosCone: number,
): boolean {
  const d = Math.hypot(dpx, dpy);
  if (d > range || d < 1e-3) return false;
  const dot = (dpx / d) * ddx + (dpy / d) * ddy; // alignment of the dash with darter heading
  return dot >= cosCone;
}

/** The darter state machine. e.phase: 0 PATROL · 1 WINDUP · 2 COUNTER · 3 RECOVER.
 *  e.timer = phase countdown; e.fireTimer = re-counter cooldown; e.angle = locked counter
 *  line; e.telegraph = wind-up 0..1. */
export function updateDarter(e: Enemy, world: World, dt: number): void {
  const p = world.player;
  switch (e.phase) {
    case 0: {
      // PATROL — slow dueling approach; bait a dash aimed at us (cooldown-gated)
      const [nx, ny] = norm(p.x - e.x, p.y - e.y);
      e.vx = nx * DARTER.patrolSpeed * e.speedMul;
      e.vy = ny * DARTER.patrolSpeed * e.speedMul;
      e.telegraph = 0;
      if (e.fireTimer > 0) e.fireTimer -= dt;
      if (
        e.fireTimer <= 0 &&
        p.phase === 'dashing' &&
        darterDetectsDash(e.x - p.x, e.y - p.y, p.dashDirX, p.dashDirY, DARTER.counterRange, DARTER.counterCos)
      ) {
        e.phase = 1;
        e.timer = DARTER.counterWindup;
        e.angle = Math.atan2(p.dashDirY, p.dashDirX); // lock the counter line — "along your line"
      }
      break;
    }
    case 1: {
      // WINDUP — brace + telegraph; the wide-open bait window. Then commit the lunge.
      e.vx *= 0.3;
      e.vy *= 0.3;
      e.timer -= dt;
      e.telegraph = clamp(1 - e.timer / DARTER.counterWindup, 0, 1);
      if (e.timer <= 0) {
        e.vx = Math.cos(e.angle) * DARTER.counterSpeed * e.speedMul;
        e.vy = Math.sin(e.angle) * DARTER.counterSpeed * e.speedMul;
        e.phase = 2;
        e.timer = DARTER.counterTime;
        e.telegraph = 0;
      }
      break;
    }
    case 2: {
      // COUNTER — the committed lunge COASTS (no re-steer) so a sidestep/parry beats it
      e.timer -= dt;
      if (e.timer <= 0) {
        e.phase = 3;
        e.timer = DARTER.recoverTime;
        e.vx *= 0.2;
        e.vy *= 0.2;
      }
      break;
    }
    default: {
      // RECOVER — slow + wide-open (punish it here), then back to patrol on cooldown
      e.vx *= 0.85;
      e.vy *= 0.85;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.phase = 0;
        e.fireTimer = DARTER.cooldown;
      }
      break;
    }
  }
}
