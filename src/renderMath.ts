// src/renderMath.ts — PURE coherence→render number mappings, including EVERY
// accessibility gate. render.ts applies the returned scalars to canvas ops; this
// module owns the math so the a11y behavior is unit-tested, not just described.
// No DOM, no ctx — imports only the COHERENCE knobs.
import { COHERENCE as CO, PERF } from './tune';

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── PERF gates (perf-only; NOT coherence/a11y). Each returns the FULL-QUALITY value
//    at quality 1, so the look is unchanged at full quality; only the adaptive
//    director stepping quality DOWN sheds the heaviest fill-rate ops. ──

/** Number of drifting nebula gradient blobs to draw — the heaviest per-frame fill.
 *  Full count at quality 1; thinned once the director steps quality below the cut. */
export function nebulaBlobCount(quality: number): number {
  return quality < PERF.nebulaCutQuality ? PERF.nebulaBlobsLow : PERF.nebulaBlobsFull;
}

/** Per-frame shadowBlur (in px, already ×dpr by the caller's `dpr` arg) for the boss-name
 *  slam — dropped to 0 under load (shadowBlur is a costly GPU op). Identical at quality 1. */
export function bossEntranceBlur(quality: number, dpr: number): number {
  return quality < PERF.blurCutQuality ? 0 : PERF.bossEntranceBlur * dpr;
}

/** Whether the chromatic-aberration channel-split (a 3× full-screen redraw) is allowed
 *  this frame. Only at/above the cut quality; suppressed under load (the buffer is drawn
 *  straight instead). True whenever quality is full → look unchanged at quality 1. */
export function allowChromaticAberration(quality: number): boolean {
  return quality >= PERF.caCutQuality;
}

/** Saturation multiplier 0..1 for the global gray→neon wash (1 = full colour,
 *  satFloor ≈ gray static). A Perfect-dash focusPulse briefly snaps toward full
 *  colour. reduceFlashing caps the swing; reduceMotion/reduceFlashing kill the
 *  snap (a full-field swell reads as motion/flash); Clarity floors saturation so
 *  the WHOLE FRAME never desaturates below readability (no separate play-layer mask). */
export function washSaturation(
  c: number,
  focusPulse: number,
  reduceFlashing: boolean,
  reduceMotion: boolean,
  clarity: boolean,
  collapseDip = 0,
): number {
  let cc = clamp01(c);
  if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
  const gated = reduceFlashing || reduceMotion || clarity;
  const fp = gated ? 0 : clamp01(focusPulse);
  // C3 — the felt FALL: a brief downward saturation lurch on a dead chain. A full-field
  // darken reads as motion/flash, so it dies under all three a11y flags (mirrors fp).
  const dip = gated ? 0 : clamp01(collapseDip);
  let sat = CO.satFloor + CO.washGain * cc + CO.focusSnapLift * fp - CO.collapseDipDrop * dip;
  if (clarity) sat = Math.max(sat, CO.clarityFloor);
  return clamp01(sat);
}

/** Bottom neon city-glow band alpha (the foreground anchor the eye lands on).
 *  Clarity freezes the swing to a constant (parity with the other coherence
 *  visuals); reduceFlashing caps the ceiling. The band carries no danger info. */
export function cityGlowAlpha(c: number, reduceFlashing: boolean, clarity: boolean): number {
  if (clarity) return clamp01(CO.cityGlowBase);
  let cc = clamp01(c);
  if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
  return clamp01(CO.cityGlowBase + CO.cityGlowGain * cc);
}

/** Parallax skyline band alpha — a ghost at coherence 0, the resolved city at 1. */
export function skylineAlpha(c: number): number {
  return clamp01(CO.skylineFloor + CO.skylineGain * clamp01(c));
}

/** Skyline window-lights switch on once the city is coherent enough. */
export function showWindows(c: number): boolean {
  return clamp01(c) >= CO.windowThreshold;
}

/** Background (nebula/stars/skyline) exposure — dims as the world loses coherence.
 *  No brightness swing under reduceFlashing. */
export function bgExposure(c: number, reduceFlashing: boolean): number {
  if (reduceFlashing) return 1;
  return CO.exposureBase + CO.exposureGain * clamp01(c);
}

/** Vignette deepen multiplier — low coherence closes the world in. Gated OFF
 *  under reduceFlashing / reduceMotion / clarity (returns 1 = no change). */
export function vignetteDeepenFactor(
  c: number,
  reduceFlashing: boolean,
  reduceMotion: boolean,
  clarity: boolean,
): number {
  if (reduceFlashing || reduceMotion || clarity) return 1;
  return 1 + CO.vignetteDeepen * (1 - clamp01(c));
}

/** Ink-ribbon trail brightness 0..1 — dims with low coherence; a fixed high
 *  constant under Clarity; clamped by reduceFlashing. */
export function trailBrightness(c: number, reduceFlashing: boolean, clarity: boolean): number {
  if (clarity) return 1;
  let cc = clamp01(c);
  if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
  return CO.trailDim + (1 - CO.trailDim) * cc;
}

/** C1 (v6 §1) — the LOCALIZED beat-grade ring around the player. Unlike the frame-wide
 *  wash it is NOT killed by Clarity: a small player-anchored element is allowed under all
 *  a11y gates (parity with the opt-in beat-ring). reduceFlashing caps the alpha;
 *  reduceMotion freezes the radius (no growing-ring motion). */
export function beatFlashRing(
  beatFlash: number,
  reduceFlashing: boolean,
  reduceMotion: boolean,
): { alpha: number; radiusLift: number } {
  const b = clamp01(beatFlash);
  let alpha = CO.beatRingAlpha * b;
  if (reduceFlashing) alpha = Math.min(alpha, CO.beatRingAlphaCap);
  const radiusLift = (reduceMotion ? CO.beatRingRadiusLift * 0.5 : CO.beatRingRadiusLift) * b;
  return { alpha: clamp01(alpha), radiusLift };
}

/** C4 (v6 §1) — the CITY MEMORY meter readout: a fill 0..1 (= coherence) and a gray→neon
 *  tint scalar (gated like cityGlowAlpha: Clarity freezes it, reduceFlashing caps it). */
export function cityMemoryFill(c: number, reduceFlashing: boolean, clarity: boolean): { fill: number; neon: number } {
  const fill = clamp01(c);
  let neon: number;
  if (clarity) neon = 1;
  else {
    let cc = fill;
    if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
    neon = CO.cityMemFloor + (1 - CO.cityMemFloor) * cc;
  }
  return { fill, neon: clamp01(neon) };
}

/** C4 (v6 §1) — the dash-spear alpha lifts with coherence (momentum lights the world).
 *  Parity with trailBrightness: Clarity → full, reduceFlashing caps; floor keeps the dash
 *  always visible. Localized to the spear → survives the frame-wide wash gates. */
export function spearNeonLift(c: number, reduceFlashing: boolean, clarity: boolean): number {
  if (clarity) return 1;
  let cc = clamp01(c);
  if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
  return clamp01(CO.spearNeonFloor + CO.spearNeonGain * cc);
}
