// Pure helpers for the REFLECTABLE ORB — the parry-as-offense verb. A boss fires a big,
// slow, telegraphed orb; a PARRY flings it BACK as a player-owned (friendly) bullet that
// damages the boss. No state, no RNG — unit-tested in isolation like parry.ts / dash.ts.

import type { Bullet } from './types';

/** Velocity for an orb at (bx,by) reflected to travel toward the boss at (ex,ey), at
 *  `speed`. If the orb sits exactly on the boss centre, fall back to a safe +x heading
 *  (never NaN). Pure. */
export function reflectVelocity(
  bx: number, by: number, ex: number, ey: number, speed: number,
): { vx: number; vy: number } {
  const dx = ex - bx;
  const dy = ey - by;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { vx: speed, vy: 0 };
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

/** Is this bullet a parryable boss ORB? (a boss-fired bullet flagged reflectable). Pure. */
export function isReflectableOrb(b: Pick<Bullet, 'fromBoss' | 'reflectable'>): boolean {
  return !!b.reflectable && b.fromBoss;
}
