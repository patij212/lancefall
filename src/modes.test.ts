import { describe, it, expect } from 'vitest';
import { MODES, modeById, modeBrief, modeRanked, modeSeeded, MAX_DAILY_ATTEMPTS, rollDailyAttempt, nextModeId } from './modes';

describe('modes', () => {
  it('modeById returns the match, or ENDLESS as a safe fallback', () => {
    expect(modeById('endless').id).toBe('endless');
    expect(modeById('nightmare').id).toBe('nightmare');
    expect(modeById('bogus').id).toBe('endless'); // junk → fallback, never throws
  });

  it('has the expected modes incl. SOLSTICE PROTOCOL (longestday), WEEKLY SIEGE and CASUAL', () => {
    expect(MODES.length).toBe(8);
    expect(MODES.map((m) => m.id)).toContain('longestday');
    expect(MODES.map((m) => m.id)).toContain('weekly');
    expect(MODES.map((m) => m.id)).toContain('casual');
  });

  it('WEEKLY SIEGE is a week-seeded, ranked challenge with a curated event pool', () => {
    const weekly = modeById('weekly');
    expect(weekly.seedKind).toBe('week'); // week-stable seed — reproducible for everyone
    expect(modeRanked(weekly)).toBe(true); // posts to the weekly board
    expect(modeSeeded(weekly)).toBe(true); // seeded protections (NG+ off, own PB ghost)
    expect(weekly.rules?.events).toBe('curated');
  });

  it('modeSeeded flags only the reproducible-for-all modes (Daily + Weekly)', () => {
    expect(modeSeeded(modeById('daily'))).toBe(true);
    expect(modeSeeded(modeById('weekly'))).toBe(true);
    expect(modeSeeded(modeById('endless'))).toBe(false);
    expect(modeSeeded(modeById('nightmare'))).toBe(false);
    expect(modeSeeded(modeById('longestday'))).toBe(false);
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

  it('curated/none events are declared per mode (M5)', () => {
    expect(modeById('nightmare').rules?.events).toBe('curated');
    expect(modeById('daily').rules?.events).toBe('curated');
    expect(modeById('arena').rules?.events).toBe('none');
    expect(modeById('bossrush').rules?.events).toBe('none');
    expect(modeById('endless').rules?.events).toBeUndefined();
    expect(modeById('longestday').rules?.events).toBeUndefined();
  });
});

// §7 — the leaderboard gate. CASUAL is OFF the boards; every mode shipped before it stays ON
// (an ABSENT rules.ranked must read as ranked). game.ts gates submitScore on modeRanked(mode).
describe('§7 ranked gate (Casual = off-leaderboard)', () => {
  it('CASUAL exists, is explicitly unranked, and carries a casual ARMOR cushion', () => {
    const casual = modeById('casual');
    expect(casual.id).toBe('casual');
    expect(casual.rules?.ranked).toBe(false);
    expect(modeRanked(casual)).toBe(false); // → game.ts skips submitScore
    expect(casual.rules?.casualShields).toBeGreaterThan(0); // SEE the content
  });

  it('every EXISTING mode still submits (absent rules.ranked = ranked)', () => {
    for (const id of ['endless', 'arena', 'daily', 'weekly', 'nightmare', 'bossrush', 'longestday']) {
      const m = modeById(id);
      expect(m.rules?.ranked).not.toBe(false); // never opted out
      expect(modeRanked(m)).toBe(true); // → game.ts still submits exactly as today
    }
  });

  it('modeRanked treats only an explicit false as unranked', () => {
    expect(modeRanked({ ...modeById('endless'), rules: undefined })).toBe(true);
    expect(modeRanked({ ...modeById('endless'), rules: {} })).toBe(true);
    expect(modeRanked({ ...modeById('endless'), rules: { ranked: true } })).toBe(true);
    expect(modeRanked({ ...modeById('endless'), rules: { ranked: false } })).toBe(false);
  });

  it('the Casual card surfaces an off-board note on the title (modeBrief)', () => {
    expect(modeBrief(modeById('casual')).note).toBe('CASUAL · OFF-BOARD');
  });
});

describe('§5 U2 nextModeId nav', () => {
  it('walks the mode list with wrap-around; junk id → the first mode', () => {
    const ids = MODES.map((m) => m.id);
    const n = ids.length;
    expect(nextModeId(ids[0], 1)).toBe(ids[1]);
    expect(nextModeId(ids[0], -1)).toBe(ids[n - 1]); // wrap left off the front
    expect(nextModeId(ids[n - 1], 1)).toBe(ids[0]); // wrap right off the end
    expect(nextModeId('garbage', 1)).toBe(ids[1]); // junk → first, step right
    expect(nextModeId('garbage', -1)).toBe(ids[n - 1]);
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
    expect(modeBrief(modeById('weekly')).note).toBe('WEEKLY');
    expect(modeBrief(modeById('nightmare')).note).toBe('SUDDEN DEATH'); // headline rule visible on the card
    expect(modeBrief(modeById('endless')).note).toBe('');
  });
});
