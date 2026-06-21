import { describe, it, expect } from 'vitest';
import {
  len,
  dist,
  norm,
  clampLen,
  lerp,
  clamp,
  angleDiff,
  rotateToward,
  easeOutQuad,
  easeOutCubic,
  easeOutBack,
} from './vec';

describe('vector math', () => {
  it('len computes magnitude', () => {
    expect(len(3, 4)).toBe(5);
    expect(len(0, 0)).toBe(0);
  });

  it('dist computes distance between points', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });

  it('norm returns a unit vector', () => {
    const [x, y] = norm(0, 10);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
    expect(len(...norm(3, 4))).toBeCloseTo(1);
  });

  it('norm of zero vector is zero (no NaN)', () => {
    expect(norm(0, 0)).toEqual([0, 0]);
  });

  it('clampLen caps magnitude but preserves direction', () => {
    const [x, y] = clampLen(10, 0, 4);
    expect(x).toBeCloseTo(4);
    expect(y).toBeCloseTo(0);
    // below cap → unchanged
    expect(clampLen(1, 0, 4)).toEqual([1, 0]);
  });
});

describe('scalar helpers', () => {
  it('lerp interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('clamp bounds values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('angleDiff', () => {
  it('returns shortest signed difference within (-π, π]', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    // wrap-around: from 0.1 to -0.1 (just under 2π) should be a small negative
    expect(angleDiff(0.1, 0.1 + Math.PI * 2)).toBeCloseTo(0);
    expect(Math.abs(angleDiff(0, Math.PI * 1.5))).toBeLessThanOrEqual(Math.PI);
  });
});

describe('easings', () => {
  it('all hit the 0→1 endpoints', () => {
    for (const e of [easeOutQuad, easeOutCubic, easeOutBack]) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
  });

  it('easeOutBack overshoots above 1 mid-curve', () => {
    let maxV = 0;
    for (let t = 0; t <= 1; t += 0.01) maxV = Math.max(maxV, easeOutBack(t));
    expect(maxV).toBeGreaterThan(1);
  });
});

describe('rotateToward', () => {
  it('clamps a large turn to maxDelta, shortest direction', () => {
    expect(rotateToward(0, 1.5, 0.1)).toBeCloseTo(0.1); // target ahead
    expect(rotateToward(0, -1.5, 0.1)).toBeCloseTo(-0.1); // target behind → short way is negative
  });

  it('lands exactly on target when the gap is within maxDelta', () => {
    expect(rotateToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });

  it('takes the short way across the ±π seam', () => {
    // from 3.0 rad toward -3.0 rad, the short hop is +across π (~+0.283), not -6
    expect(rotateToward(3.0, -3.0, 0.1)).toBeCloseTo(3.1);
  });
});
