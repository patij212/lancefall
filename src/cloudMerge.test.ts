import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { MERGE_CATEGORIES } from './cloudMerge';

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
