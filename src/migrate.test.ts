import { describe, it, expect } from 'vitest';
import { migrateSave, SAVE_VERSION } from './migrate';
import { defaultSave } from './save';

describe('save migration', () => {
  it('returns a fresh default for null/garbage input', () => {
    expect(migrateSave(null, defaultSave())).toEqual(defaultSave());
    expect(migrateSave('nonsense', defaultSave())).toEqual(defaultSave());
    expect(migrateSave(42, defaultSave())).toEqual(defaultSave());
  });

  it('preserves a legacy (unversioned) save and stamps the current version', () => {
    const legacy = { highScore: 46472, bestCombo: 31, shards: 120, selectedShip: 'phantom' };
    const out = migrateSave(legacy, defaultSave());
    expect(out.highScore).toBe(46472);
    expect(out.bestCombo).toBe(31);
    expect(out.shards).toBe(120);
    expect(out.selectedShip).toBe('phantom');
    expect(out.version).toBe(SAVE_VERSION);
  });

  it('default-fills fields absent from an old save', () => {
    const old = { highScore: 100 };
    const out = migrateSave(old, defaultSave());
    expect(out.unlockedShips).toEqual(['lance']);
    expect(out.meta).toEqual({});
    expect(out.achievements).toEqual([]);
    expect(out.bestWave).toBe(0);
    // v4 cosmetic dash-trail fields default-fill for pre-v4 saves
    expect(out.unlockedTrails).toEqual(['pulse']);
    expect(out.selectedTrail).toBe('pulse');
  });

  it('always reports the current version even if an older one was stored', () => {
    const out = migrateSave({ version: 1, highScore: 5 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.highScore).toBe(5);
  });
});
