import { describe, it, expect } from 'vitest';
import { COHERENCE, PERF } from './tune';
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
  beatFlashRing,
  cityMemoryFill,
  spearNeonLift,
  threatRim,
  nebulaBlobCount,
  bossEntranceBlur,
  allowChromaticAberration,
} from './renderMath';

// luminance proxy (Rec.601-ish) for the rim-survives-the-wash assertion
function lum(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/)!;
  const r = +m[1];
  const g = +m[2];
  const b = +m[3];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('renderMath — coherence→render mappings + a11y gates', () => {
  it('C1: beatFlashRing rises with beatFlash, caps alpha (reduceFlashing), freezes radius (reduceMotion), survives all gates', () => {
    const lo = beatFlashRing(0.2, false, false);
    const hi = beatFlashRing(1, false, false);
    expect(hi.alpha).toBeGreaterThan(lo.alpha);
    expect(hi.alpha).toBeLessThanOrEqual(1);
    expect(beatFlashRing(0, false, false).alpha).toBe(0);
    expect(beatFlashRing(1, true, false).alpha).toBe(COHERENCE.beatRingAlphaCap); // reduceFlashing cap
    expect(beatFlashRing(1, false, true).radiusLift).toBe(COHERENCE.beatRingRadiusLift * 0.5); // reduceMotion freeze
    // a LOCALIZED player ring stays visible where the frame-wide wash would be killed
    expect(beatFlashRing(0.8, false, false).alpha).toBeGreaterThan(0);
  });

  it('C3: collapseDip lowers the wash with no flags, and is a no-op under each a11y gate', () => {
    const base = washSaturation(0.5, 0, false, false, false, 0);
    expect(washSaturation(0.5, 0, false, false, false, 1)).toBeLessThan(base); // the FALL darkens
    expect(washSaturation(0.5, 0, true, false, false, 1)).toBe(washSaturation(0.5, 0, true, false, false, 0)); // reduceFlashing
    expect(washSaturation(0.5, 0, false, true, false, 1)).toBe(washSaturation(0.5, 0, false, true, false, 0)); // reduceMotion
    expect(washSaturation(0.5, 0, false, false, true, 1)).toBe(washSaturation(0.5, 0, false, false, true, 0)); // clarity
    expect(washSaturation(0, 0, false, false, false, 1)).toBeGreaterThanOrEqual(0); // never < 0
  });

  it('C4: cityMemoryFill — fill follows coherence; neon gated (clarity const, reduceFlashing capped)', () => {
    expect(cityMemoryFill(0, false, false).fill).toBe(0);
    expect(cityMemoryFill(1, false, false).fill).toBe(1);
    expect(cityMemoryFill(0.5, false, false).neon).toBeGreaterThan(cityMemoryFill(0, false, false).neon);
    expect(cityMemoryFill(1, false, true).neon).toBe(1); // clarity → const full
    expect(cityMemoryFill(1, true, false).neon).toBeLessThanOrEqual(cityMemoryFill(COHERENCE.flashCap, false, false).neon + 1e-9);
  });

  it('C4: spearNeonLift — floors low / rises to 1; clarity full, reduceFlashing capped', () => {
    expect(spearNeonLift(0, false, false)).toBeCloseTo(COHERENCE.spearNeonFloor);
    expect(spearNeonLift(1, false, false)).toBeCloseTo(1);
    expect(spearNeonLift(0.8, false, false)).toBeGreaterThan(spearNeonLift(0.2, false, false));
    expect(spearNeonLift(1, false, true)).toBe(1); // clarity → full
    expect(spearNeonLift(1, true, false)).toBeLessThan(1); // reduceFlashing caps below full
  });

  it('§7b: threatRim lifts a neon colour toward white → higher luminance survives the wash, hue kept', () => {
    const neon = '#ff3b6b'; // a darter pink
    const rim = threatRim(neon, 0.45);
    // a constant outline, no a11y/coherence args → it cannot strobe or react to flags
    expect(rim).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    // the rim is BRIGHTER than the raw neon: the 'saturation' wash keeps luminance, so a
    // higher-luminance edge stays legible even when the frame fully desaturates at low combo
    expect(lum(rim)).toBeGreaterThan(lum('rgb(255,59,107)'));
    // t=0 is a no-op (unchanged colour); t=1 is pure white (max luminance)
    expect(threatRim(neon, 0)).toBe('rgb(255,59,107)');
    expect(threatRim(neon, 1)).toBe('rgb(255,255,255)');
    // monotone: more lift → never-darker channels (each rises toward 255)
    expect(lum(threatRim(neon, 0.6))).toBeGreaterThan(lum(threatRim(neon, 0.2)));
    // but the hue is PRESERVED (R still the dominant channel for a pink) — not flattened to gray
    const m = threatRim(neon, 0.45).match(/rgb\((\d+),(\d+),(\d+)\)/)!;
    expect(+m[1]).toBeGreaterThan(+m[3]); // R > B → still reads pink, not desaturated
    // out-of-range lift clamps (never NaN / never out of 0..255)
    expect(threatRim(neon, 2)).toBe('rgb(255,255,255)');
    expect(threatRim(neon, -1)).toBe('rgb(255,59,107)');
    // accepts 3-digit hex too
    expect(threatRim('#fff', 0)).toBe('rgb(255,255,255)');
  });

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

describe('renderMath — PERF fill-rate gates (look unchanged at quality 1, lighter under load)', () => {
  it('nebulaBlobCount: full count at quality 1; thinned only below the cut', () => {
    expect(nebulaBlobCount(1)).toBe(PERF.nebulaBlobsFull); // full quality → look unchanged
    expect(nebulaBlobCount(PERF.nebulaCutQuality)).toBe(PERF.nebulaBlobsFull); // at the cut, still full
    expect(nebulaBlobCount(PERF.nebulaCutQuality - 0.01)).toBe(PERF.nebulaBlobsLow); // below → thinned
    expect(nebulaBlobCount(0.4)).toBe(PERF.nebulaBlobsLow); // deepest load
    expect(nebulaBlobCount(0.4)).toBeLessThan(nebulaBlobCount(1)); // strictly lighter under load
  });

  it('bossEntranceBlur: authored 28×dpr at quality 1; dropped to 0 under load', () => {
    expect(bossEntranceBlur(1, 2)).toBe(PERF.bossEntranceBlur * 2); // full quality → authored blur (scaled by dpr)
    expect(bossEntranceBlur(1, 1)).toBe(PERF.bossEntranceBlur);
    expect(bossEntranceBlur(PERF.blurCutQuality - 0.01, 2)).toBe(0); // under load → no shadowBlur
    expect(bossEntranceBlur(0.4, 2)).toBe(0);
  });

  it('allowChromaticAberration: on at full quality, suppressed under load', () => {
    expect(allowChromaticAberration(1)).toBe(true); // look unchanged at full quality
    expect(allowChromaticAberration(PERF.caCutQuality)).toBe(true);
    expect(allowChromaticAberration(PERF.caCutQuality - 0.01)).toBe(false); // 3× redraw shed under load
    expect(allowChromaticAberration(0.4)).toBe(false);
  });
});
