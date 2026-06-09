import { describe, it, expect } from 'vitest';
import { makeOverdrive, resetOverdrive, chargeFromKill, chargeFromGraze, tickOverdrive, canActivate, activateOverdrive } from './overdrive';
import { OVERDRIVE } from './tune';

describe('overdrive', () => {
  it('charges from kills (more at high combo) and clamps at 1', () => {
    const od = makeOverdrive();
    chargeFromKill(od, 1);
    expect(od.meter).toBeCloseTo(OVERDRIVE.chargePerKill);
    chargeFromKill(od, 25); // high-combo kill charges more
    expect(od.meter).toBeCloseTo(OVERDRIVE.chargePerKill + OVERDRIVE.chargePerHighComboKill);
    for (let i = 0; i < 100; i++) chargeFromKill(od, 30);
    expect(od.meter).toBe(1); // clamped
  });

  it('grazes trickle the meter', () => {
    const od = makeOverdrive();
    chargeFromGraze(od);
    expect(od.meter).toBeCloseTo(OVERDRIVE.chargePerGraze);
  });

  it('does not charge while on cooldown', () => {
    const od = makeOverdrive();
    od.cooldown = 5;
    chargeFromKill(od, 30);
    chargeFromGraze(od);
    expect(od.meter).toBe(0);
  });

  it('activation requires a full meter and no cooldown', () => {
    const od = makeOverdrive();
    expect(canActivate(od)).toBe(false);
    od.meter = 1;
    expect(canActivate(od)).toBe(true);
    od.cooldown = 0.1;
    expect(canActivate(od)).toBe(false);
  });

  it('activate consumes the meter, starts cooldown + combo lock', () => {
    const od = makeOverdrive();
    od.meter = 1;
    expect(activateOverdrive(od)).toBe(true);
    expect(od.meter).toBe(0);
    expect(od.cooldown).toBeCloseTo(OVERDRIVE.cooldown);
    expect(od.lockTimer).toBeCloseTo(OVERDRIVE.lockDuration);
    expect(activateOverdrive(od)).toBe(false); // can't double-fire
  });

  it('tick drains cooldown + lock; reset zeroes everything', () => {
    const od = makeOverdrive();
    od.cooldown = 2; od.lockTimer = 1;
    tickOverdrive(od, 1.5);
    expect(od.cooldown).toBeCloseTo(0.5);
    expect(od.lockTimer).toBe(0);
    od.meter = 0.5;
    resetOverdrive(od);
    expect(od).toEqual({ meter: 0, cooldown: 0, lockTimer: 0 });
  });
});
