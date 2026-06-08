import { describe, it, expect } from 'vitest';
import { pointSegDist2, segCircleHit, circleHit, SpatialHash } from './collision';

describe('pointSegDist2', () => {
  it('is zero on the segment', () => {
    expect(pointSegDist2(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('measures perpendicular distance to the segment body', () => {
    expect(pointSegDist2(5, 3, 0, 0, 10, 0)).toBeCloseTo(9); // 3^2
  });

  it('clamps to the nearest endpoint past the ends', () => {
    // point beyond b=(10,0): nearest is endpoint, dist 5 → 25
    expect(pointSegDist2(15, 0, 0, 0, 10, 0)).toBeCloseTo(25);
    // degenerate segment (a==b) → point-point distance
    expect(pointSegDist2(3, 4, 0, 0, 0, 0)).toBeCloseTo(25);
  });
});

describe('segCircleHit (the dash spear)', () => {
  it('hits a circle the segment passes through', () => {
    expect(segCircleHit(0, 0, 10, 0, 5, 0, 2)).toBe(true);
  });

  it('hits via the capsule radius even when the centerline misses', () => {
    // circle 3px off the line, r=1, capsule radius 3 → 1+3 >= 3 → hit
    expect(segCircleHit(0, 0, 10, 0, 5, 3, 1, 3)).toBe(true);
    // same but capsule radius 1 → 1+1 < 3 → miss
    expect(segCircleHit(0, 0, 10, 0, 5, 3, 1, 1)).toBe(false);
  });

  it('misses a circle nowhere near the segment', () => {
    expect(segCircleHit(0, 0, 10, 0, 50, 50, 5)).toBe(false);
  });

  it('catches a fast dash that would tunnel a point test (swept capsule)', () => {
    // enemy at (50,0) r10; a long segment sweeps right past it
    expect(segCircleHit(0, 0, 100, 0, 50, 0, 10, 22)).toBe(true);
  });
});

describe('circleHit', () => {
  it('detects overlap', () => {
    expect(circleHit(0, 0, 5, 8, 0, 5)).toBe(true); // 10 >= 8
    expect(circleHit(0, 0, 5, 11, 0, 5)).toBe(false); // 10 < 11
  });
});

describe('SpatialHash', () => {
  it('returns candidates in the queried region and excludes far ones', () => {
    const hash = new SpatialHash<{ x: number; y: number; active: boolean; id: number }>(64);
    const a = { x: 10, y: 10, active: true, id: 1 };
    const b = { x: 600, y: 600, active: true, id: 2 };
    const c = { x: 30, y: 40, active: true, id: 3 };
    hash.rebuild([a, b, c]);
    const out: typeof a[] = [];
    hash.queryAABB(0, 0, 64, 64, out);
    const ids = out.map((o) => o.id).sort();
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it('skips inactive items on rebuild', () => {
    const hash = new SpatialHash<{ x: number; y: number; active: boolean }>(64);
    const a = { x: 10, y: 10, active: false };
    hash.rebuild([a]);
    const out: typeof a[] = [];
    hash.queryAABB(0, 0, 64, 64, out);
    expect(out.length).toBe(0);
  });

  it('finds all items spanning a wide AABB across many cells', () => {
    const hash = new SpatialHash<{ x: number; y: number; active: boolean }>(50);
    const items = Array.from({ length: 20 }, (_, i) => ({ x: i * 50, y: 0, active: true }));
    hash.rebuild(items);
    const out: typeof items[number][] = [];
    hash.queryAABB(0, -10, 1000, 10, out);
    expect(out.length).toBe(20);
  });
});
