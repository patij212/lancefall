// src/coherence.ts — THE SOUL DIAL. A cosmetic ONE-VALUE bus: a single eased
// 0..1 scalar that render + audio both read. PURE — no ctx/DOM, and it NEVER
// touches any seeded rng stream. The Game owns it as a field updated in frame()
// on realDt (never on `world`, never inside step()), so it is structurally
// incapable of perturbing a Daily/seeded run.
import { COHERENCE as CO } from './tune';

export interface CoherenceState {
  /** eased 0..1 — the ONLY scalar render + audio read */
  value: number;
  /** gameplay-derived goal (recomputed each frame, pure) */
  target: number;
  /** 0..1 decaying Perfect-dash "focus snap" envelope */
  focusPulse: number;
  /** 0..6 combo tier (audio root transpose; mirrors COMBO_TIERS cut points) */
  tier: number;
}

export function newCoherence(): CoherenceState {
  return { value: 0, target: 0, focusPulse: 0, tier: 0 };
}

export function resetCoherence(c: CoherenceState): void {
  c.value = 0;
  c.target = 0;
  c.focusPulse = 0;
  c.tier = 0;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Pure target from cosmetic, rng-free run state. Combo dominates but is not the
 *  only input; a dead chain collapses the world to gray; LAST BREATH dims it. */
export function coherenceTarget(
  combo: number,
  comboTimer: number,
  killsThisDash: number,
  lastBreathActive: number,
): number {
  const comboT = 1 - Math.exp(-combo / CO.comboHalf); // soft-knee toward 1
  const dashT = Math.min(1, killsThisDash / CO.dashChainFull); // hot-dash chain bonus
  let t = CO.floor + (1 - CO.floor) * (comboT * CO.comboWeight + dashT * CO.dashWeight);
  if (comboTimer <= 0) t = CO.floor; // chain dead → collapse to gray static
  if (lastBreathActive > 0) t *= CO.lastBreathDim; // THE HUSH (gated in render)
  return clamp01(t);
}

/** Ease value→target on REAL dt. Asymmetric: blooms fast, decays slow. The
 *  focus-snap envelope decays linearly to 0. */
export function tickCoherence(c: CoherenceState, dt: number): void {
  const rate = c.target > c.value ? CO.riseRate : CO.fallRate;
  // exact exponential smoothing → frame-rate independent (composes across dt splits,
  // so the bloom feels identical on 60/120/144 Hz; at 60fps ~= the old min(1,rate*dt))
  c.value += (c.target - c.value) * (1 - Math.exp(-rate * dt));
  c.focusPulse = Math.max(0, c.focusPulse - dt / CO.focusPulseDecay);
}

/** A graded on-beat dash kicks the bus + (perfect) lights the focus-snap. This
 *  is the ONLY beat reward — purely cosmetic, never a sim effect. */
export function coherenceBeatKick(c: CoherenceState, perfect: boolean): void {
  c.value = clamp01(c.value + (perfect ? CO.perfectKick : CO.onbeatKick));
  if (perfect) c.focusPulse = 1;
}

/** Monotone non-decreasing combo→tier index (audio transpose). Reuses the
 *  COMBO_TIERS cut points via CO.tierCombo (so audio lands on the SAME combo
 *  milestones as the on-screen RAMPAGE/FRENZY announcements). */
export function comboTier(combo: number): number {
  const cuts = CO.tierCombo;
  let t = 0;
  for (let i = 0; i < cuts.length; i++) if (combo >= cuts[i]) t = i + 1;
  return t;
}
