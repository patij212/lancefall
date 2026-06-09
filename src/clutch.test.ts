import { describe, it, expect } from 'vitest';
import { makeClutch, resetClutch, tickClutch, canLastBreath, triggerLastBreath, resetErupt, eruptMilestone } from './clutch';
import { CLUTCH } from './tune';

describe('clutch — LAST BREATH', () => {
  it('starts ready', () => {
    expect(canLastBreath(makeClutch())).toBe(true);
  });

  it('triggering opens the window, starts the cooldown, and counts the use', () => {
    const c = makeClutch();
    triggerLastBreath(c);
    expect(c.lastBreathActive).toBe(CLUTCH.lastBreathDuration);
    expect(c.lastBreathCd).toBe(CLUTCH.lastBreathCooldown);
    expect(c.lastBreathUses).toBe(1);
    expect(canLastBreath(c)).toBe(false); // not while active / on cooldown
  });

  it('stays unavailable until the cooldown fully drains', () => {
    const c = makeClutch();
    triggerLastBreath(c);
    tickClutch(c, CLUTCH.lastBreathDuration); // window closes
    expect(c.lastBreathActive).toBe(0);
    expect(canLastBreath(c)).toBe(false); // cooldown still running
    tickClutch(c, CLUTCH.lastBreathCooldown); // cooldown drains
    expect(canLastBreath(c)).toBe(true);
  });

  it('cooldown never goes negative', () => {
    const c = makeClutch();
    triggerLastBreath(c);
    tickClutch(c, 9999);
    expect(c.lastBreathCd).toBe(0);
    expect(c.lastBreathActive).toBe(0);
  });

  it('resetClutch returns to a fresh state', () => {
    const c = makeClutch();
    triggerLastBreath(c);
    resetClutch(c);
    expect(c.lastBreathCd).toBe(0);
    expect(c.lastBreathUses).toBe(0);
    expect(canLastBreath(c)).toBe(true);
  });
});

describe('clutch — COMBO ERUPTION', () => {
  it('does not erupt below the first milestone', () => {
    expect(eruptMilestone(CLUTCH.eruptEvery - 1, 0)).toBe(0);
  });

  it('erupts at the first milestone', () => {
    expect(eruptMilestone(CLUTCH.eruptEvery, 0)).toBe(CLUTCH.eruptEvery);
  });

  it('only fires once per milestone', () => {
    const m = CLUTCH.eruptEvery;
    expect(eruptMilestone(m + 5, m)).toBe(0); // already erupted at m
    expect(eruptMilestone(m * 2, m)).toBe(m * 2); // next milestone
  });

  it('re-arms after a combo break (resetErupt)', () => {
    const c = makeClutch();
    c.lastErupt = CLUTCH.eruptEvery * 2;
    resetErupt(c);
    expect(c.lastErupt).toBe(0);
    expect(eruptMilestone(CLUTCH.eruptEvery, c.lastErupt)).toBe(CLUTCH.eruptEvery);
  });
});
