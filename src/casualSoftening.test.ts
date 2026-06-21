import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy } from './enemies';
import { ORBITER } from './tune';

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

describe('casual softening — fire cadence (count)', () => {
  it('orbiter fire interval is stretched by world.fireCadenceMul', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.fireCadenceMul = 2;
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, false)!;
    e.timer = 0.0001; // about to fire
    updateEnemy(e, w, 0.001); // timer crosses 0 → fires → resets to cadence * mul
    expect(e.timer).toBeCloseTo(ORBITER.fireCadence * 2, 4);
  });

  it('default cadence (mul 1) resets to the bare cadence', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, false)!;
    e.timer = 0.0001;
    updateEnemy(e, w, 0.001);
    expect(e.timer).toBeCloseTo(ORBITER.fireCadence, 4);
  });
});
