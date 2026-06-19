// Pure PARRY geometry + reward math. The second combat verb: a short, aim-directed
// deflect arc that destroys only the bullets INSIDE the arc (no blanket i-frames —
// that's the dash's job). No state, no RNG — unit-tested in isolation like dash.ts.

import { PARRY, TUNE } from './tune';
import { maxStamina } from './dash';
import { chargeOverdrive, type OverdriveState } from './overdrive';
import { coherenceBeatKick, coherenceBeatFlash, type CoherenceState } from './coherence';

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

/** Minimal combo/meter surface a parry reward mutates (the World satisfies it structurally). */
export interface ParryComboState {
  combo: number;
  comboTimer: number;
  bestComboRun: number;
  overdrive: OverdriveState;
}

/** Apply a successful parry's reward — stamina refund, combo, overdrive, and a COHERENCE
 *  kick — all DOUBLED on the beat (the beat's first mechanical teeth). Pure struct math
 *  (no audio/particles), so it's unit-tested; game.ts adds only the cosmetic juice. */
export function applyParryReward(
  player: { stamina: number },
  combo: ParryComboState,
  coherence: CoherenceState,
  staminaSegments: number,
  onBeat: boolean,
): void {
  const rw = parryReward(onBeat);
  player.stamina = Math.min(maxStamina(staminaSegments), player.stamina + rw.stamina);
  combo.combo += rw.combo;
  if (combo.combo > combo.bestComboRun) combo.bestComboRun = combo.combo;
  combo.comboTimer = Math.max(combo.comboTimer, TUNE.combo.window);
  chargeOverdrive(combo.overdrive, rw.overdrive);
  coherenceBeatKick(coherence, onBeat);
  coherenceBeatFlash(coherence, onBeat);
}

/** Sweep hostile bullets through the parry arc, deflecting those inside it (boss bullets
 *  capped by the budget). The caller injects iteration + the destroy side effect, so this
 *  control-flow stays pure + unit-tested and game.ts stays thin. Returns the deflect counts:
 *  `total` (for the reward/whiff decision) and `boss` (drives the boss guard-shave). */
export function parrySweep<B extends { x: number; y: number; fromBoss: boolean }>(
  px: number,
  py: number,
  aim: number,
  bossBudget: number,
  forEach: (visit: (b: B) => void) => void,
  destroy: (b: B) => void,
): { total: number; boss: number } {
  let bossUsed = 0;
  let deflected = 0;
  forEach((b) => {
    if (!parryArcContains(px, py, aim, b.x, b.y)) return;
    if (b.fromBoss) {
      if (!parryDeflectsBoss(bossBudget, bossUsed)) return;
      bossUsed++;
    }
    destroy(b);
    deflected++;
  });
  return { total: deflected, boss: bossUsed };
}

/** The RIPOSTE arc — sweep enemies whose centre lies inside the parry wedge and fire the
 *  caller's hit (counter-burst) on each. Geometry-only (no per-bullet source lookup), so it
 *  stays deterministic + testable; game.ts injects the spatial-hash iteration + damage. */
export function parryEnemySweep<E extends { x: number; y: number }>(
  px: number,
  py: number,
  aim: number,
  forEach: (visit: (e: E) => void) => void,
  hit: (e: E) => void,
): number {
  let n = 0;
  forEach((e) => {
    if (!parryArcContains(px, py, aim, e.x, e.y)) return;
    hit(e);
    n++;
  });
  return n;
}

/** The cooldown a parry sets on resolution: a SUCCESS flows (short `flowCooldown` so skilled
 *  parrying chains); a WHIFF eats the long `cooldown` (spamming is punished). */
export function parryCooldownAfter(success: boolean): number {
  return success ? PARRY.flowCooldown : PARRY.cooldown;
}

/** Outward shove applied to an un-parried bullet near the player on a successful parry —
 *  a small defensive breathing-room push. Returns the velocity delta (0,0 outside `radius`).
 *  Deterministic: the direction is the pure player→bullet vector. */
export function parryShove(
  px: number,
  py: number,
  bx: number,
  by: number,
  push: number,
  radius: number,
): { dvx: number; dvy: number } {
  const dx = bx - px;
  const dy = by - py;
  const d = Math.hypot(dx, dy);
  if (d > radius || d < 1e-6) return { dvx: 0, dvy: 0 };
  return { dvx: (dx / d) * push, dvy: (dy / d) * push };
}

/** Boss posture-break: shave the armored-phase timer by `shave` per parried boss bullet,
 *  never below `floor` (so a parry brings the EXPOSE window sooner without skipping the
 *  phase outright). Budget-capped upstream via parrySweep's boss count. Pure arithmetic. */
export function boundedGuardShave(timer: number, bossDeflected: number, shave: number, floor: number): number {
  return Math.max(floor, timer - shave * bossDeflected);
}
