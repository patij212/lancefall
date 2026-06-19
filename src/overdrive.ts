// OVERDRIVE — the combo-charged ultimate. The meter fills as you land kills and
// graze bullets; when full (and off cooldown) the player unleashes a screen-
// clearing time-dilated nova. Pure state + transitions here (the burst's world
// effects live in game.ts). Mutates the passed struct in place — zero allocation,
// fully deterministic (consumes no rng, so Daily stays identical).

import { OVERDRIVE } from './tune';

export interface OverdriveState {
  meter: number; // 0..1
  cooldown: number; // s remaining before it can charge/fire again
  lockTimer: number; // s the combo is frozen after a burst
}

export function makeOverdrive(): OverdriveState {
  return { meter: 0, cooldown: 0, lockTimer: 0 };
}

export function resetOverdrive(od: OverdriveState): void {
  od.meter = 0;
  od.cooldown = 0;
  od.lockTimer = 0;
}

/** A kill charges the meter — more for high-combo kills. No charge while cooling down. */
export function chargeFromKill(od: OverdriveState, combo: number): void {
  if (od.cooldown > 0 || od.meter >= 1) return;
  const gain = combo >= OVERDRIVE.highComboThreshold ? OVERDRIVE.chargePerHighComboKill : OVERDRIVE.chargePerKill;
  od.meter = Math.min(1, od.meter + gain);
}

/** A graze trickles the meter. No charge while cooling down. */
export function chargeFromGraze(od: OverdriveState): void {
  if (od.cooldown > 0 || od.meter >= 1) return;
  od.meter = Math.min(1, od.meter + OVERDRIVE.chargePerGraze);
}

/** Add an explicit amount to the meter (e.g. a PARRY reward). No charge while cooling down. */
export function chargeOverdrive(od: OverdriveState, amount: number): void {
  if (od.cooldown > 0 || od.meter >= 1) return;
  od.meter = Math.min(1, od.meter + amount);
}

export function tickOverdrive(od: OverdriveState, dt: number): void {
  if (od.cooldown > 0) od.cooldown = Math.max(0, od.cooldown - dt);
  if (od.lockTimer > 0) od.lockTimer = Math.max(0, od.lockTimer - dt);
}

export function canActivate(od: OverdriveState): boolean {
  return od.meter >= 1 && od.cooldown <= 0;
}

/** Consume the meter, start the cooldown + combo lock. Returns whether it fired. */
export function activateOverdrive(od: OverdriveState): boolean {
  if (!canActivate(od)) return false;
  od.meter = 0;
  od.cooldown = OVERDRIVE.cooldown;
  od.lockTimer = OVERDRIVE.lockDuration;
  return true;
}
