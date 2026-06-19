import { describe, it, expect } from 'vitest';
import { BOMBE_MAX_LEVEL, bombeCostMul, bombeAutoCracks, upgradeBombeCost, runBombe, upgradeBombe, CONSOLE_PUZZLES, checkPuzzle, solvePuzzle, crackCheapestFree, solvePuzzleReward, PUZZLE_FRAGMENT_REWARD } from './bombe';
import { defaultSave } from './save';
import { isWordDecrypted } from './intercepts';
import { fragmentBalance } from './lore';

const frags = (n: number) => ({ ...defaultSave(), stillpointFragments: Array.from({ length: n }, (_, i) => `f${i}`) });

describe('bombe — the auto-crack meta-tool', () => {
  it('higher levels lower word cost and crack more per run; bounded', () => {
    expect(bombeCostMul(0)).toBe(1);
    expect(bombeCostMul(BOMBE_MAX_LEVEL)).toBeLessThan(1);
    expect(bombeCostMul(2)).toBeLessThanOrEqual(bombeCostMul(1));
    expect(bombeAutoCracks(0)).toBe(0);
    expect(bombeAutoCracks(1)).toBeGreaterThanOrEqual(1);
  });

  it('runBombe decrypts the globally-cheapest undecrypted words for FREE (no fragment spend)', () => {
    const s = { ...frags(0), bombeLevel: 1 };
    const before = s.fragmentsSpent;
    const cracked = runBombe(s);
    expect(cracked.length).toBe(bombeAutoCracks(1));
    expect(s.fragmentsSpent).toBe(before); // free — the Bombe runs on its own
    for (const w of cracked) expect(isWordDecrypted(s, w)).toBe(true);
    expect(runBombe({ ...frags(0), bombeLevel: 0 })).toEqual([]); // no Bombe → nothing
  });

  it('upgradeBombe spends Fragments and raises the level, capped', () => {
    const s = { ...frags(50), bombeLevel: 0 };
    expect(upgradeBombe(s)).toBe(true);
    expect(s.bombeLevel).toBe(1);
    expect(s.fragmentsSpent).toBe(upgradeBombeCost(0));
    const maxed = { ...frags(999), bombeLevel: BOMBE_MAX_LEVEL };
    expect(upgradeBombe(maxed)).toBe(false); // already maxed
    const broke = { ...frags(0), bombeLevel: 0 };
    expect(upgradeBombe(broke)).toBe(false); // can't afford
  });
});

describe('bombe — console cryptanalysis puzzles', () => {
  it('each puzzle has a prompt, a non-empty answer, and verifies case/space-insensitively', () => {
    expect(CONSOLE_PUZZLES.length).toBeGreaterThanOrEqual(3);
    for (const p of CONSOLE_PUZZLES) {
      expect(p.prompt.length).toBeGreaterThan(0);
      expect(p.answer.length).toBeGreaterThan(0);
      expect(checkPuzzle(p.id, p.answer)).toBe(true);
      expect(checkPuzzle(p.id, '  ' + p.answer.toLowerCase() + ' ')).toBe(true);
      expect(checkPuzzle(p.id, 'definitely-wrong')).toBe(false);
    }
  });
  it('solvePuzzle records a correct solve once; a wrong guess does nothing', () => {
    const p = CONSOLE_PUZZLES[0];
    const s = defaultSave();
    expect(solvePuzzle(s, p.id, 'nope')).toBe(false);
    expect(solvePuzzle(s, p.id, p.answer)).toBe(true);
    expect(s.solvedPuzzles).toContain(p.id);
    expect(solvePuzzle(s, p.id, p.answer)).toBe(false); // already solved
  });

  it('solvePuzzleReward grants a REAL reward — a free word + Fragments — even with no Bombe', () => {
    const p = CONSOLE_PUZZLES[0];
    const s = defaultSave(); // bombeLevel 0, no fragments
    const r = solvePuzzleReward(s, p.id, p.answer);
    expect(r.solved).toBe(true);
    expect(r.fragments).toBe(PUZZLE_FRAGMENT_REWARD);
    expect(fragmentBalance(s)).toBe(PUZZLE_FRAGMENT_REWARD); // the bonus is spendable
    expect(r.crackedWord).not.toBeNull(); // a word was cracked for free
    expect(isWordDecrypted(s, r.crackedWord!)).toBe(true);
    expect(r.allSolved).toBe(false);
    // a wrong / repeat guess grants nothing
    expect(solvePuzzleReward(s, p.id, p.answer).solved).toBe(false);
    expect(solvePuzzleReward(s, p.id, 'nope').solved).toBe(false);
  });

  it('solving the FULL set flags allSolved on the final puzzle', () => {
    const s = defaultSave();
    const results = CONSOLE_PUZZLES.map((p) => solvePuzzleReward(s, p.id, p.answer));
    expect(results.slice(0, -1).every((r) => r.allSolved === false)).toBe(true);
    expect(results[results.length - 1].allSolved).toBe(true);
  });
});

describe('bombe — crackCheapestFree', () => {
  it('cracks the n cheapest undecrypted words for free, deterministically', () => {
    const a = crackCheapestFree(defaultSave(), 3);
    const b = crackCheapestFree(defaultSave(), 3);
    expect(a).toEqual(b); // deterministic (cost then alphabetical — no rng)
    const s = defaultSave();
    const before = s.fragmentsSpent;
    crackCheapestFree(s, 2);
    expect(s.decryptedWords.length).toBe(2);
    expect(s.fragmentsSpent).toBe(before); // free
    expect(crackCheapestFree(defaultSave(), 0)).toEqual([]);
  });
});
