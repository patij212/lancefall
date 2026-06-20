import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { MERGE_CATEGORIES, mergeSaves } from './cloudMerge';
import type { SaveData } from './save';

describe('cloudMerge — category coverage', () => {
  it('maps EVERY SaveData field to a merge category (fails on any new unmapped field)', () => {
    const keys = Object.keys(defaultSave());
    const unmapped = keys.filter((k) => !(k in MERGE_CATEGORIES));
    expect(unmapped).toEqual([]);
  });
  it('has no stale category entry for a field that no longer exists', () => {
    const keys = new Set(Object.keys(defaultSave()));
    const stale = Object.keys(MERGE_CATEGORIES).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });
});

const mk = (over: Partial<SaveData>): SaveData => ({ ...defaultSave(), ...over });

describe('mergeSaves — categories', () => {
  it('maxNum takes the larger', () => {
    const m = mergeSaves(mk({ highScore: 100 }), mk({ highScore: 250 }), 1, 2);
    expect(m.highScore).toBe(250);
  });
  it('minNonZero takes the smaller non-zero (0 = unset)', () => {
    expect(mergeSaves(mk({ fastestArenaSec: 0 }), mk({ fastestArenaSec: 90 }), 1, 2).fastestArenaSec).toBe(90);
    expect(mergeSaves(mk({ fastestArenaSec: 120 }), mk({ fastestArenaSec: 90 }), 1, 2).fastestArenaSec).toBe(90);
    expect(mergeSaves(mk({ fastestArenaSec: 0 }), mk({ fastestArenaSec: 0 }), 1, 2).fastestArenaSec).toBe(0);
  });
  it('set unions and dedupes', () => {
    const m = mergeSaves(mk({ unlockedShips: ['lance', 'comet'] }), mk({ unlockedShips: ['lance', 'vortex'] }), 1, 2);
    expect([...m.unlockedShips].sort()).toEqual(['comet', 'lance', 'vortex']);
  });
  it('perKeyMax takes the max per key, union of keys', () => {
    const m = mergeSaves(mk({ meta: { hp: 2, dash: 1 } }), mk({ meta: { hp: 1, crit: 3 } }), 1, 2);
    expect(m.meta).toEqual({ hp: 2, dash: 1, crit: 3 });
  });
  it('latest picks the more-recently-written save for selection fields', () => {
    expect(mergeSaves(mk({ selectedShip: 'comet' }), mk({ selectedShip: 'vortex' }), 1, 2).selectedShip).toBe('vortex');
    expect(mergeSaves(mk({ selectedShip: 'comet' }), mk({ selectedShip: 'vortex' }), 5, 2).selectedShip).toBe('comet');
  });
});

describe('mergeSaves — spendable reconcile (the windfall, §7.1)', () => {
  it('shards = max(lifeShards) − max(spent); both devices keep their purchases', () => {
    // A: earned 100, has 40 → spent 60.  B: earned 80, has 10 → spent 70.
    const a = mk({ lifeShards: 100, shards: 40 });
    const b = mk({ lifeShards: 80, shards: 10 });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.lifeShards).toBe(100);
    expect(m.shards).toBe(100 - 70); // 30 — favors the player (max spent, not sum)
  });
  it('never returns a negative balance', () => {
    const m = mergeSaves(mk({ lifeShards: 10, shards: 0 }), mk({ lifeShards: 50, shards: 0 }), 1, 2);
    expect(m.shards).toBeGreaterThanOrEqual(0);
  });
});

describe('mergeSaves — invariants', () => {
  it('idempotent: merge(a, a) deep-equals a (sanitized)', () => {
    const a = mk({ highScore: 9, unlockedShips: ['lance', 'comet'], meta: { hp: 3 }, lifeShards: 50, shards: 20 });
    expect(mergeSaves(a, a, 1, 1)).toEqual(a);
  });
  it('never loses a set member or a record', () => {
    const a = mk({ achievements: ['a', 'b'], highScore: 500 });
    const b = mk({ achievements: ['b', 'c'], highScore: 200 });
    const m = mergeSaves(a, b, 1, 2);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b', 'c']));
    expect(m.highScore).toBe(500);
  });
  it('runHistory unions by identity and keeps the newest 50', () => {
    const mkR = (n: number) => ({ score: n, wave: 1, mode: 'endless', won: false, sec: 1, heat: 0, combo: 0, date: '2026-06-2' + (n % 9) });
    const a = mk({ runHistory: Array.from({ length: 40 }, (_, i) => mkR(i)) });
    const b = mk({ runHistory: Array.from({ length: 40 }, (_, i) => mkR(i + 100)) });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.runHistory.length).toBe(50);
  });
  it('lastRuns keeps one entry per mode (the newest by sec)', () => {
    const r = (mode: string, sec: number) => ({ score: 1, wave: 1, mode, won: false, sec, heat: 0, combo: 0, date: '2026-06-20', kills: {}, damage: {}, killedBy: '', bosses: 0, grazes: 0, daybreaks: 0, lastBreath: 0, hitsTaken: 0, powerups: 0 });
    const a = mk({ lastRuns: [r('endless', 10), r('arena', 5)] });
    const b = mk({ lastRuns: [r('endless', 30)] });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.lastRuns.find((x) => x.mode === 'endless')!.sec).toBe(30);
    expect(m.lastRuns.length).toBe(2);
  });
});
