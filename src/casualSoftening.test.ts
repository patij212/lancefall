import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';

describe('casual softening — bullet speed chokepoint', () => {
  it('spawnBullet scales velocity by world.bulletSpeedScale', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.bulletSpeedScale = 0.5;
    const b = w.spawnBullet(100, 100, 200, -40, 6, '#fff', false)!;
    expect(b.vx).toBeCloseTo(100); // 200 * 0.5
    expect(b.vy).toBeCloseTo(-20); // -40 * 0.5
  });

  it('defaults to 1 (no change) on a fresh world', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    expect(w.bulletSpeedScale).toBe(1);
    expect(w.fireCadenceMul).toBe(1);
    const b = w.spawnBullet(0, 0, 300, 0, 6, '#fff', false)!;
    expect(b.vx).toBeCloseTo(300);
  });
});
