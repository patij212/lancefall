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
  });

  it('ship profile composes with perks (ship first, then perks stack)', () => {
    const s = deriveStats({ secondwind: 1 }, shipById('bastion').apply);
    // bastion 4 segs + second wind +1 = 5
    expect(s.staminaSegments).toBe(5);
  });
});
