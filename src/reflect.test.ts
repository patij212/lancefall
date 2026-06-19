import { describe, it, expect } from 'vitest';
import { reflectVelocity, isReflectableOrb } from './reflect';

describe('reflectVelocity', () => {
  it('aims the orb straight back at the boss at the given speed', () => {
    // orb at (100,0), boss at origin → reflect points -x at speed
    const v = reflectVelocity(100, 0, 0, 0, 90);
    expect(v.vx).toBeCloseTo(-90, 6);
    expect(v.vy).toBeCloseTo(0, 6);
  });
  it('preserves the requested speed (magnitude) toward an off-axis boss', () => {
    const v = reflectVelocity(0, 0, 30, 40, 100); // boss at (3,4)·10 → unit (0.6,0.8)
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(100, 6);
    expect(v.vx).toBeCloseTo(60, 6);
    expect(v.vy).toBeCloseTo(80, 6);
  });
  it('never NaNs when the orb sits on the boss centre', () => {
    const v = reflectVelocity(50, 50, 50, 50, 90);
    expect(Number.isFinite(v.vx)).toBe(true);
    expect(Number.isFinite(v.vy)).toBe(true);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(90, 6);
  });
});

describe('isReflectableOrb', () => {
  it('is true only for a boss-fired reflectable orb', () => {
    expect(isReflectableOrb({ fromBoss: true, reflectable: true })).toBe(true);
    expect(isReflectableOrb({ fromBoss: true, reflectable: false })).toBe(false);
    expect(isReflectableOrb({ fromBoss: false, reflectable: true })).toBe(false); // already reflected
    expect(isReflectableOrb({ fromBoss: true })).toBe(false);
  });
});
