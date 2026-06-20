import { describe, it, expect } from 'vitest';
import { newNarrator, pickLine, ambientReady, NARRATOR } from './narrator';

describe('narrator — pure weighted no-repeat picker', () => {
  it('never repeats the immediate previous index', () => {
    const n = newNarrator(1234);
    let prev = -1;
    for (let i = 0; i < 200; i++) {
      const idx = pickLine(n, 'X', 4);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
      expect(idx).not.toBe(prev);
      prev = idx;
    }
  });

  it('returns 0 for a pool of length 1 (no crash)', () => {
    const n = newNarrator();
    expect(pickLine(n, 'solo', 1)).toBe(0);
    expect(pickLine(n, 'solo', 1)).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
    const a = newNarrator(42);
    const b = newNarrator(42);
    const seqA = Array.from({ length: 30 }, () => pickLine(a, 'B', 5));
    const seqB = Array.from({ length: 30 }, () => pickLine(b, 'B', 5));
    expect(seqA).toEqual(seqB);
  });

  it('distributes across the whole pool', () => {
    const n = newNarrator(7);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(pickLine(n, 'D', 6));
    expect(seen.size).toBe(6);
  });

  it('ambientReady gates within the gap', () => {
    const n = newNarrator();
    expect(ambientReady(n, 'a', 10, 6)).toBe(true);
    expect(ambientReady(n, 'a', 13, 6)).toBe(false); // inside the 6s gap
    expect(ambientReady(n, 'a', 16.1, 6)).toBe(true); // after the gap
  });

  it('ambientReady stamps independently per bucket', () => {
    const n = newNarrator();
    expect(ambientReady(n, 'a', 10, 6)).toBe(true);
    expect(ambientReady(n, 'b', 10, 6)).toBe(true); // different bucket, not gated
  });

  it('stays in range over many picks (its own rng, no external stream)', () => {
    const n = newNarrator(99);
    for (let i = 0; i < 100; i++) {
      const idx = pickLine(n, 'iso', 3);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it('is pure: identical inputs give identical outputs; edge buckets never throw', () => {
    const run = () =>
      (() => {
        const n = newNarrator(5);
        return [pickLine(n, 'p', 4), pickLine(n, 'p', 4), pickLine(n, 'q', 1)];
      })();
    expect(run()).toEqual(run());
    const n = newNarrator();
    expect(() => pickLine(n, 'empty', 0)).not.toThrow();
    expect(pickLine(n, 'empty', 0)).toBe(0);
  });
});

describe('narrator pool (data coverage)', () => {
  it('every list bucket has at least one non-empty line', () => {
    for (const pool of [
      NARRATOR.runStart,
      NARRATOR.firstKill,
      NARRATOR.comboBreak,
      NARRATOR.collapse,
      NARRATOR.rise,
      NARRATOR.lastBreath,
      NARRATOR.victory,
      NARRATOR.highCoherence,
    ]) {
      expect(pool.length).toBeGreaterThan(0);
      for (const line of pool) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('all six bosses have an approach line in the generic fallback (index 0) + a kill line', () => {
    for (const k of ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'] as const) {
      expect(NARRATOR.bossApproach[0][k]).toBeTruthy(); // index 0 is the generic fallback
      expect(NARRATOR.bossKill[k]).toBeTruthy();
    }
  });

  it('all six strata have a line; combo tiers map to known cut points', () => {
    expect(NARRATOR.strata.length).toBe(6);
    for (const s of NARRATOR.strata) expect(s.trim().length).toBeGreaterThan(0);
    for (const at of [10, 20, 35, 50, 75, 100]) expect(NARRATOR.comboTier[at]).toBeTruthy();
  });
});

describe('THE LAST WORD narrator additions', () => {
  it('has a non-empty sovereign foreshadow pool', () => {
    expect(NARRATOR.sovereignForeshadow.length).toBeGreaterThan(0);
    for (const l of NARRATOR.sovereignForeshadow) expect(l.length).toBeGreaterThan(10);
  });
});

describe('THE CITY SPEAKS narrator additions', () => {
  it('has a teach + late beat for all 6 biomes, and NULL warns about graze', () => {
    expect(NARRATOR.biomeBeat).toHaveLength(6);
    expect(NARRATOR.biomeLate).toHaveLength(6);
    for (let i = 0; i < 6; i++) { expect(NARRATOR.biomeBeat[i][0].length).toBeGreaterThan(8); expect(NARRATOR.biomeLate[i][0].length).toBeGreaterThan(8); }
    expect(NARRATOR.biomeBeat[5][0].toLowerCase()).toMatch(/dash/); // NULL teaches "dash only"
  });
  it('has a descent pool', () => { expect(NARRATOR.descent.length).toBeGreaterThan(0); });
  it('bossApproach[0] keeps a generic line per boss (fallback)', () => {
    expect(NARRATOR.bossApproach[0].warden).toBeTruthy();
    expect(NARRATOR.bossApproach[0].sovereign).toBeTruthy();
  });
  it('tier-75 + Mirrorblade lines are the restored, restrained forms', () => {
    expect(NARRATOR.comboTier[75]).toBe('Lancefall blazes. The grey breaks.');
    expect(NARRATOR.bossKill.mirrorblade).toBe('Your doubt fell. You are still here.');
  });
});
