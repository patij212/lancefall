import { describe, it, expect } from 'vitest';
import { HEAT_LEVELS, MAX_HEAT, heatLevel, applyHeatStats, applyHeatConfig, heatScoreMul } from './heat';
import { deriveStats } from './perks';
import { modeById } from './modes';

describe('heat ladder', () => {
  it('has MAX_HEAT+1 levels, indexed 0..MAX_HEAT', () => {
    expect(HEAT_LEVELS.length).toBe(MAX_HEAT + 1);
    HEAT_LEVELS.forEach((h, i) => expect(h.level).toBe(i));
  });

  it('score multiplier is strictly increasing with heat', () => {
    for (let i = 1; i <= MAX_HEAT; i++) {
      expect(HEAT_LEVELS[i].scoreMul).toBeGreaterThan(HEAT_LEVELS[i - 1].scoreMul);
    }
  });

  it('level 0 is a true no-op on stats', () => {
    const base = deriveStats({});
    const heated = deriveStats({}, undefined, undefined, undefined, (s) => applyHeatStats(s, 0));
    expect(heated).toEqual(base);
  });

  it('high heat scales score, tightens graze, and strips revives', () => {
    const base = deriveStats({}, undefined, (s) => { s.reviveTokens = 3; });
    const heated = deriveStats({}, undefined, (s) => { s.reviveTokens = 3; }, undefined, (s) => applyHeatStats(s, 7));
    expect(heated.scoreMul).toBeCloseTo(base.scoreMul * heatScoreMul(7));
    expect(heated.grazeRadius).toBeLessThan(base.grazeRadius);
    expect(heated.reviveTokens).toBe(0); // 3 - revivesLost(3)
  });

  it('reviveTokens never goes negative', () => {
    const s = deriveStats({}, undefined, undefined, undefined, (st) => applyHeatStats(st, 7));
    expect(s.reviveTokens).toBeGreaterThanOrEqual(0);
  });

  it('applyHeatConfig clones and intensifies the director config', () => {
    const base = modeById('endless');
    const out = applyHeatConfig(base, 6);
    expect(out).not.toBe(base);
    expect(base.spawnMul).toBe(1); // original untouched
    expect(out.speedBonus).toBeCloseTo(base.speedBonus + HEAT_LEVELS[6].enemySpeedAdd);
    expect(out.spawnMul).toBeCloseTo(base.spawnMul * HEAT_LEVELS[6].spawnMulMod);
    expect(out.bossInterval).toBeCloseTo(base.bossInterval * HEAT_LEVELS[6].bossIntervalMod);
  });

  it('heatLevel clamps out-of-range input', () => {
    expect(heatLevel(-5).level).toBe(0);
    expect(heatLevel(99).level).toBe(MAX_HEAT);
  });
});
