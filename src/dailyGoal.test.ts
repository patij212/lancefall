import { describe, it, expect } from 'vitest';
import {
  dailyGoalSeed,
  dailyGoalForDate,
  dailyGoalMet,
  updateDailyStreak,
  type DailyGoalStats,
} from './dailyGoal';

const baseStats: DailyGoalStats = {
  sovereignDown: false, bossKills: 0, wave: 1, bestCombo: 0, graze: 0, maxDashChain: 0, score: 0, hitsTaken: 0,
};

describe('daily goal — deterministic for everyone', () => {
  it('the same date yields the same goal; the hash is pure', () => {
    expect(dailyGoalForDate('2026-06-16')).toEqual(dailyGoalForDate('2026-06-16'));
    expect(dailyGoalSeed('2026-06-16')).toBe(dailyGoalSeed('2026-06-16'));
  });

  it('different dates vary the goal (not all identical across a month)', () => {
    const labels = new Set<string>();
    const descs = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const g = dailyGoalForDate(`2026-06-${String(d).padStart(2, '0')}`);
      labels.add(g.label);
      descs.add(g.desc);
      expect(g.desc.length).toBeGreaterThan(0);
    }
    expect(labels.size).toBeGreaterThan(2); // a real rotation, not one stuck goal
    expect(descs.size).toBeGreaterThan(5);
  });
});

describe('daily goal — evaluation', () => {
  it('checks each goal type against the run snapshot', () => {
    expect(dailyGoalMet({ type: 'sovereign', target: 0, label: '', desc: '' }, { ...baseStats, sovereignDown: true })).toBe(true);
    expect(dailyGoalMet({ type: 'sovereign', target: 0, label: '', desc: '' }, baseStats)).toBe(false);
    expect(dailyGoalMet({ type: 'bossKills', target: 3, label: '', desc: '' }, { ...baseStats, bossKills: 3 })).toBe(true);
    expect(dailyGoalMet({ type: 'bossKills', target: 3, label: '', desc: '' }, { ...baseStats, bossKills: 2 })).toBe(false);
    expect(dailyGoalMet({ type: 'wave', target: 10, label: '', desc: '' }, { ...baseStats, wave: 10 })).toBe(true);
    expect(dailyGoalMet({ type: 'combo', target: 30, label: '', desc: '' }, { ...baseStats, bestCombo: 31 })).toBe(true);
    expect(dailyGoalMet({ type: 'graze', target: 50, label: '', desc: '' }, { ...baseStats, graze: 49 })).toBe(false);
    expect(dailyGoalMet({ type: 'dashChain', target: 5, label: '', desc: '' }, { ...baseStats, maxDashChain: 6 })).toBe(true);
    expect(dailyGoalMet({ type: 'score', target: 200000, label: '', desc: '' }, { ...baseStats, score: 200000 })).toBe(true);
  });

  it('hitsUnder needs BOTH the depth (wave 6) and the hit cap', () => {
    const goal = { type: 'hitsUnder' as const, target: 2, label: '', desc: '' };
    expect(dailyGoalMet(goal, { ...baseStats, wave: 6, hitsTaken: 1 })).toBe(true);
    expect(dailyGoalMet(goal, { ...baseStats, wave: 6, hitsTaken: 2 })).toBe(false); // not UNDER 2
    expect(dailyGoalMet(goal, { ...baseStats, wave: 5, hitsTaken: 0 })).toBe(false); // too shallow
  });
});

describe('daily goal — streak', () => {
  it('extends on a consecutive UTC day, resets on a gap, and counts once per day', () => {
    // consecutive
    expect(updateDailyStreak('2026-06-16', '2026-06-15', 4, true)).toEqual({ streak: 5, lastDate: '2026-06-16', newlyCompleted: true });
    // a gap resets to 1
    expect(updateDailyStreak('2026-06-16', '2026-06-13', 4, true)).toEqual({ streak: 1, lastDate: '2026-06-16', newlyCompleted: true });
    // first ever (no prior date)
    expect(updateDailyStreak('2026-06-16', '', 0, true)).toEqual({ streak: 1, lastDate: '2026-06-16', newlyCompleted: true });
    // already counted today → idempotent
    expect(updateDailyStreak('2026-06-16', '2026-06-16', 5, true)).toEqual({ streak: 5, lastDate: '2026-06-16', newlyCompleted: false });
    // not met → no-op
    expect(updateDailyStreak('2026-06-16', '2026-06-15', 4, false)).toEqual({ streak: 4, lastDate: '2026-06-15', newlyCompleted: false });
  });
});
