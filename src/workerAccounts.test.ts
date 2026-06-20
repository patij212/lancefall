import { describe, it, expect } from 'vitest';
import { newAccountId, sanitizeSaveBlob, mergeServerSave, claimName, mergeForLink } from '../worker/src/accounts';
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

describe('claimName', () => {
  it('strips non-word/space/hyphen characters', () => {
    expect(claimName('Ace!@#')).toBe('Ace');
    expect(claimName('  hello  ')).toBe('hello');
    expect(claimName('my-name 99')).toBe('my-name 99');
  });
  it('caps at 16 characters', () => {
    expect(claimName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
  });
  it('returns empty string for blank/all-junk input', () => {
    expect(claimName('!!!???')).toBe('');
    expect(claimName('')).toBe('');
    expect(claimName(null)).toBe('');
    expect(claimName(undefined)).toBe('');
  });
});

describe('mergeForLink', () => {
  it('keeps both saves unlocks on link', () => {
    const a = { ...defaultSave(), achievements: ['first-blood'], unlockedShips: ['lance', 'hawk'] };
    const b = { ...defaultSave(), achievements: ['clutch'], unlockedShips: ['lance', 'ghost'] };
    const m = mergeForLink(a, b, 1, 2);
    expect(new Set(m.achievements)).toEqual(new Set(['first-blood', 'clutch']));
    expect(new Set(m.unlockedShips)).toContain('hawk');
    expect(new Set(m.unlockedShips)).toContain('ghost');
  });
  it('returns current save when existing is null', () => {
    const cur = { ...defaultSave(), highScore: 77 };
    expect(mergeForLink(null, cur, 0, 1).highScore).toBe(77);
  });
  it('returns existing save when current is null', () => {
    const ex = { ...defaultSave(), highScore: 55 };
    expect(mergeForLink(ex, null, 0, 1).highScore).toBe(55);
  });
  it('returns a clean default save when both are null', () => {
    const m = mergeForLink(null, null, 0, 1);
    expect(m.highScore).toBe(0);
  });
});
