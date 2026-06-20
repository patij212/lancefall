import { describe, it, expect } from 'vitest';
import { BOMBE_MAX_LEVEL, BRANCH_MAX, bombeCostMul, bombeAutoCracks, upgradeBombeCost, upgradeBranchCost, runBombe, upgradeBombe, upgradeBombeBranch, CONSOLE_PUZZLES, checkPuzzle, solvePuzzle, crackCheapestFree, solvePuzzleReward, PUZZLE_FRAGMENT_REWARD, grantCryptanalystBonus } from './bombe';
import { defaultSave } from './save';
import { isWordDecrypted, vocabulary, wordRarity } from './intercepts';
import { fragmentBalance } from './lore';

const frags = (n: number) => ({ ...defaultSave(), stillpointFragments: Array.from({ length: n }, (_, i) => `f${i}`) });

describe('bombe — the auto-crack meta-tool', () => {
  it('bombeCostMul driven by THRIFT branch level (0..BRANCH_MAX), 1.0 at 0 → 0.5 at BRANCH_MAX', () => {
    expect(bombeCostMul(0)).toBe(1);
    expect(bombeCostMul(BRANCH_MAX)).toBeCloseTo(0.5);
    expect(bombeCostMul(1)).toBeLessThan(bombeCostMul(0));
    expect(bombeCostMul(2)).toBeLessThanOrEqual(bombeCostMul(1));
    // levels beyond BRANCH_MAX don't go lower than the cap
    expect(bombeCostMul(BRANCH_MAX + 10)).toBeCloseTo(bombeCostMul(BRANCH_MAX));
  });

  it('bombeAutoCracks driven by SPEED branch level (0..BRANCH_MAX) — one crack per level', () => {
    expect(bombeAutoCracks(0)).toBe(0);
    expect(bombeAutoCracks(1)).toBe(1);
    expect(bombeAutoCracks(BRANCH_MAX)).toBe(BRANCH_MAX);
    expect(bombeAutoCracks(BRANCH_MAX + 5)).toBe(BRANCH_MAX); // clamped
  });

  it('runBombe uses the speed branch level, no fragment spend', () => {
    const s = { ...frags(0), bombeBranches: { thrift: 0, speed: 2, insight: 0 }, bombeLevel: 2 };
    const before = s.fragmentsSpent;
    const cracked = runBombe(s);
    expect(cracked.length).toBe(2); // speed=2 → 2 free cracks
    expect(s.fragmentsSpent).toBe(before); // free
    for (const w of cracked) expect(isWordDecrypted(s, w)).toBe(true);
    // speed=0 → nothing
    const zero = { ...defaultSave(), bombeBranches: { thrift: 0, speed: 0, insight: 0 }, bombeLevel: 0 };
    expect(runBombe(zero)).toEqual([]);
  });

  it('runBombe with INSIGHT active prioritises key/rare words over common', () => {
    // Build a save where exactly two words remain undecrypted:
    //   - one KEY-rarity word (expensive: cost >= common words)
    //   - one COMMON word (cheap)
    // Then runBombe(speed=1, insight=1) must crack the KEY word, not the cheaper common one.
    const s = defaultSave();
    s.bombeBranches = { thrift: 0, speed: 1, insight: 1 };
    s.bombeLevel = 2;

    const vocab = vocabulary();

    // Find one KEY word and one COMMON word to leave undone; decrypt everything else.
    const keyWord = vocab.find((w) => wordRarity(w) === 'key');
    const commonWord = vocab.find((w) => wordRarity(w) === 'common' && w !== keyWord);
    expect(keyWord).toBeDefined(); // vocabulary must have at least one key word
    expect(commonWord).toBeDefined(); // and at least one common word

    // Decrypt all words except the chosen key word and common word.
    const skip = new Set([keyWord!, commonWord!]);
    for (const w of vocab) {
      if (!skip.has(w)) s.decryptedWords.push(w);
    }

    // speed=1 → crack exactly ONE word. INSIGHT must prefer the key word over the common one.
    const cracked = runBombe(s);
    expect(cracked).toHaveLength(1);
    expect(cracked[0]).toBe(keyWord!);
    // The cheap common word must NOT have been cracked instead.
    expect(cracked[0]).not.toBe(commonWord!);
    // Verify key word's rarity — this will fail if INSIGHT ordering were removed and
    // crackCheapestFree fell back to cost-only order (picking the cheaper common word first).
    expect(wordRarity(cracked[0])).toBe('key');
    expect(isWordDecrypted(s, keyWord!)).toBe(true);
  });

  it('upgradeBombeBranch raises a branch level + resyncs bombeLevel, capped at BRANCH_MAX', () => {
    const s = frags(100);
    expect(upgradeBombeBranch(s, 'thrift')).toBe(true);
    expect(s.bombeBranches.thrift).toBe(1);
    expect(s.bombeLevel).toBe(1); // sum = thrift(1)+speed(0)+insight(0)
    expect(upgradeBombeBranch(s, 'speed')).toBe(true);
    expect(s.bombeLevel).toBe(2);
    expect(upgradeBombeBranch(s, 'insight')).toBe(true);
    expect(s.bombeLevel).toBe(3);
  });

  it('upgradeBombeBranch — each branch caps at BRANCH_MAX (not the global total)', () => {
    const s = frags(999);
    // max out thrift
    for (let i = 0; i < BRANCH_MAX; i++) expect(upgradeBombeBranch(s, 'thrift')).toBe(true);
    expect(s.bombeBranches.thrift).toBe(BRANCH_MAX);
    expect(upgradeBombeBranch(s, 'thrift')).toBe(false); // branch maxed
    // speed is still upgradable
    expect(upgradeBombeBranch(s, 'speed')).toBe(true);
  });

  it('upgradeBombeBranch — rejects unaffordable upgrades', () => {
    const s = defaultSave(); // no fragments
    expect(upgradeBombeBranch(s, 'insight')).toBe(false);
  });

  it('upgradeBranchCost is identical to upgradeBombeCost (same formula)', () => {
    for (let i = 0; i < 5; i++) {
      expect(upgradeBranchCost(i)).toBe(upgradeBombeCost(i));
    }
  });

  it('legacy upgradeBombe still works (routes to the first non-maxed branch)', () => {
    const s = frags(50);
    expect(upgradeBombe(s)).toBe(true);
    expect(s.bombeLevel).toBe(1);
    // fully maxed all branches → returns false
    const maxed = { ...defaultSave(), ...frags(999), bombeLevel: BOMBE_MAX_LEVEL, bombeBranches: { thrift: BRANCH_MAX, speed: BRANCH_MAX, insight: BRANCH_MAX } };
    expect(upgradeBombe(maxed)).toBe(false);
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

describe('THE ENIGMA puzzle', () => {
  it('exists, is kind enigma, and round-trips (prompt decodes to answer, prompt != answer)', () => {
    const p = CONSOLE_PUZZLES.find((x) => x.id === 'pz-enigma-1')!;
    expect(p).toBeDefined();
    expect(p.kind).toBe('enigma');
    expect(checkPuzzle('pz-enigma-1', p.answer)).toBe(true);
    expect(p.prompt).not.toBe(p.answer);
  });
});

describe('grantCryptanalystBonus', () => {
  it('grants +1 INSIGHT once all puzzles are solved, idempotent', () => {
    const s = defaultSave();
    s.solvedPuzzles = CONSOLE_PUZZLES.map((p) => p.id);
    expect(grantCryptanalystBonus(s)).toBe(true);
    expect(s.bombeBranches.insight).toBe(1);
    expect(grantCryptanalystBonus(s)).toBe(false); // idempotent
    expect(s.bombeBranches.insight).toBe(1);
  });
  it('does nothing until all are solved', () => {
    const s = defaultSave();
    s.solvedPuzzles = CONSOLE_PUZZLES.slice(0, -1).map((p) => p.id);
    expect(grantCryptanalystBonus(s)).toBe(false);
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
