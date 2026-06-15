import { describe, it, expect } from 'vitest';
import { MODES, modeById, modeBrief, MAX_DAILY_ATTEMPTS, rollDailyAttempt } from './modes';

describe('modes', () => {
  it('modeById returns the match, or ENDLESS as a safe fallback', () => {
    expect(modeById('endless').id).toBe('endless');
    expect(modeById('nightmare').id).toBe('nightmare');
    expect(modeById('bogus').id).toBe('endless'); // junk → fallback, never throws
  });

  it('has the 6 expected modes incl. THE LONGEST DAY', () => {
    expect(MODES.length).toBe(6);
    expect(MODES.map((m) => m.id)).toContain('longestday');
  });

  it('NIGHTMARE carries the sudden-death rule; others do not (M2)', () => {
    expect(modeById('nightmare').rules?.suddenDeath?.afterBoss).toBe(1);
    expect(modeById('endless').rules).toBeUndefined();
  });

  it('ARENA and BOSS RUSH carry cleartime scoring; time-driven modes do not (M3)', () => {
    expect(modeById('arena').rules?.scoreFrame).toBe('cleartime');
    expect(modeById('bossrush').rules?.scoreFrame).toBe('cleartime');
    expect(modeById('endless').rules?.scoreFrame).toBeUndefined();
    expect(modeById('daily').rules?.scoreFrame).toBeUndefined();
  });
});

describe('§4 M4 daily best-of-3 attempts', () => {
  it('resets the used count on a new day', () => {
    expect(rollDailyAttempt('2026-06-15', '2026-06-14', 3)).toEqual({ attempts: 0, locked: false });
    expect(rollDailyAttempt('2026-06-15', '', 0)).toEqual({ attempts: 0, locked: false });
  });
  it('reads the stored count on the same day', () => {
    expect(rollDailyAttempt('2026-06-15', '2026-06-15', 1)).toEqual({ attempts: 1, locked: false });
  });
  it('locks once MAX_DAILY_ATTEMPTS are used today', () => {
    expect(rollDailyAttempt('2026-06-15', '2026-06-15', MAX_DAILY_ATTEMPTS).locked).toBe(true);
    expect(rollDailyAttempt('2026-06-15', '2026-06-15', MAX_DAILY_ATTEMPTS - 1).locked).toBe(false);
  });
});

describe('modeBrief', () => {
  it('gives a valid tier + reward string for every mode', () => {
    for (const m of MODES) {
      const b = modeBrief(m);
      expect(['STANDARD', 'HARD', 'BRUTAL']).toContain(b.tier);
      expect(b.reward).toBe(`×${m.shardMul} shards`);
    }
  });

  it('reads difficulty + identity purely from the RunConfig', () => {
    expect(modeBrief(modeById('endless')).tier).toBe('STANDARD');
    expect(modeBrief(modeById('nightmare')).tier).toBe('BRUTAL');
    expect(modeBrief(modeById('arena')).note).toBe('WINNABLE');
    expect(modeBrief(modeById('bossrush')).note).toBe('WINNABLE');
    expect(modeBrief(modeById('longestday')).note).toBe('CIPHER');
    expect(modeBrief(modeById('daily')).note).toBe('SEEDED');
    expect(modeBrief(modeById('endless')).note).toBe('');
  });
});
