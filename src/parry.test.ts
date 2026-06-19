import { describe, it, expect } from 'vitest';
import { parryArcContains, parryReward, parryDeflectsBoss } from './parry';
import { PARRY } from './tune';

describe('parry arc', () => {
  const px = 0,
    py = 0,
    aim = 0; // facing +x
  it('catches a bullet dead ahead within reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach - 5, 0)).toBe(true);
  });
  it('misses a bullet behind the player', () => {
    expect(parryArcContains(px, py, aim, -(PARRY.reach - 5), 0)).toBe(false);
  });
  it('misses a bullet beyond reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach + 40, 0)).toBe(false);
  });
  it('misses a bullet outside the half-angle', () => {
    const r = PARRY.reach - 10;
    const a = PARRY.halfAngle + 0.2;
    expect(parryArcContains(px, py, aim, Math.cos(a) * r, Math.sin(a) * r)).toBe(false);
  });
  it('catches a bullet right on the half-angle edge', () => {
    const r = PARRY.reach - 10;
    const a = PARRY.halfAngle - 0.01;
    expect(parryArcContains(px, py, aim, Math.cos(a) * r, Math.sin(a) * r)).toBe(true);
  });
  it('respects a rotated aim', () => {
    const aimUp = Math.PI / 2; // facing +y
    expect(parryArcContains(px, py, aimUp, 0, PARRY.reach - 5)).toBe(true);
    expect(parryArcContains(px, py, aimUp, PARRY.reach - 5, 0)).toBe(false);
  });
});

describe('parry reward', () => {
  it('on-beat doubles the off-beat payout', () => {
    const off = parryReward(false);
    const on = parryReward(true);
    expect(on.stamina).toBe(off.stamina * 2);
    expect(on.combo).toBe(off.combo * 2);
    expect(on.overdrive).toBeCloseTo(off.overdrive * 2);
  });
  it('off-beat pays the tuned base values', () => {
    const off = parryReward(false);
    expect(off.stamina).toBe(PARRY.staminaReward);
    expect(off.combo).toBe(PARRY.comboReward);
    expect(off.overdrive).toBeCloseTo(PARRY.overdriveReward);
  });
});

describe('parry boss-deflect budget', () => {
  it('allows deflects under the budget and stops at it', () => {
    expect(parryDeflectsBoss(PARRY.bossBudget, 0)).toBe(true);
    expect(parryDeflectsBoss(PARRY.bossBudget, PARRY.bossBudget - 1)).toBe(true);
    expect(parryDeflectsBoss(PARRY.bossBudget, PARRY.bossBudget)).toBe(false);
  });
  it('clamps a build budget above the PARRY cap', () => {
    expect(parryDeflectsBoss(99, PARRY.bossBudget)).toBe(false);
  });
});
