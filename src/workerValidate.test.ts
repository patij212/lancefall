import { describe, it, expect } from 'vitest';
import { sanitizeName, validDaily, weekStartMs, capsOk, corsHeaders, isAllowedOrigin, MODES, boardCacheKey, BOARD_CACHE_TTL, sanitizeDevice, sanitizeAchIds, ACH_CACHE_TTL, ACCOUNT_RATE_LIMIT, ACCOUNT_RATE_WINDOW_MS, DEDUPE_WINDOW_MS } from '../worker/src/validate';

// The leaderboard worker's security-relevant logic was previously untested. These cover the
// pure validators it relies on, so the only network-facing component has a regression net.

describe('worker — mode allow-list', () => {
  it('includes every client mode id incl. SOLSTICE PROTOCOL (longestday) and the WEEKLY CHALLENGE (weekly)', () => {
    for (const id of ['endless', 'arena', 'daily', 'weekly', 'nightmare', 'bossrush', 'longestday']) {
      expect(MODES.has(id)).toBe(true);
    }
    expect(MODES.has('totally-fake')).toBe(false);
  });
});

describe('worker — sanitizeName', () => {
  it('strips junk, caps length, falls back to ANON', () => {
    expect(sanitizeName('<script>')).toBe('script');
    expect(sanitizeName('A very long handle indeed').length).toBeLessThanOrEqual(16);
    expect(sanitizeName('')).toBe('ANON');
    expect(sanitizeName(null)).toBe('ANON');
    expect(sanitizeName('Lance_99 X')).toBe('Lance_99 X');
  });
});

describe('worker — validDaily', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  it('accepts a valid past/today date, rejects malformed or future', () => {
    expect(validDaily('2026-06-15', now)).toBe(true);
    expect(validDaily('2026-06-10', now)).toBe(true);
    expect(validDaily('2026-13-40', now)).toBe(false); // not a real date
    expect(validDaily('15-06-2026', now)).toBe(false); // wrong format
    expect(validDaily('2030-01-01', now)).toBe(false); // future
  });
});

