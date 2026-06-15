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

  it('the fling RAMPS with charge: ~Lance length at a tap, full fling at full charge', () => {
    // ramp helper mirrors slingshotLen's lenMulMin→lenMul interpolation
    const mul = (c: number) => SLINGSHOT.lenMulMin + (SLINGSHOT.lenMul - SLINGSHOT.lenMulMin) * c;
    for (const c of [0.2, 0.5, 1]) {
      expect(slingshotLen(c, 1)).toBeCloseTo(chargeToLen(c) * mul(c), 6);
    }
    // a tap (charge 0) is parity with the Lance — no free range; full charge is the payoff
    expect(slingshotLen(0, 1)).toBeCloseTo(chargeToLen(0) * SLINGSHOT.lenMulMin, 6);
    expect(slingshotLen(1, 1)).toBeCloseTo(chargeToLen(1) * SLINGSHOT.lenMul, 6);
    expect(slingshotLen(1, 1)).toBeGreaterThan(slingshotLen(0, 1)); // it does fling farther held
    expect(slingshotLen(1, 2)).toBeCloseTo(chargeToLen(1) * 2 * SLINGSHOT.lenMul, 6); // respects dashLenMul
  });

  it('the slingshot snaps faster than a Lance dash of the same length', () => {
    const len = 400;
    expect(slingshotDuration(len)).toBeCloseTo(dashDuration(len) * SLINGSHOT.durMul, 6);
    expect(slingshotDuration(len)).toBeLessThan(dashDuration(len)); // durMul < 1 → faster
  });
});
