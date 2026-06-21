import { describe, it, expect } from 'vitest';
import { applyAssist, type AssistEnemies, type AssistTarget } from './assist';

function enemiesOf(list: Array<{ x: number; y: number; radius?: number }>): AssistEnemies {
  const arr: AssistTarget[] = list.map((e) => ({ x: e.x, y: e.y, radius: e.radius ?? 10, active: true }));
  return { forEachActive: (cb) => arr.forEach(cb) };
}
const none: AssistEnemies = { forEachActive: () => {} };

describe('applyAssist', () => {
  it('off is identity', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 50, y: 50 }]), 'off');
    expect(r).toEqual({ x: 100, y: 0, usedStrong: false });
  });
  it('no enemies → identity, never flags strong', () => {
    const r = applyAssist(100, 0, 0, 0, none, 'strong');
    expect(r.x).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(0);
    expect(r.usedStrong).toBe(false);
  });
  it('subtle nudges aim toward an in-cone enemy but not all the way', () => {
    // aim straight right (+x); enemy slightly below the aim line, well within the cone
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 100, y: 40 }]), 'subtle');
    expect(r.y).toBeGreaterThan(0); // pulled toward the enemy
    expect(r.y).toBeLessThan(40); // but not snapped onto it
    expect(r.usedStrong).toBe(false);
  });
  it('subtle ignores an enemy outside the cone (behind the player)', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: -100, y: 0 }]), 'subtle');
    expect(r.x).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(0);
  });
  it('strong snaps hard onto the target and flags the run', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 0, y: 100 }]), 'strong');
    expect(r.y).toBeGreaterThan(60); // strongly rotated toward straight-down target
    expect(r.usedStrong).toBe(true);
  });
  it('preserves aim distance (rotates, not retargets length)', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 0, y: 50 }]), 'subtle');
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(100, 1);
  });
});
