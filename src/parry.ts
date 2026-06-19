// Pure PARRY geometry + reward math. The second combat verb: a short, aim-directed
// deflect arc that destroys only the bullets INSIDE the arc (no blanket i-frames —
// that's the dash's job). No state, no RNG — unit-tested in isolation like dash.ts.

import { PARRY } from './tune';

/** True if a bullet at (bx,by) lies inside the parry wedge cast from (px,py) toward `aim`. */
export function parryArcContains(px: number, py: number, aim: number, bx: number, by: number): boolean {
  const dx = bx - px;
  const dy = by - py;
  const dist = Math.hypot(dx, dy);
  if (dist > PARRY.reach) return false;
  if (dist < 1e-6) return true; // origin-coincident counts as in-arc
  const d = Math.atan2(Math.sin(Math.atan2(dy, dx) - aim), Math.cos(Math.atan2(dy, dx) - aim));
  return Math.abs(d) <= PARRY.halfAngle;
}

/** Reward for a successful parry; on-beat doubles every component — the beat's teeth. */
export function parryReward(onBeat: boolean): { stamina: number; combo: number; overdrive: number } {
  const m = onBeat ? 2 : 1;
  return {
    stamina: PARRY.staminaReward * m,
    combo: PARRY.comboReward * m,
    overdrive: PARRY.overdriveReward * m,
  };
}

/** Whether this parry may still deflect a boss bullet given a per-parry budget — clamped
 *  to the PARRY cap so a build can never trivialise a boss pattern with the deflect arc. */
export function parryDeflectsBoss(boundBudget: number, used: number): boolean {
  return used < Math.min(boundBudget, PARRY.bossBudget);
}
