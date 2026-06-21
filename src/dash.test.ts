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
  isHeavyArmed,
  tickInterruptGate,
  type InterruptGate,
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

describe('tickInterruptGate — hold blocking popups during a charge/dash', () => {
  const grace = TUNE.dash.interruptGrace;
  const cap = TUNE.dash.interruptMaxDefer;
  const fresh = (): InterruptGate => ({ busyTimer: 0, heldTime: 0 });

  it('holds a pending popup while the player is mid-charge / mid-dash', () => {
    const g = fresh();
    // busy (charging or dashing) → never opens, however long it is held (below the cap)
    expect(tickInterruptGate(g, true, true, 1 / 60)).toBe(false);
    expect(tickInterruptGate(g, true, true, 1 / 60)).toBe(false);
    expect(g.busyTimer).toBeCloseTo(grace); // grace stays primed while busy
  });

  it('opens immediately when idle and nothing was mid-dash', () => {
    const g = fresh();
    expect(tickInterruptGate(g, false, true, 1 / 60)).toBe(true);
  });

  it('holds for the settle grace right after a dash, then opens', () => {
    const g = fresh();
    tickInterruptGate(g, true, true, 1 / 60); // dashing → primes the grace
    // now idle, but within the grace → still held
    expect(tickInterruptGate(g, false, true, grace / 2)).toBe(false);
    // once the grace fully drains → opens
    const opened = tickInterruptGate(g, false, true, grace);
    expect(opened).toBe(true);
  });

  it('a held charge cannot soft-lock the popup forever (max-defer cap)', () => {
    const g = fresh();
    let opened = false;
    // hold the charge well past the cap — the popup is force-opened so the queue never starves
    for (let t = 0; t < cap + 1 && !opened; t += 1 / 60) {
      opened = tickInterruptGate(g, true, true, 1 / 60);
    }
    expect(opened).toBe(true);
  });

  it('resets the held timer when there is no pending popup', () => {
    const g = fresh();
    tickInterruptGate(g, true, true, 0.5); // accrue some hold
    expect(tickInterruptGate(g, true, false, 1 / 60)).toBe(false); // nothing pending
    expect(g.heldTime).toBe(0);
  });
});

describe('HEAVY LANCE — armed by a sustained overcharge (hold past full)', () => {
  it('arms ONLY once the overcharge window is reached', () => {
    expect(isHeavyArmed(TUNE.dash.heavyOverchargeTime)).toBe(true);
    expect(isHeavyArmed(TUNE.dash.heavyOverchargeTime - 0.05)).toBe(false); // not held past full long enough
    expect(isHeavyArmed(0)).toBe(false); // released at full charge, no overcharge → NOT heavy
  });
});
