import { describe, it, expect } from 'vitest';
import {
  MUTATORS,
  pickDailyMutators,
  buildMutatorApply,
  applyMutatorConfig,
  mutatorElite,
  describeMutators,
} from './mutators';
import type { MutatorId } from './mutators';
import { deriveStats } from './perks';
import { modeById } from './modes';

describe('mutators', () => {
  it('every def is self-consistent', () => {
    for (const id of Object.keys(MUTATORS) as MutatorId[]) {
      expect(MUTATORS[id].id).toBe(id);
      expect(MUTATORS[id].name.length).toBeGreaterThan(0);
    }
  });

  it('daily pick is deterministic for a seed and returns 1-2 ids', () => {
    const a = pickDailyMutators(20260608);
    const b = pickDailyMutators(20260608);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(2);
  });

  it('produces variety across many seeds (not always the same mutator)', () => {
    const firsts = new Set<string>();
    for (let seed = 0; seed < 60; seed++) firsts.add(pickDailyMutators(seed)[0]);
    expect(firsts.size).toBeGreaterThanOrEqual(3); // genuine variety, not a stuck PRNG
  });

  it('glassCannon forces one stamina segment and boosts score', () => {
    const apply = buildMutatorApply(['glassCannon']);
    const s = deriveStats({}, undefined, apply); // mutator rides the meta/2nd slot here
    expect(s.staminaSegments).toBe(1);
    expect(s.scoreMul).toBeCloseTo(1.6);
  });

  it('fogOfWar sets a fog radius; windfall triples shard gain', () => {
    expect(deriveStats({}, undefined, buildMutatorApply(['fogOfWar'])).fogRadius).toBe(300);
    expect(deriveStats({}, undefined, buildMutatorApply(['windfall'])).shardMul).toBeCloseTo(3);
  });

  it('applyMutatorConfig clones (does not mutate the original) and applies director effects', () => {
    const base = modeById('daily');
    const spawnBefore = base.spawnMul;
    const out = applyMutatorConfig(base, ['bulletStorm']);
    expect(base.spawnMul).toBe(spawnBefore); // original untouched
    expect(out.spawnMul).toBeCloseTo(spawnBefore * 0.78);
    expect(out.speedBonus).toBeCloseTo(base.speedBonus + 0.15);
  });

  it('carries an optional ModeRules block through the clone while config() still mutates only the clone (M1 spine)', () => {
    const base = { ...modeById('endless'), rules: { events: 'none' as const } };
    const out = applyMutatorConfig(base, ['bulletStorm']);
    expect(out.rules?.events).toBe('none'); // rules rides the spread
    expect(out.spawnMul).toBeLessThan(base.spawnMul); // bulletStorm mutated the CLONE
    expect(base.spawnMul).toBe(modeById('endless').spawnMul); // original untouched
  });

  it('warlords quickens the boss cadence and rewards extra shards', () => {
    const base = modeById('daily');
    const intervalBefore = base.bossInterval;
    const out = applyMutatorConfig(base, ['warlords']);
    expect(base.bossInterval).toBe(intervalBefore); // original untouched
    expect(out.bossInterval).toBeCloseTo(intervalBefore * 0.6);
    expect(deriveStats({}, undefined, buildMutatorApply(['warlords'])).shardMul).toBeCloseTo(1.4);
  });

  it('mutatorElite folds chance + cap mods', () => {
    expect(mutatorElite([])).toEqual({ chanceMul: 1, maxAdd: 0 });
    const e = mutatorElite(['doubleChampions']);
    expect(e.chanceMul).toBeCloseTo(1.9);
    expect(e.maxAdd).toBe(2);
  });

  it('describeMutators lists names', () => {
    expect(describeMutators([])).toBe('');
    expect(describeMutators(['glassCannon', 'windfall'])).toBe('GLASS CANNON, WINDFALL');
  });
});
