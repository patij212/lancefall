import { describe, it, expect } from 'vitest';
import { isMilestoneWave, milestoneAt, nextMilestoneWave, romanize, milestoneShardReward } from './milestones';
import { TUNE } from './tune';

const N = TUNE.director.milestoneInterval;

describe('isMilestoneWave', () => {
  it('is true exactly on multiples of the interval (>= the interval)', () => {
    expect(isMilestoneWave(N)).toBe(true);
    expect(isMilestoneWave(N * 2)).toBe(true);
    expect(isMilestoneWave(N * 7)).toBe(true);
  });

  it('is false between milestones and below the first one', () => {
    expect(isMilestoneWave(0)).toBe(false);
    expect(isMilestoneWave(1)).toBe(false);
    expect(isMilestoneWave(N - 1)).toBe(false);
    expect(isMilestoneWave(N + 1)).toBe(false);
  });
});

describe('milestoneAt', () => {
  it('returns null on a non-milestone wave', () => {
    expect(milestoneAt(1)).toBeNull();
    expect(milestoneAt(N - 1)).toBeNull();
    expect(milestoneAt(N + 1)).toBeNull();
  });

  it('returns a fully-populated, well-formed milestone on a milestone wave', () => {
    const m = milestoneAt(N)!;
    expect(m).not.toBeNull();
    expect(m.wave).toBe(N);
    expect(m.ordinal).toBe(1);
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.line.length).toBeGreaterThan(0);
    expect(m.accent).toMatch(/^#[0-9a-f]{6}$/i); // a real hex accent for the callout
  });

  it('ordinal counts milestones, not waves', () => {
    expect(milestoneAt(N)!.ordinal).toBe(1);
    expect(milestoneAt(N * 2)!.ordinal).toBe(2);
    expect(milestoneAt(N * 5)!.ordinal).toBe(5);
  });

  it('a recurring title slot gets a Roman tier on later laps (still legible)', () => {
    // first lap: bare titles; second lap: same slot but tagged with a Roman tier
    const firstLapTitle = milestoneAt(N)!.title; // ordinal 1, slot 0, lap 1
    const secondLapSameSlot = milestoneAt(N * 6)!.title; // ordinal 6 → slot 0 again, lap 2
    expect(secondLapSameSlot).toContain('· II');
    expect(secondLapSameSlot.startsWith(firstLapTitle)).toBe(true);
    expect(firstLapTitle).not.toContain('·');
  });

  it('is a PURE function of the wave — same wave → identical milestone (determinism-safe)', () => {
    const a = milestoneAt(N * 3);
    const b = milestoneAt(N * 3);
    expect(a).toEqual(b);
  });
});

describe('nextMilestoneWave', () => {
  it('points strictly past the current wave to the next interval boundary', () => {
    expect(nextMilestoneWave(0)).toBe(N);
    expect(nextMilestoneWave(1)).toBe(N);
    expect(nextMilestoneWave(N)).toBe(N * 2); // strictly AFTER — a milestone wave looks ahead
    expect(nextMilestoneWave(N + 1)).toBe(N * 2);
  });
});

describe('romanize', () => {
  it('produces the expected numerals for small integers', () => {
    expect(romanize(1)).toBe('I');
    expect(romanize(2)).toBe('II');
    expect(romanize(4)).toBe('IV');
    expect(romanize(5)).toBe('V');
    expect(romanize(9)).toBe('IX');
    expect(romanize(14)).toBe('XIV');
  });

  it('falls back to the plain number below 1 (total)', () => {
    expect(romanize(0)).toBe('0');
    expect(romanize(-3)).toBe('-3');
  });
});

describe('milestoneShardReward (§3.5)', () => {
  const base = TUNE.director.milestoneShardBase;
  const step = TUNE.director.milestoneShardStep;

  it('pays the base at the first milestone and scales with depth', () => {
    expect(milestoneShardReward(1)).toBe(base);
    expect(milestoneShardReward(2)).toBe(base + step);
    expect(milestoneShardReward(5)).toBe(base + 4 * step);
    expect(milestoneShardReward(10)).toBeGreaterThan(milestoneShardReward(3)); // deeper pays more
  });

  it('is a pure fn (same ordinal → same reward) and never negative', () => {
    expect(milestoneShardReward(3)).toBe(milestoneShardReward(3));
    expect(milestoneShardReward(0)).toBeGreaterThanOrEqual(0);
    expect(base).toBeGreaterThan(0);
    expect(step).toBeGreaterThan(0);
  });
});
