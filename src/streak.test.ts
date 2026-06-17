import { describe, it, expect } from 'vitest';
import { nextStreak, defaultSave } from './save';
import { migrateSave, SAVE_VERSION } from './migrate';

// 4.2 DAILY STREAK — a pure calendar transition. Rules: same day → unchanged,
// consecutive day → +1, any gap (or first-ever play) → reset to 1.
describe('4.2 daily streak — nextStreak transition', () => {
  it('a brand-new player (never played) starts at 1', () => {
    expect(nextStreak('2026-06-17', '', 0)).toBe(1);
  });

  it('playing again the SAME day leaves the streak unchanged', () => {
    expect(nextStreak('2026-06-17', '2026-06-17', 5)).toBe(5);
    // even if somehow stored as 0/1, a same-day replay never DROPS the streak
    expect(nextStreak('2026-06-17', '2026-06-17', 0)).toBe(1);
  });

  it('playing the NEXT calendar day increments the streak (+1)', () => {
    expect(nextStreak('2026-06-18', '2026-06-17', 3)).toBe(4);
    expect(nextStreak('2026-06-01', '2026-05-31', 9)).toBe(10); // across a month boundary
    expect(nextStreak('2026-01-01', '2025-12-31', 1)).toBe(2); // across a year boundary
  });

  it('a GAP of 2+ days resets the streak to 1', () => {
    expect(nextStreak('2026-06-20', '2026-06-17', 12)).toBe(1); // missed two days
    expect(nextStreak('2026-06-18', '2026-06-10', 30)).toBe(1); // long gap
  });

  it('a future/garbage lastPlayedDate never matches yesterday → resets to 1', () => {
    expect(nextStreak('2026-06-17', '2027-01-01', 8)).toBe(1);
    expect(nextStreak('2026-06-17', 'not-a-date', 8)).toBe(1);
  });

  it('three consecutive days build 1 → 2 → 3 (the retention loop)', () => {
    let streak = 0;
    let last = '';
    for (const day of ['2026-06-15', '2026-06-16', '2026-06-17']) {
      streak = nextStreak(day, last, streak);
      last = day;
    }
    expect(streak).toBe(3);
  });
});

describe('4.2 daily streak — save defaults + migration', () => {
  it('a fresh save starts with no streak history', () => {
    const d = defaultSave();
    expect(d.lastPlayedDate).toBe('');
    expect(d.playStreak).toBe(0);
  });

  it('a pre-v6 save default-fills the streak fields', () => {
    const old = { version: 5, highScore: 100 };
    const out = migrateSave(old, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.lastPlayedDate).toBe('');
    expect(out.playStreak).toBe(0);
  });

  it('a hand-edited wrong-typed streak degrades to a safe default', () => {
    const bad = { version: 6, lastPlayedDate: 123, playStreak: 'lots' };
    const out = migrateSave(bad as unknown, defaultSave());
    expect(out.lastPlayedDate).toBe(''); // non-string → default
    expect(out.playStreak).toBe(0); // non-number → default
  });

  it('a negative/fractional playStreak is clamped to a non-negative integer', () => {
    expect(migrateSave({ version: 6, playStreak: -4 }, defaultSave()).playStreak).toBe(0);
    expect(migrateSave({ version: 6, playStreak: 3.9 }, defaultSave()).playStreak).toBe(3);
  });

  it('a valid stored streak survives migration intact', () => {
    const out = migrateSave({ version: 6, lastPlayedDate: '2026-06-17', playStreak: 7 }, defaultSave());
    expect(out.lastPlayedDate).toBe('2026-06-17');
    expect(out.playStreak).toBe(7);
  });
});
