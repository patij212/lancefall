import { describe, it, expect } from 'vitest';
import { HEAT_LEVELS, MAX_HEAT, heatLevel, applyHeatStats, applyHeatConfig, heatScoreMul, heatShardMul } from './heat';
import { deriveStats } from './perks';
import { modeById } from './modes';
import { SURVIVAL } from './tune';

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

  it('shard multiplier rises gently with heat and stays flatter than score', () => {
    for (let i = 1; i <= MAX_HEAT; i++) {
      expect(HEAT_LEVELS[i].shardMul).toBeGreaterThan(HEAT_LEVELS[i - 1].shardMul);
    }
    // gentle: the Heat-7 shard bonus is smaller than its score bonus — protects meta pacing
    expect(HEAT_LEVELS[MAX_HEAT].shardMul).toBeLessThan(HEAT_LEVELS[MAX_HEAT].scoreMul);
  });

  it('scales shard gains with heat (playtest: "Heat should scale shards too")', () => {
    const base = deriveStats({});
    const heated = deriveStats({}, undefined, undefined, undefined, (s) => applyHeatStats(s, 7));
    expect(heated.shardMul).toBeCloseTo(base.shardMul * heatShardMul(7));
    expect(heated.shardMul).toBeGreaterThan(base.shardMul);
  });

  it('the Heat shard bonus rides UNDER the in-run ×6 farm cap', () => {
    // a degenerate in-run shardMul × Heat 7 must still clamp at 6 (postApply runs before the cap)
    const s = deriveStats({}, undefined, (st) => { st.shardMul = 10; }, undefined, (st) => applyHeatStats(st, 7));
    expect(s.shardMul).toBe(6);
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

  it('grants ARMOR shields by default and strips them at high heat (§7)', () => {
    expect(deriveStats({}).baseShields).toBe(SURVIVAL.defaultShields);
    const searing = deriveStats({}, undefined, undefined, undefined, (s) => applyHeatStats(s, 5));
    expect(searing.baseShields).toBe(SURVIVAL.defaultShields - 1); // SEARING strips 1
    const meltdown = deriveStats({}, undefined, undefined, undefined, (s) => applyHeatStats(s, 7));
    expect(meltdown.baseShields).toBe(0); // MELTDOWN strips all (floor 0)
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

  it('carries an optional ModeRules block through the clone untouched (M1 spine)', () => {
    const base = { ...modeById('endless'), rules: { events: 'none' as const, oneLife: true } };
    const out = applyHeatConfig(base, 6);
    expect(out.rules).toBeDefined();
    expect(out.rules).toEqual(base.rules);
    expect(out.rules?.events).toBe('none');
  });

  it('heatLevel clamps out-of-range input', () => {
    expect(heatLevel(-5).level).toBe(0);
    expect(heatLevel(99).level).toBe(MAX_HEAT);
  });
});
