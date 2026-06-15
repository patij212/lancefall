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
  /** 0..1 decaying beat-grade ring envelope (BOTH grades; localized, a11y-safe) — C1 */
  beatFlash: number;
  /** 0..1 decaying "felt FALL" dip on a dead chain (frame-wide wash lurch; a11y-gated) — C3 */
  collapseDip: number;
}

export function newCoherence(): CoherenceState {
  return { value: 0, target: 0, focusPulse: 0, tier: 0, beatFlash: 0, collapseDip: 0 };
}

export function resetCoherence(c: CoherenceState): void {
  c.value = 0;
  c.target = 0;
  c.focusPulse = 0;
  c.tier = 0;
  c.beatFlash = 0;
  c.collapseDip = 0;
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
  // A non-finite / non-positive dt (a NaN clock, a backward timestamp, ±Infinity)
  // must spend no time — never poison the dial. An un-guarded NaN here turns value
  // NaN forever (it never recovers), which downstream crashes the vignette gradient.
  if (!Number.isFinite(dt) || dt <= 0) return;
  const rate = c.target > c.value ? CO.riseRate : CO.fallRate;
  // exact exponential smoothing → frame-rate independent (composes across dt splits,
  // so the bloom feels identical on 60/120/144 Hz; at 60fps ~= the old min(1,rate*dt))
  c.value += (c.target - c.value) * (1 - Math.exp(-rate * dt));
  c.focusPulse = Math.max(0, c.focusPulse - dt / CO.focusPulseDecay);
  c.beatFlash = Math.max(0, c.beatFlash - dt / CO.beatFlashDecay);
  c.collapseDip = Math.max(0, c.collapseDip - dt / CO.collapseDipDecay);
}

/** C2/C3 (v6 §1) — edge detection on the dial's OWN thresholds: a chain dying drops the
 *  value DOWN through collapseThreshold (the felt FALL); a rebuild lifts it UP through
 *  windowThreshold (the lights coming on). ONCE per crossing (edge, not level). Pure. */
export function coherenceEdges(prev: number, value: number): { collapsed: boolean; rose: boolean } {
  const collapsed = prev > CO.collapseThreshold && value <= CO.collapseThreshold;
  const rose = prev < CO.windowThreshold && value >= CO.windowThreshold;
  return { collapsed, rose };
}

/** A graded on-beat dash kicks the bus + (perfect) lights the focus-snap. This
 *  is the ONLY beat reward — purely cosmetic, never a sim effect. */
export function coherenceBeatKick(c: CoherenceState, perfect: boolean): void {
  c.value = clamp01(c.value + (perfect ? CO.perfectKick : CO.onbeatKick));
  if (perfect) c.focusPulse = 1;
}

/** C1 (v6 §1) — a graded on-beat dash lights the LOCALIZED beat ring (BOTH grades,
 *  distinct from the Perfect-only focusPulse wash). Cosmetic, never a sim effect. */
export function coherenceBeatFlash(c: CoherenceState, perfect: boolean): void {
  c.beatFlash = perfect ? 1 : CO.beatFlashGood;
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
