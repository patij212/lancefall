// src/renderMath.ts — PURE coherence→render number mappings, including EVERY
// accessibility gate. render.ts applies the returned scalars to canvas ops; this
// module owns the math so the a11y behavior is unit-tested, not just described.
// No DOM, no ctx — imports only the COHERENCE knobs.
import { COHERENCE as CO } from './tune';

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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
): number {
  let cc = clamp01(c);
  if (reduceFlashing) cc = Math.min(cc, CO.flashCap);
  const fp = reduceFlashing || reduceMotion || clarity ? 0 : clamp01(focusPulse);
  let sat = CO.satFloor + CO.washGain * cc + CO.focusSnapLift * fp;
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
