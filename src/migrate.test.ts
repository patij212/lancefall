import { describe, it, expect } from 'vitest';
import { migrateSave, SAVE_VERSION } from './migrate';
import { defaultSave } from './save';
import { TUNE } from './tune';

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

  it('default-fills the v5 Stillpoint fields for a v4 save (single additive bump)', () => {
    const v4 = { version: 4, highScore: 46472, bestCombo: 31, handle: '' };
    const out = migrateSave(v4, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 6
    expect(out.highScore).toBe(46472); // pre-existing data preserved
    expect(out.stillpointFragments).toEqual([]);
    expect(out.fragmentsSpent).toBe(0);
    expect(out.stillpointLore).toEqual([]);
    expect(out.stillpointChoice).toBe('none');
    expect(out.ngPlusLevel).toBe(0);
    expect(out.ngPlusActive).toBe(false);
    expect(out.nemesis).toEqual({});
    expect(out.deepestWave).toBe(0);
  });

  it('default-fills the v6 pass fields for a v5 save (single additive bump)', () => {
    const v5 = { version: 5, highScore: 46472, stillpointChoice: 'none' };
    const out = migrateSave(v5, defaultSave());
    expect(out.version).toBe(SAVE_VERSION); // 6
    expect(out.highScore).toBe(46472); // pre-existing data preserved
    expect(out.selectedMode).toBe('endless');
    expect(out.dailyAttempts).toBe(0);
    expect(out.dailyAttemptDate).toBe('');
    expect(out.baseShields).toBe(TUNE.player.baseShields);
    expect(out.cityMemoryMeter).toBe(true);
    expect(out.firstRunsBeatHint).toBe(0);
  });

  it('round-trips a full default save unchanged', () => {
    const s = defaultSave();
    expect(migrateSave(JSON.parse(JSON.stringify(s)), defaultSave())).toEqual(s);
  });

  it('domain-guards a corrupted selectedMode back to the default, preserves a real one', () => {
    expect(migrateSave({ version: 6, selectedMode: 'garbage-not-a-mode' }, defaultSave()).selectedMode).toBe('endless');
    expect(migrateSave({ version: 6, selectedMode: 'nightmare' }, defaultSave()).selectedMode).toBe('nightmare');
  });
});
