import { describe, it, expect } from 'vitest';
import { Shake } from './shake';
import { TUNE } from './tune';

describe('Shake trauma model', () => {
  it('starts settled with no offset', () => {
    const s = new Shake();
    expect(s.trauma).toBe(0);
    expect(s.ox).toBe(0);
    expect(s.oy).toBe(0);
    expect(s.angle).toBe(0);
  });

  it('adds trauma and clamps it to 1', () => {
    const s = new Shake();
    s.add(0.3);
    expect(s.trauma).toBeCloseTo(0.3);
    s.add(5);
    expect(s.trauma).toBe(1); // clamped
  });

  it('scales added trauma by the user intensity setting', () => {
    const s = new Shake();
    s.intensity = 0.5;
    s.add(0.4);
    expect(s.trauma).toBeCloseTo(0.2);
  });

  it('intensity 0 disables shake entirely (a11y)', () => {
    const s = new Shake();
    s.intensity = 0;
    s.add(1);
    expect(s.trauma).toBe(0);
    s.update(0.016);
    // trauma² is 0, so every offset is zero (allow signed-zero: -0 === 0 here)
    expect(s.ox).toBeCloseTo(0);
    expect(s.oy).toBeCloseTo(0);
    expect(s.angle).toBeCloseTo(0);
  });

  it('decays trauma in real time and never below zero', () => {
    const s = new Shake();
    s.add(1);
    s.update(0.1);
    expect(s.trauma).toBeCloseTo(1 - TUNE.juice.traumaDecay * 0.1);
    s.update(10); // overshoot
    expect(s.trauma).toBe(0);
  });

  it('keeps the offset bounded by the configured maxima', () => {
    const s = new Shake();
    s.add(1); // full trauma
    // sample several frames; the layered-sine noise is in [-1,1]*(amp)
    for (let i = 1; i <= 20; i++) {
      s.update(0.001);
      expect(Math.abs(s.ox)).toBeLessThanOrEqual(TUNE.juice.maxShake + 1e-9);
      expect(Math.abs(s.oy)).toBeLessThanOrEqual(TUNE.juice.maxShake + 1e-9);
      expect(Math.abs(s.angle)).toBeLessThanOrEqual(TUNE.juice.maxShakeAngle + 1e-9);
    }
  });

  it('reset returns to a settled state', () => {
    const s = new Shake();
    s.add(1);
    s.update(0.016);
    s.reset();
    expect(s.trauma).toBe(0);
    expect(s.ox).toBe(0);
    expect(s.oy).toBe(0);
    expect(s.angle).toBe(0);
  });
});
