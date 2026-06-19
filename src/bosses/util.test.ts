import { describe, it, expect } from 'vitest';
import { zoneTarget } from './util';
import { ZONE } from '../tune';

describe('zoneTarget (deny the safe corner)', () => {
  const W = 800, H = 600;
  it('bias=0 is the identity (drift target unchanged)', () => {
    const z = zoneTarget(700, 500, W, H, 400, 300, 0);
    expect(z.tx).toBeCloseTo(400, 6);
    expect(z.ty).toBeCloseTo(300, 6);
  });
  it('bias>0 nudges the target TOWARD the player (denies their corner)', () => {
    const px = 700, py = 500, cur = { tx: 400, ty: 300 };
    const z = zoneTarget(px, py, W, H, cur.tx, cur.ty, 0.25);
    // moved toward the player → strictly closer to (px,py) than the original target
    const before = Math.hypot(px - cur.tx, py - cur.ty);
    const after = Math.hypot(px - z.tx, py - z.ty);
    expect(after).toBeLessThan(before);
    expect(z.tx).toBeGreaterThan(cur.tx);
    expect(z.ty).toBeGreaterThan(cur.ty);
  });
  it('clamps the zoned target inside the arena (never leaves bounds)', () => {
    // player jammed in the far corner, full bias → target still kept within margins
    const z = zoneTarget(W, H, W, H, W, H, 1);
    expect(z.tx).toBeLessThanOrEqual(W - ZONE.margin);
    expect(z.ty).toBeLessThanOrEqual(H - ZONE.margin);
    expect(z.tx).toBeGreaterThanOrEqual(ZONE.margin);
    expect(z.ty).toBeGreaterThanOrEqual(ZONE.margin);
  });
  it('is pure — reads only its args (no rng), so a replay is bit-identical', () => {
    const a = zoneTarget(123, 456, W, H, 400, 300, 0.25);
    const b = zoneTarget(123, 456, W, H, 400, 300, 0.25);
    expect(a).toEqual(b);
  });
});
