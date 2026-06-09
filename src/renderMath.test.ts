import { describe, it, expect } from 'vitest';
import { COHERENCE } from './tune';
import {
  clamp01,
  lerp,
  washSaturation,
  cityGlowAlpha,
  skylineAlpha,
  showWindows,
  bgExposure,
  vignetteDeepenFactor,
  trailBrightness,
} from './renderMath';

describe('renderMath — coherence→render mappings + a11y gates', () => {
  it('clamp01 + lerp basics', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('washSaturation rises with coherence and stays in [0,1]', () => {
    let prev = -1;
    for (let c = 0; c <= 1.0001; c += 0.1) {
      const s = washSaturation(c, 0, false, false, false);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(washSaturation(0, 0, false, false, false)).toBeCloseTo(COHERENCE.satFloor, 6);
  });

  it('washSaturation: focusPulse snaps toward colour but is gated by a11y', () => {
    const base = washSaturation(0.5, 0, false, false, false);
    const snapped = washSaturation(0.5, 1, false, false, false);
    expect(snapped).toBeGreaterThan(base); // perfect-dash snap lifts saturation
    // gated off under reduceFlashing / reduceMotion / clarity
    expect(washSaturation(0.5, 1, true, false, false)).toBeLessThanOrEqual(
      washSaturation(0.5, 0, true, false, false) + 1e-9,
    );
    expect(washSaturation(0.5, 1, false, true, false)).toBe(washSaturation(0.5, 0, false, true, false));
  });

  it('washSaturation: reduceFlashing caps the swing', () => {
    const capped = washSaturation(1, 0, true, false, false);
    const full = washSaturation(1, 0, false, false, false);
    expect(capped).toBeLessThan(full);
    expect(capped).toBeCloseTo(washSaturation(COHERENCE.flashCap, 0, false, false, false), 6);
  });

  it('washSaturation: Clarity floors the play layer (never grays out)', () => {
    expect(washSaturation(0, 0, false, false, true)).toBeGreaterThanOrEqual(COHERENCE.clarityFloor);
  });

  it('cityGlowAlpha rises with coherence, capped by reduceFlashing, frozen under Clarity', () => {
    expect(cityGlowAlpha(0, false, false)).toBeCloseTo(COHERENCE.cityGlowBase, 6);
    expect(cityGlowAlpha(1, false, false)).toBeGreaterThan(cityGlowAlpha(0, false, false));
    expect(cityGlowAlpha(1, true, false)).toBeLessThan(cityGlowAlpha(1, false, false));
    expect(cityGlowAlpha(1, false, true)).toBeCloseTo(COHERENCE.cityGlowBase, 6); // Clarity freezes the swing
  });

  it('skylineAlpha + showWindows', () => {
    expect(skylineAlpha(0)).toBeCloseTo(COHERENCE.skylineFloor, 6);
    expect(skylineAlpha(1)).toBeGreaterThan(skylineAlpha(0));
    expect(showWindows(COHERENCE.windowThreshold)).toBe(true);
    expect(showWindows(COHERENCE.windowThreshold - 0.01)).toBe(false);
  });

  it('bgExposure dims with low coherence, frozen at 1 under reduceFlashing', () => {
    expect(bgExposure(1, false)).toBeGreaterThan(bgExposure(0, false));
    expect(bgExposure(0, true)).toBe(1);
    expect(bgExposure(1, true)).toBe(1);
  });

  it('vignetteDeepenFactor deepens at low coherence, gated off by a11y', () => {
    expect(vignetteDeepenFactor(0, false, false, false)).toBeGreaterThan(1);
    expect(vignetteDeepenFactor(1, false, false, false)).toBeCloseTo(1, 6);
    expect(vignetteDeepenFactor(0, true, false, false)).toBe(1);
    expect(vignetteDeepenFactor(0, false, true, false)).toBe(1);
    expect(vignetteDeepenFactor(0, false, false, true)).toBe(1);
  });

  it('trailBrightness dims with coherence; fixed high under Clarity', () => {
    expect(trailBrightness(0, false, false)).toBeCloseTo(COHERENCE.trailDim, 6);
    expect(trailBrightness(1, false, false)).toBeCloseTo(1, 6);
    expect(trailBrightness(0, false, true)).toBe(1); // Clarity = high-contrast constant
  });
});
