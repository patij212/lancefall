import { describe, it, expect } from 'vitest';
import { wardenSpiralOffsets } from './warden';
import { bossEnraged } from './util';
import type { Enemy } from '../types';

describe('warden spiral offsets', () => {
  it('is a 2-spoke star normally', () => {
    const o = wardenSpiralOffsets(false);
    expect(o).toEqual([0, Math.PI]);
  });
  it('doubles to a 4-spoke star when enraged (two rotating origins)', () => {
    const o = wardenSpiralOffsets(true);
    expect(o).toHaveLength(4);
    expect(o).toEqual([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]);
  });
});

describe('bossEnraged gate', () => {
  const mk = (hp: number, maxHp = 20): Enemy => ({ hp, maxHp } as Enemy);
  it('is true only below the fraction (pure HP read, no rng)', () => {
    expect(bossEnraged(mk(7), 0.4)).toBe(true); // 0.35 < 0.4
    expect(bossEnraged(mk(8), 0.4)).toBe(false); // 0.40 not below
    expect(bossEnraged(mk(20), 0.4)).toBe(false);
  });
});
