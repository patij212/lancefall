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

/** True once a SUSTAINED overcharge (holding past full charge) reaches the heavy arm
 *  window — the HEAVY LANCE condition. A normal full-charge release (overcharge 0) is
 *  NOT heavy; you must keep holding ~heavyOverchargeTime longer to arm it. */
export function isHeavyArmed(overcharge: number): boolean {
  return overcharge >= TUNE.dash.heavyOverchargeTime - 1e-6;
}

export function canDash(stamina: number, cost: number = TUNE.stamina.dashCost): boolean {
  return stamina >= cost - 1e-6;
}

/** State for the blocking-popup interrupt gate (perk draft / run event). Lives on the
 *  game; advanced once per frame by {@link tickInterruptGate}. */
export interface InterruptGate {
  /** seconds of post-dash settle still owed before a popup may open (kept primed while busy) */
  busyTimer: number;
  /** seconds a popup has been queued-but-held (drives the anti-soft-lock cap) */
  heldTime: number;
}

/** Advance the interrupt gate one frame and decide whether a queued blocking popup may
 *  open NOW. While the player is `busy` (mid-charge or mid-dash) the settle grace is held
 *  full, so a popup never slams in over a committed dash; after the dash it drains over
 *  `grace` seconds ("right after it"). A popup held past `maxDefer` opens regardless, so a
 *  perpetually-held charge can never soft-lock the queue. Pure — the caller freezes the
 *  director while a popup is pending, so holding it shifts no seeded schedule. */
export function tickInterruptGate(
  gate: InterruptGate,
  busy: boolean,
  pending: boolean,
  dt: number,
  grace: number = TUNE.dash.interruptGrace,
  maxDefer: number = TUNE.dash.interruptMaxDefer,
): boolean {
  gate.busyTimer = busy ? grace : Math.max(0, gate.busyTimer - dt);
  if (!pending) {
    gate.heldTime = 0;
    return false;
  }
  if (gate.busyTimer <= 0) {
    gate.heldTime = 0;
    return true; // settled out of the dash → open
  }
  gate.heldTime += dt;
  return gate.heldTime >= maxDefer; // held too long → force-open (never starve the queue)
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
