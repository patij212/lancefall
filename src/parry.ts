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
 *  control-flow stays pure + unit-tested and game.ts stays thin. Returns the deflect count. */
export function parrySweep<B extends { x: number; y: number; fromBoss: boolean }>(
  px: number,
  py: number,
  aim: number,
  bossBudget: number,
  forEach: (visit: (b: B) => void) => void,
  destroy: (b: B) => void,
): number {
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
  return deflected;
}
