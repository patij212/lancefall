import { describe, it, expect } from 'vitest';
import { homingSteer } from './enemies';

const ang = (vx: number, vy: number) => Math.atan2(vy, vx);
const speed = (vx: number, vy: number) => Math.hypot(vx, vy);
// shortest signed angular difference a→b
const diff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

describe('seeker — homing steer', () => {
  it('preserves speed exactly', () => {
    const r = homingSteer(150, 0, 0, 0, 100, 400, 2, 1 / 60);
    expect(speed(r.vx, r.vy)).toBeCloseTo(150, 6);
  });

  it('turns toward the target, by at most turnRate*dt (clamped)', () => {
    // moving +x, target straight up-left → desired ~135°, a big turn
    const turnRate = 2,
      dt = 1 / 60;
    const r = homingSteer(150, 0, 0, 0, -100, -100, turnRate, dt);
    const before = diff(ang(150, 0), ang(-100 - 0, -100 - 0)); // signed gap before
    const after = diff(ang(r.vx, r.vy), ang(-100 - 0, -100 - 0)); // signed gap after
    // it closed the gap, but only by the clamped step (not all the way)
    expect(Math.abs(after)).toBeLessThan(Math.abs(before));
    expect(Math.abs(before) - Math.abs(after)).toBeCloseTo(turnRate * dt, 5);
  });

  it('does not overshoot when the remaining turn is small', () => {
    // nearly aimed already: desired angle is a hair above current heading
    const r = homingSteer(150, 0, 0, 0, 1000, 1, 5, 1 / 60); // tiny upward target
    const gap = diff(ang(r.vx, r.vy), ang(1000, 1));
    expect(Math.abs(gap)).toBeLessThan(1e-6); // snapped onto target, no overshoot
  });

  it('turns the shortest way (down-target → negative rotation)', () => {
    // moving +x, target below → should rotate toward +y (canvas y-down)
    const r = homingSteer(150, 0, 0, 0, 100, 100, 2, 1 / 60);
    expect(ang(r.vx, r.vy)).toBeGreaterThan(0); // rotated toward +y
  });

  it('is a no-op direction-wise when already pointing at the target', () => {
    const r = homingSteer(150, 0, 0, 0, 500, 0, 3, 1 / 60);
    expect(r.vx).toBeCloseTo(150, 6);
    expect(r.vy).toBeCloseTo(0, 6);
  });
});
