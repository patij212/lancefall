import { describe, it, expect } from 'vitest';
import { SLINGSHOT } from './tune';
import { chargeToLen, dashDuration } from './dash';
import { loadDrift, slingshotLen, slingshotDuration } from './slingshot';

describe('slingshot — the alternate dash style (pure math)', () => {
  it('loadDrift scales with charge, clamped to [0,1]', () => {
    expect(loadDrift(0)).toBe(0);
    expect(loadDrift(1)).toBe(SLINGSHOT.loadDrift);
    expect(loadDrift(0.5)).toBeCloseTo(SLINGSHOT.loadDrift * 0.5, 6);
    expect(loadDrift(2)).toBe(SLINGSHOT.loadDrift); // clamped
    expect(loadDrift(-1)).toBe(0);
  });

  it('the slingshot flings farther than the Lance, respecting dashLenMul', () => {
    for (const c of [0.2, 0.5, 1]) {
      expect(slingshotLen(c, 1)).toBeCloseTo(chargeToLen(c) * SLINGSHOT.lenMul, 6);
      expect(slingshotLen(c, 1)).toBeGreaterThan(chargeToLen(c)); // lenMul > 1
    }
    expect(slingshotLen(1, 2)).toBeCloseTo(chargeToLen(1) * 2 * SLINGSHOT.lenMul, 6);
  });

  it('the slingshot snaps faster than a Lance dash of the same length', () => {
    const len = 400;
    expect(slingshotDuration(len)).toBeCloseTo(dashDuration(len) * SLINGSHOT.durMul, 6);
    expect(slingshotDuration(len)).toBeLessThan(dashDuration(len)); // durMul < 1 → faster
  });
});
