// CLUTCH MOMENTS — pure state for the two near-death/hot-streak thrills. The
// effects (slow-mo, bullet shoves, novas, score) live in game.ts; here we only
// own the cooldown/window bookkeeping and the eruption-milestone math so it can
// be unit-tested in isolation.

import { CLUTCH } from './tune';

export interface ClutchState {
  /** seconds until LAST BREATH can save us again (0 = ready) */
  lastBreathCd: number;
  /** seconds of bullet-time window remaining (>0 = currently in a last breath) */
  lastBreathActive: number;
  /** times LAST BREATH fired this run (stats / debrief flavour) */
  lastBreathUses: number;
  /** highest COMBO ERUPTION milestone already detonated this streak */
  lastErupt: number;
}

export function makeClutch(): ClutchState {
  return { lastBreathCd: 0, lastBreathActive: 0, lastBreathUses: 0, lastErupt: 0 };
}

export function resetClutch(c: ClutchState): void {
  c.lastBreathCd = 0;
  c.lastBreathActive = 0;
  c.lastBreathUses = 0;
  c.lastErupt = 0;
}

/** Advance the clutch timers (sim dt — slowed time drains them slower, which is
 *  fine: the cooldown is a soft gate, not a precise clock). */
export function tickClutch(c: ClutchState, dt: number): void {
  if (c.lastBreathCd > 0) c.lastBreathCd = Math.max(0, c.lastBreathCd - dt);
  if (c.lastBreathActive > 0) c.lastBreathActive = Math.max(0, c.lastBreathActive - dt);
}

/** Can LAST BREATH save us right now? (off cooldown, not already mid-window). */
export function canLastBreath(c: ClutchState): boolean {
  return c.lastBreathCd <= 0 && c.lastBreathActive <= 0;
}

/** Consume a LAST BREATH: open the bullet-time window and start the cooldown. */
export function triggerLastBreath(c: ClutchState): void {
  c.lastBreathActive = CLUTCH.lastBreathDuration;
  c.lastBreathCd = CLUTCH.lastBreathCooldown;
  c.lastBreathUses++;
}

/** Reset the eruption tracker when a combo breaks, so the next climb re-arms. */
export function resetErupt(c: ClutchState): void {
  c.lastErupt = 0;
}

/** COMBO ERUPTION milestone check. Returns the milestone (a multiple of
 *  CLUTCH.eruptEvery) to detonate at, or 0 if no fresh milestone was crossed
 *  beyond `lastErupt`. */
export function eruptMilestone(combo: number, lastErupt: number): number {
  if (combo < CLUTCH.eruptEvery) return 0;
  const m = Math.floor(combo / CLUTCH.eruptEvery) * CLUTCH.eruptEvery;
  return m > lastErupt ? m : 0;
}
