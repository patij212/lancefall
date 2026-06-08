// Pure charge-dash kinematics + stamina math. Used by player.ts and tested directly.

import { TUNE } from './tune';
import { lerp, easeOutQuad, clamp } from './vec';

/** Dash length in px for a given charge 0..1. */
export function chargeToLen(charge: number): number {
  const c = clamp(charge, 0, 1);
  return lerp(TUNE.dash.minLen, TUNE.dash.maxLen, easeOutQuad(c));
}

/** Travel time in seconds for a dash of the given length. */
export function dashDuration(len: number): number {
  return Math.max(TUNE.dash.minDuration, len / TUNE.dash.speed);
}

/** Total invulnerability window for a dash of the given length. */
export function iframeFor(len: number): number {
  return dashDuration(len) + TUNE.dash.iframeGrace;
}

/** Max stamina given a number of segments (perks can add segments). */
export function maxStamina(segments: number): number {
  return segments * TUNE.stamina.perSegment;
}

export function canDash(stamina: number): boolean {
  return stamina >= TUNE.stamina.dashCost - 1e-6;
}

/** Advance stamina by dt seconds given the regen lockout timer (also returned). */
export function regenStamina(
  stamina: number,
  regenDelay: number,
  dt: number,
  max: number,
  regenPerSec: number = TUNE.stamina.regenPerSec,
): { stamina: number; regenDelay: number } {
  let delay = regenDelay - dt;
  let s = stamina;
  if (delay <= 0) {
    delay = 0;
    s = Math.min(max, s + regenPerSec * dt);
  }
  return { stamina: s, regenDelay: delay };
}