describe('worker — weekStartMs (Monday 00:00 UTC)', () => {
  it('snaps to the Monday of the week', () => {
    const mon = weekStartMs(Date.parse('2026-06-15T09:30:00Z')); // Mon Jun 15
    expect(new Date(mon).toISOString()).toBe('2026-06-15T00:00:00.000Z');
    const sun = weekStartMs(Date.parse('2026-06-21T23:00:00Z')); // Sun Jun 21 → same week's Monday
    expect(new Date(sun).toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('worker — capsOk plausibility (raises the floor, never rejects a real run)', () => {
  it('rejects the absurd-low-wave cheat and out-of-range payloads', () => {
    expect(capsOk(49_000_000, 1, 0, 0)).toBe(false); // 49M on wave 1 — the devtools cheat
    expect(capsOk(0, 5, 10, 0)).toBe(false); // non-positive
    expect(capsOk(60_000_000, 100, 100, 7)).toBe(false); // over the hard cap
    expect(capsOk(1000, -1, 0, 0)).toBe(false); // bad wave
    expect(capsOk(NaN, 5, 5, 0)).toBe(false);
  });
  it('accepts plausible real runs across the curve', () => {
    expect(capsOk(120_000, 1, 8, 0)).toBe(true); // a short skilled run
    expect(capsOk(5_000_000, 12, 80, 3)).toBe(true); // a deep heated run
    expect(capsOk(40_000_000, 60, 300, 7)).toBe(true); // a monster legit run, under the cap
  });
});

// Edge-caching GET /leaderboard collapses repeated board reads so the GROUP BY query
// stops re-scanning D1 (the free-tier rows-read ceiling). The key must depend ONLY on the
// params that change the result, so every player shares one cached board and a stray query
// param can't fragment (or poison) the cache.
describe('worker — boardCacheKey edge-cache key', () => {
  const K = (q: string) => boardCacheKey(new URL(`https://lf.dev/leaderboard${q}`));
  it('ignores extra/unknown query params (no cache fragmentation)', () => {
    expect(K('?mode=arena&utm=x&_=123')).toBe(K('?mode=arena'));
  });
  it('keys distinctly per mode', () => {
    expect(K('?mode=arena')).not.toBe(K('?mode=endless'));
  });
  it('normalizes scope — only weekly matters; a junk scope keys as all-time', () => {
    expect(K('?mode=arena&scope=weekly')).not.toBe(K('?mode=arena'));
    expect(K('?mode=arena&scope=garbage')).toBe(K('?mode=arena'));
  });
  it('keys distinctly per daily date', () => {
    expect(K('?mode=daily&daily=2026-06-17')).not.toBe(K('?mode=daily&daily=2026-06-18'));
  });
  it('TTL is a sane positive, sub-2-minute window', () => {
    expect(BOARD_CACHE_TTL).toBeGreaterThan(0);
    expect(BOARD_CACHE_TTL).toBeLessThanOrEqual(120);
  });
});

describe('worker — §v7 achievement rarity validators', () => {
  it('sanitizeDevice accepts a clean token, lowercases, rejects junk/length', () => {
    expect(sanitizeDevice('abc123def456')).toBe('abc123def456');
    expect(sanitizeDevice('ABC123DEF456')).toBe('abc123def456'); // lowercased
    expect(sanitizeDevice('short')).toBeNull(); // < 8
    expect(sanitizeDevice('a'.repeat(41))).toBeNull(); // > 40
    expect(sanitizeDevice('has spaces!!')).toBeNull(); // non-alphanumeric
    expect(sanitizeDevice(null)).toBeNull();
    expect(sanitizeDevice(12345678)).toBe('12345678'); // numbers stringify fine
  });

  it('sanitizeAchIds filters non-ids, dedupes, caps at 64', () => {
    expect(sanitizeAchIds(['firstblood', 'skewer', 'firstblood'])).toEqual(['firstblood', 'skewer']);
    expect(sanitizeAchIds(['ok_id', 7, null, '', 'has space', 'BadCaps'])).toEqual(['ok_id']);
    expect(sanitizeAchIds('not-an-array')).toEqual([]);
    expect(sanitizeAchIds(Array.from({ length: 100 }, (_, i) => 'a' + i)).length).toBe(64);
  });

  it('ACH_CACHE_TTL is a sane positive window (slower than the board)', () => {
    expect(ACH_CACHE_TTL).toBeGreaterThanOrEqual(BOARD_CACHE_TTL);
    expect(ACH_CACHE_TTL).toBeLessThanOrEqual(3600);
  });
});

describe('worker — isAllowedOrigin', () => {
  it('allows lancefall.pages.dev (prod)', () => {
    expect(isAllowedOrigin('https://lancefall.pages.dev')).toBe(true);
  });
  it('allows preview subdomain deploys (*.lancefall.pages.dev)', () => {
    expect(isAllowedOrigin('https://abc123.lancefall.pages.dev')).toBe(true);
    expect(isAllowedOrigin('https://my-branch.lancefall.pages.dev')).toBe(true);
  });
  it('allows localhost on any port (local dev)', () => {
    expect(isAllowedOrigin('http://localhost:5197')).toBe(true);
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4000')).toBe(true);
  });
  it('rejects arbitrary origins', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://evil.lancefall.pages.dev.evil.com')).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
    expect(isAllowedOrigin('https://notagamelancefall.pages.dev')).toBe(false);
  });
});

// ── §P3 anti-cheat constants (regression guard) ────────────────────────────────────────
// These constants are used directly in index.ts SQL queries; if they drift to insane values
// the guard silently breaks. The test also re-checks capsOk rejects the classic devtools cheat.
describe('worker — §P3 anti-cheat constants', () => {
  it('ACCOUNT_RATE_LIMIT is a sane positive integer (5–100)', () => {
    expect(Number.isInteger(ACCOUNT_RATE_LIMIT)).toBe(true);
    expect(ACCOUNT_RATE_LIMIT).toBeGreaterThanOrEqual(5);
    expect(ACCOUNT_RATE_LIMIT).toBeLessThanOrEqual(100);
  });

  it('ACCOUNT_RATE_WINDOW_MS is a sane window (10 s – 10 min)', () => {
    expect(Number.isFinite(ACCOUNT_RATE_WINDOW_MS)).toBe(true);
    expect(ACCOUNT_RATE_WINDOW_MS).toBeGreaterThanOrEqual(10_000);
    expect(ACCOUNT_RATE_WINDOW_MS).toBeLessThanOrEqual(600_000);
  });

  it('DEDUPE_WINDOW_MS is a sane window (1 min – 30 min)', () => {
    expect(Number.isFinite(DEDUPE_WINDOW_MS)).toBe(true);
    expect(DEDUPE_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
    expect(DEDUPE_WINDOW_MS).toBeLessThanOrEqual(1_800_000);
  });

  // Regression guard: capsOk must still reject the "49M on wave 1" devtools cheat payload
  // even after any future refactor of the constants or plausibility formula.
  it('capsOk (regression) — still rejects the classic devtools cheat: 49M on wave 1', () => {
    expect(capsOk(49_000_000, 1, 0, 0)).toBe(false);
  });
});

describe('worker — corsHeaders scoping', () => {
  it('reflects LANCEFALL origins, defaults to prod for anything else', () => {
    expect(corsHeaders('https://lancefall.pages.dev')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
    expect(corsHeaders('https://abc123.lancefall.pages.dev')['access-control-allow-origin']).toBe('https://abc123.lancefall.pages.dev');
    expect(corsHeaders('http://localhost:5197')['access-control-allow-origin']).toBe('http://localhost:5197');
    expect(corsHeaders('https://evil.example.com')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
    expect(corsHeaders('')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
  });
});
