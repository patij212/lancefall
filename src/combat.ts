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

/** §4 M3 — completion bonus for a WINNABLE mode: a speed bonus that decays with clear
 *  time, plus a flat reward for a flawless (no-hit) clear. Pure; both scale by scoreMul. */
export function clearTimeBonus(clearTime: number, hitsTaken: number, scoreMul: number): number {
  const s = TUNE.score;
  const speed = Math.round(Math.max(0, s.timeBonusBase - clearTime * s.timeBonusPerSec) * scoreMul);
  const noHit = hitsTaken === 0 ? Math.round(s.noHitBonus * scoreMul) : 0;
  return speed + noHit;
}

export function shouldSlowmo(killsThisDash: number): boolean {
  return killsThisDash >= TUNE.juice.slowmoChainThreshold;
}

/** PERFECT THREAD — true only the first time a single dash reaches the graze
 *  threshold. `alreadyFired` is the per-dash one-shot latch, so this stays a
 *  single reward no matter how many further grazes land in the same dash. */
export function perfectThreadReady(grazesThisDash: number, alreadyFired: boolean): boolean {
  return !alreadyFired && grazesThisDash >= TUNE.perfectThread.threshold;
}

/** Combo-scaled score awarded by a PERFECT THREAD. */
export function perfectThreadScore(combo: number): number {
  return Math.round(TUNE.perfectThread.score * comboMultiplier(combo));
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

/** Register a kill: bump combo and refresh the decay window. The window GROWS
 *  with the streak (longer chains earn more grace), capped at windowMax — so a
 *  hot run is more forgiving than a cold one. windowPerCombo applies to the
 *  JUST-EARNED kill (next), and the test mirrors that exact choice. */
export function registerKill(combo: number): { combo: number; timer: number } {
  const next = combo + 1;
  const timer = Math.min(TUNE.combo.window + next * TUNE.combo.windowPerCombo, TUNE.combo.windowMax);
  return { combo: next, timer };
}

/** Hitstop duration (seconds) for a dash that killed `killsThisDash` enemies. */
export function hitstopFor(killsThisDash: number): number {
  const extra = Math.max(0, killsThisDash - 1);
  return Math.min(
    TUNE.juice.hitstopBase + extra * TUNE.juice.hitstopPerExtra,
    TUNE.juice.hitstopMax,
  );
}
