import { describe, it, expect } from 'vitest';
import {
  chargeToLen,
  dashDuration,
  iframeFor,
  maxStamina,
  canDash,
  effectiveDashCost,
  regenStamina,
  cappedRefund,
  isFullCharge,
  biteInTarget,
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

  it('canDash needs at least the dash cost', () => {
    expect(canDash(TUNE.stamina.dashCost)).toBe(true);
    expect(canDash(TUNE.stamina.dashCost - 5)).toBe(false);
    expect(canDash(TUNE.stamina.dashCost - 5, TUNE.stamina.dashCost - 5)).toBe(true); // cheaper cost
  });

  it('effectiveDashCost scales by the multiplier but is clamped to a full bar (no soft-lock)', () => {
    const c = TUNE.stamina.dashCost;
    // 3 segments: 2x cost = 2 segments' worth, under the cap
    expect(effectiveDashCost(2, 3)).toBeCloseTo(c * 2);
    // 1 segment (Glass Cannon): 2x cost would be 200 but a full bar is 100 — clamp so it's affordable
    expect(effectiveDashCost(2, 1)).toBeCloseTo(maxStamina(1));
    expect(effectiveDashCost(3, 1)).toBeCloseTo(maxStamina(1)); // even 3x can't exceed the bar
    // a full single-segment bar can therefore always dash
    expect(canDash(maxStamina(1), effectiveDashCost(2, 1))).toBe(true);
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

describe('cappedRefund — per-dash refund budget (kills the perpetual-dash loop)', () => {
  it('caps the TOTAL per-dash refund (kills + Time Thief) to one dash cost', () => {
    const cost = TUNE.stamina.dashCost; // 100
    let refunded = 0;
    // Siphon×2 + PERPETUAL ⇒ 60 stamina per kill
    let g = cappedRefund(60, refunded, cost);
    refunded += g;
    expect(g).toBe(60);
    // a second chained kill wants 60 more, but only 40 of the budget remains
    g = cappedRefund(60, refunded, cost);
    refunded += g;
    expect(g).toBe(40);
    // Time Thief's +40 now finds the budget exhausted — the old uncapped leak is closed
    g = cappedRefund(40, refunded, cost);
    refunded += g;
    expect(g).toBe(0);
    expect(refunded).toBe(cost); // exactly one dash refilled, never banks surplus for traversal
  });

  it('never returns negative once the budget is already spent', () => {
    expect(cappedRefund(40, 120, 100)).toBe(0);
  });

  it('tracks the ACTUAL dash cost (a cheap HASTE dash tops up less, not a full segment)', () => {
    // a HASTE dash costs 60 → a refund can restore at most that 60, not a fixed 100
    expect(cappedRefund(100, 0, 60)).toBe(60);
  });
});

describe('HEAVY LANCE — full-charge (100%) bonus + bite-in', () => {
  it('arms ONLY at a full 100% charge', () => {
    expect(isFullCharge(1.0)).toBe(true);
    expect(isFullCharge(0.999)).toBe(false); // 99.9% is NOT heavy — you must hold to full
    expect(isFullCharge(0.5)).toBe(false);
  });

  it('bite-in stops just past the contact, not at the full dash length', () => {
    // a heavy dash from origin connecting with a target at (100,0) ends just past it,
    // not 560px across the arena
    const r = biteInTarget(0, 0, 100, 0, TUNE.dash.heavyBiteInFollow);
    expect(r.toX).toBeCloseTo(100 + TUNE.dash.heavyBiteInFollow);
    expect(r.toY).toBeCloseTo(0);
  });

  it('bite-in preserves the dash direction toward the contact', () => {
    const r = biteInTarget(0, 0, 0, 50, TUNE.dash.heavyBiteInFollow);
    expect(r.toX).toBeCloseTo(0);
    expect(r.toY).toBeCloseTo(50 + TUNE.dash.heavyBiteInFollow);
  });
});
