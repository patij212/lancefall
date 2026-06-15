import { describe, it, expect } from 'vitest';
import { sanitizeName, validDaily, weekStartMs, capsOk, corsHeaders, MODES } from '../worker/src/validate';

// The leaderboard worker's security-relevant logic was previously untested. These cover the
// pure validators it relies on, so the only network-facing component has a regression net.

describe('worker — mode allow-list', () => {
  it('includes every client mode id incl. the renamed SOLSTICE PROTOCOL (id longestday)', () => {
    for (const id of ['endless', 'arena', 'daily', 'nightmare', 'bossrush', 'longestday']) {
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

describe('worker — corsHeaders scoping', () => {
  it('reflects LANCEFALL origins, defaults to prod for anything else', () => {
    expect(corsHeaders('https://lancefall.pages.dev')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
    expect(corsHeaders('https://abc123.lancefall.pages.dev')['access-control-allow-origin']).toBe('https://abc123.lancefall.pages.dev');
    expect(corsHeaders('http://localhost:5197')['access-control-allow-origin']).toBe('http://localhost:5197');
    expect(corsHeaders('https://evil.example.com')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
    expect(corsHeaders('')['access-control-allow-origin']).toBe('https://lancefall.pages.dev');
  });
});
