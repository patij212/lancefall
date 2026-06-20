import { describe, it, expect } from 'vitest';
import { newAccountId, sanitizeSaveBlob, mergeServerSave } from '../worker/src/accounts';
import { defaultSave } from './save';

describe('worker accounts helpers', () => {
  it('newAccountId is unique-ish and well-formed', () => {
    const a = newAccountId(), b = newAccountId();
    expect(a).toMatch(/^acc_[a-z0-9]{16,}$/);
    expect(a).not.toBe(b);
  });
  it('sanitizeSaveBlob clamps a hostile blob to a clean save', () => {
    const evil = { highScore: 'NaNwowow', unlockedShips: 'not-an-array', meta: { hp: 'x' }, version: 999 };
    const s = sanitizeSaveBlob(evil);
    expect(typeof s.highScore).toBe('number');
    expect(Array.isArray(s.unlockedShips)).toBe(true);
    expect(s.unlockedShips).toContain('lance');
    expect(s.meta).toEqual({}); // 'x' dropped by coerceNumberRecord
  });
  it('sanitizeSaveBlob returns a default save for junk input', () => {
    expect(sanitizeSaveBlob(null).highScore).toBe(0);
    expect(sanitizeSaveBlob('nope').highScore).toBe(0);
  });
  it('mergeServerSave adopts incoming when the server has none', () => {
    const inc = { ...defaultSave(), highScore: 42 };
    expect(mergeServerSave(null, inc, 0, 1).highScore).toBe(42);
  });
  it('mergeServerSave field-merges two saves (no lost progress)', () => {
    const server = { ...defaultSave(), highScore: 100, achievements: ['a'] };
    const inc = { ...defaultSave(), highScore: 50, achievements: ['b'] };
    const m = mergeServerSave(server, inc, 1, 2);
    expect(m.highScore).toBe(100);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b']));
  });
});
