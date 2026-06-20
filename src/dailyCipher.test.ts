// src/dailyCipher.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { dailyCipher, checkDailyCipher, solveDailyCipher, letterFrequency, DAILY_CIPHER_REWARD } from './dailyCipher';

describe('dailyCipher — provably daily', () => {
  it('is deterministic for a given day seed', () => {
    expect(dailyCipher(20260620)).toEqual(dailyCipher(20260620));
  });
  it('14 consecutive days produce distinct {kind,prompt,answer} tuples', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 14; d++) {
      const c = dailyCipher(20260620 + d);
      seen.add(`${c.kind}|${c.prompt}|${c.answer}`);
    }
    expect(seen.size).toBe(14); // not a fake-daily generator
  });
  it('every generated cipher round-trips (no unsolvable day)', () => {
    for (let d = 0; d < 40; d++) {
      const seed = 20260601 + d;
      const c = dailyCipher(seed);
      expect(checkDailyCipher(seed, c.answer)).toBe(true);
      expect(c.prompt).not.toBe(c.answer); // it's actually enciphered
    }
  });
  it('letterFrequency counts letters case-insensitively', () => {
    expect(letterFrequency('Abb!')).toEqual({ a: 1, b: 2 });
  });
});

describe('solveDailyCipher', () => {
  it('first correct solve/day grants fragments, then is idempotent', () => {
    const s = defaultSave();
    const c = dailyCipher(20260620);
    const r = solveDailyCipher(s, 20260620, c.answer);
    expect(r.solved).toBe(true);
    expect(r.fragments).toBe(DAILY_CIPHER_REWARD);
    expect(solveDailyCipher(s, 20260620, c.answer).solved).toBe(false); // already solved today
  });
  it('rejects a wrong guess', () => {
    const s = defaultSave();
    expect(solveDailyCipher(s, 20260620, 'nope').solved).toBe(false);
  });
});
