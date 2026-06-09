import { describe, it, expect } from 'vitest';
import {
  chargeToLen,
  dashDuration,
  iframeFor,
  maxStamina,
  canDash,
  regenStamina,
} from './dash';
import { TUNE } from './tune';

describe('charge → dash length', () => {
  it('a tap still produces a usable minimum dash', () => {
    expect(chargeToLen(0)).toBeCloseTo(TUNE.dash.minLen);
  });

  it('full charge reaches max length', () => {
    expect(chargeToLen(1)).toBeCloseTo(TUNE.dash.maxLen);
  });

  it('is monotonic increasing in charge', () => {
    let prev = -Infinity;
    for (let c = 0; c <= 1; c += 0.1) {
      const v = chargeToLen(c);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('clamps out-of-range charge', () => {
    expect(chargeToLen(-1)).toBeCloseTo(TUNE.dash.minLen);
    expect(chargeToLen(5)).toBeCloseTo(TUNE.dash.maxLen);
  });
});

describe('dash duration & i-frames', () => {
  it('longer dashes take longer but respect a floor', () => {
    expect(dashDuration(TUNE.dash.maxLen)).toBeGreaterThan(dashDuration(TUNE.dash.minLen));
    expect(dashDuration(1)).toBeGreaterThanOrEqual(TUNE.dash.minDuration);
  });

  it('i-frames always exceed travel time by the grace window', () => {
    const len = 400;
    expect(iframeFor(len)).toBeCloseTo(dashDuration(len) + TUNE.dash.iframeGrace);
  });
});

describe('stamina', () => {
  it('maxStamina scales with segments', () => {
    expect(maxStamina(3)).toBe(300);
    expect(maxStamina(4)).toBe(400);
  });

  it('canDash needs a full segment', () => {
    expect(canDash(TUNE.stamina.dashCost)).toBe(true);
    expect(canDash(TUNE.stamina.dashCost - 5)).toBe(false);
  });

  it('canDash scales the required stamina by the cost multiplier (relics)', () => {
    const base = TUNE.stamina.dashCost;
    expect(canDash(base, 2)).toBe(false); // a 2x-cost dash needs two segments' worth
    expect(canDash(base * 2, 2)).toBe(true);
    expect(canDash(base * 0.5, 0.5)).toBe(true); // a cheaper dash needs less
  });

  it('regen waits out the lockout delay, then refills', () => {
    // during lockout: no regen
    let r = regenStamina(0, 0.35, 0.1, 300);
    expect(r.stamina).toBe(0);
    expect(r.regenDelay).toBeCloseTo(0.25);

    // after lockout: regen proceeds at the configured rate
    r = regenStamina(0, 0, 1, 300, 75);
    expect(r.stamina).toBeCloseTo(75);
  });

  it('regen never exceeds max', () => {
    const r = regenStamina(295, 0, 1, 300, 75);
    expect(r.stamina).toBe(300);
  });
});
