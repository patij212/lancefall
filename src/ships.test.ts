import { describe, it, expect } from 'vitest';
import { SHIPS, shipById } from './ships';
import { deriveStats } from './perks';
import { TUNE } from './tune';

describe('ship roster', () => {
  it('has Lance as the free default', () => {
    const lance = shipById('lance');
    expect(lance.unlockShards).toBe(0);
    expect(SHIPS[0].id).toBe('lance');
  });

  it('unknown id falls back to Lance', () => {
    expect(shipById('nope').id).toBe('lance');
  });

  it('every ship has a positive id/name and a cost', () => {
    for (const s of SHIPS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.unlockShards).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ship stat profiles', () => {
  it('Lance leaves base stats unchanged', () => {
    const s = deriveStats({}, shipById('lance').apply);
    expect(s.staminaSegments).toBe(TUNE.stamina.segments);
    expect(s.maxSpeed).toBe(TUNE.player.maxSpeed);
    expect(s.dashLenMul).toBe(1);
  });

  it('Glaive trades stamina for reach + speed', () => {
    const s = deriveStats({}, shipById('glaive').apply);
    expect(s.staminaSegments).toBe(2);
    expect(s.dashLenMul).toBeGreaterThan(1);
    expect(s.maxSpeed).toBeGreaterThan(TUNE.player.maxSpeed);
  });

  it('Bastion is tanky but slower with a shorter dash', () => {
    const s = deriveStats({}, shipById('bastion').apply);
    expect(s.staminaSegments).toBe(4);
    expect(s.maxSpeed).toBeLessThan(TUNE.player.maxSpeed);
    expect(s.dashLenMul).toBeLessThan(1);
    expect(s.regenPerSec).toBeGreaterThan(TUNE.stamina.regenPerSec);
    // shorter post-dash regen lockout (this field is now actually read by player.ts)
    expect(s.regenDelay).toBeLessThan(TUNE.stamina.regenDelay);
    expect(s.regenDelay).toBeCloseTo(TUNE.stamina.regenDelay * 0.7);
  });

  it('ship profile composes with perks (ship first, then perks stack)', () => {
    const s = deriveStats({ secondwind: 1 }, shipById('bastion').apply);
    // bastion 4 segs + second wind +1 = 5
    expect(s.staminaSegments).toBe(5);
  });

  it('Tempest is a nimble graze-dancer (faster, graze-flow, slightly shorter dash)', () => {
    const s = deriveStats({}, shipById('tempest').apply);
    expect(s.staminaSegments).toBe(TUNE.stamina.segments);
    expect(s.maxSpeed).toBeGreaterThan(TUNE.player.maxSpeed);
    expect(s.accel).toBeGreaterThan(TUNE.player.accel);
    expect(s.dashLenMul).toBeLessThan(1);
    // graze-flow identity: grazing refunds more stamina + a wider graze ring
    expect(s.grazeStaminaRefund).toBeGreaterThan(TUNE.stamina.grazeRefund);
    expect(s.grazeRadius).toBeGreaterThan(TUNE.graze.radius);
  });

  it('Phantom is a one-segment knife-edge with a huge dash', () => {
    const s = deriveStats({}, shipById('phantom').apply);
    expect(s.staminaSegments).toBe(1);
    expect(s.dashLenMul).toBeGreaterThan(1.5);
    expect(s.regenPerSec).toBeGreaterThan(TUNE.stamina.regenPerSec);
    expect(s.maxSpeed).toBeGreaterThan(TUNE.player.maxSpeed);
  });

  it('Reaver is a snowball: kill-refund + wide bite, but slow regen and weak graze refund', () => {
    const s = deriveStats({}, shipById('reaver').apply);
    expect(s.killStaminaRefund).toBeGreaterThan(0); // base is 0 → the snowball engine
    expect(s.dashHitboxRadius).toBeGreaterThan(TUNE.dash.hitboxRadius);
    expect(s.regenPerSec).toBeLessThan(TUNE.stamina.regenPerSec); // sluggish passive regen
    expect(s.grazeStaminaRefund).toBeLessThan(TUNE.stamina.grazeRefund); // graze barely helps
    expect(s.staminaSegments).toBe(TUNE.stamina.segments); // standard 3 segments
  });
});
