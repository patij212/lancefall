// Pure combo / score / graze economy. The greed engine: kill fast to keep the
// multiplier alive, line up multi-kills in one dash for in-dash bonuses.

import { TUNE } from './tune';

export function comboMultiplier(combo: number): number {
  return Math.min(1 + combo * TUNE.combo.multPerCombo, TUNE.combo.multCap);
}

/** Score awarded for a single kill, given current combo and how many kills
 *  this same dash has already scored (rewards lining enemies up). */
export function scoreForKill(baseScore: number, combo: number, killsThisDash: number): number {
  const mult = comboMultiplier(combo);
  const dashBonus = 1 + killsThisDash * 0.25;
  return Math.round(baseScore * mult * dashBonus);
}

export function grazeScore(combo: number): number {
  return Math.round(TUNE.graze.scorePerGraze * comboMultiplier(combo));
}

export function shouldSlowmo(killsThisDash: number): boolean {
  return killsThisDash >= TUNE.juice.slowmoChainThreshold;
}

/** Advance the combo decay timer. Returns the new combo/timer and whether the
 *  combo just broke this step (for the shatter FX). comboTimer is NOT ticked by
 *  the caller during slow-mo/hitstop — that's enforced upstream. */
export function tickCombo(
  combo: number,
  timer: number,
  dt: number,
): { combo: number; timer: number; broke: boolean } {
  if (combo <= 0) return { combo: 0, timer: 0, broke: false };
  const t = timer - dt;
  if (t <= 0) return { combo: 0, timer: 0, broke: true };
  return { combo, timer: t, broke: false };
}

/** Register a kill: bump combo and refresh the decay window. */
export function registerKill(combo: number): { combo: number; timer: number } {
  return { combo: combo + 1, timer: TUNE.combo.window };
}

/** Hitstop duration (seconds) for a dash that killed `killsThisDash` enemies. */
export function hitstopFor(killsThisDash: number): number {
  const extra = Math.max(0, killsThisDash - 1);
  return Math.min(
    TUNE.juice.hitstopBase + extra * TUNE.juice.hitstopPerExtra,
    TUNE.juice.hitstopMax,
  );
}
