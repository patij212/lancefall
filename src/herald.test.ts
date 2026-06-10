import { describe, it, expect } from 'vitest';
import { heraldWall } from './enemies';
import { HERALD } from './tune';

describe('herald — wall geometry', () => {
  it('every shot flies along the aim angle at the given speed', () => {
    const speed = 150;
    for (const angle of [0, Math.PI / 2, 1.2, -2.4]) {
      const shots = heraldWall(640, 360, angle, 0, speed);
      const evx = Math.cos(angle) * speed;
      const evy = Math.sin(angle) * speed;
      for (const s of shots) {
        expect(s.vx).toBeCloseTo(evx, 6);
        expect(s.vy).toBeCloseTo(evy, 6);
      }
    }
  });

  it('leaves a clear safe lane (gap) and nowhere else', () => {
    const angle = 0; // wall is vertical (perp = +Y); offsets map to y - ey
    const ex = 640, ey = 360;
    const gap = 50;
    const shots = heraldWall(ex, ey, angle, gap, 150);
    // no shot inside the gap band…
    for (const s of shots) {
      const off = s.y - ey; // perpendicular offset for angle 0
      expect(Math.abs(off - gap)).toBeGreaterThanOrEqual(HERALD.gapHalf - 1e-6);
    }
    // …and the gap band would otherwise have been filled (a full wall has more shots)
    const full = heraldWall(ex, ey, angle, 1e9 /* gap off the wall → no omission */, 150);
    expect(full.length).toBeGreaterThan(shots.length);
  });

  it('the gap is wide enough to dash through (≥ player+dash clearance)', () => {
    // gap full width is 2*gapHalf; the dash sweeps a 22px capsule, player r=9
    expect(2 * HERALD.gapHalf).toBeGreaterThanOrEqual(2 * 22 + 9);
  });

  it('shots lie on the line perpendicular to the aim through the source', () => {
    const angle = 0.7, ex = 200, ey = 500;
    const shots = heraldWall(ex, ey, angle, 0, 150);
    // perpendicular direction
    const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);
    for (const s of shots) {
      // projection of (s - source) onto the AIM axis must be ~0 (it's a perp line)
      const ax = Math.cos(angle), ay = Math.sin(angle);
      const along = (s.x - ex) * ax + (s.y - ey) * ay;
      expect(along).toBeCloseTo(0, 6);
      // and it must lie within the wall half-width along the perp axis
      const perp = (s.x - ex) * px + (s.y - ey) * py;
      expect(Math.abs(perp)).toBeLessThanOrEqual(HERALD.wallHalf + 1e-6);
    }
  });

  it('produces a non-trivial wall (multiple shots on each side of the gap)', () => {
    const shots = heraldWall(0, 0, 0, 0, 150);
    const above = shots.filter((s) => s.y > HERALD.gapHalf).length;
    const below = shots.filter((s) => s.y < -HERALD.gapHalf).length;
    expect(above).toBeGreaterThanOrEqual(3);
    expect(below).toBeGreaterThanOrEqual(3);
  });
});
