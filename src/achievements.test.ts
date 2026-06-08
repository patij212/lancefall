import { describe, it, expect } from 'vitest';
import { evaluate, ACHIEVEMENTS } from './achievements';
import type { AchCtx } from './achievements';

const base: AchCtx = {
  score: 0,
  combo: 0,
  wave: 0,
  kills: 0,
  grazes: 0,
  maxDashChain: 0,
  bossKills: 0,
  daily: false,
  lifeRuns: 0,
  lifeKills: 0,
  lifeBoss: 0,
  lifeShards: 0,
};

describe('achievements', () => {
  it('all ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('first blood unlocks on a single kill', () => {
    const got = evaluate([], { ...base, kills: 1 }).map((a) => a.id);
    expect(got).toContain('firstblood');
  });

  it('does not re-award already-unlocked achievements', () => {
    const got = evaluate(['firstblood'], { ...base, kills: 5 }).map((a) => a.id);
    expect(got).not.toContain('firstblood');
  });

  it('skewer requires a 6-kill dash', () => {
    expect(evaluate([], { ...base, maxDashChain: 5 }).map((a) => a.id)).not.toContain('skewer');
    expect(evaluate([], { ...base, maxDashChain: 6 }).map((a) => a.id)).toContain('skewer');
  });

  it('combo tiers gate correctly', () => {
    const ids = evaluate([], { ...base, combo: 50 }).map((a) => a.id);
    expect(ids).toContain('comboist'); // 25
    expect(ids).toContain('annihilator'); // 50
  });

  it('lifetime achievements read lifetime fields', () => {
    expect(evaluate([], { ...base, lifeRuns: 20 }).map((a) => a.id)).toContain('veteran');
    expect(evaluate([], { ...base, lifeShards: 5000 }).map((a) => a.id)).toContain('hoarder');
  });

  it('daily achievement needs a daily run', () => {
    expect(evaluate([], { ...base, daily: true }).map((a) => a.id)).toContain('daily');
    expect(evaluate([], { ...base, daily: false }).map((a) => a.id)).not.toContain('daily');
  });
});
