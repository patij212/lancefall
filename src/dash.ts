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

/** The actual stamina a dash costs — the base cost times the relic/mutator
 *  multiplier, but CLAMPED to a full bar so a costly dash can never become
 *  literally unaffordable (which would soft-lock the run, e.g. Glass Spear ×2 on
 *  a single Glass Cannon segment). At worst a dash drains your whole bar. */
export function effectiveDashCost(costMul: number, segments: number): number {
  return Math.min(TUNE.stamina.dashCost * costMul, segments * TUNE.stamina.perSegment);
}

/** Stamina a refund source may grant on THIS dash, clamped so the running total
 *  (`refundThisDash`, shared by kill-refund + Time Thief) never exceeds one dash's
 *  cost. This kills the perpetual-dash loop while keeping the snowball: a good chain
 *  refills ONE dash, but can never bank surplus to dash across an empty arena. */
export function cappedRefund(want: number, refundThisDash: number, dashCost: number): number {
  return Math.max(0, Math.min(want, dashCost - refundThisDash));
}

/** True only for a full (100%) charge — the HEAVY LANCE arm condition. Charge pins
 *  at 1.0 once held to full, so this is a stable hold state, not a timing window. */
export function isFullCharge(charge: number): boolean {
  return charge >= TUNE.dash.heavyChargeMin - 1e-6;
}

/** Where a heavy dash STOPS when it bites a boss/elite: a standoff `dist` from the
 *  boss centre, on the side the player (px,py) is already on — so the spear stabs the
 *  body but you don't faceplant into a contact-lethal boss. Falls back to the dash
 *  heading (dirX,dirY) when the player is dead-centre on the boss. */
export function biteInStop(
  bossX: number, bossY: number, px: number, py: number, dirX: number, dirY: number, dist: number,
): { toX: number; toY: number } {
  let gx = px - bossX, gy = py - bossY;
  let gd = Math.hypot(gx, gy);
  if (gd < 1e-3) { gx = dirX; gy = dirY; gd = Math.hypot(gx, gy) || 1; }
  return { toX: bossX + (gx / gd) * dist, toY: bossY + (gy / gd) * dist };
}

export function canDash(stamina: number, cost: number = TUNE.stamina.dashCost): boolean {
  return stamina >= cost - 1e-6;
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
