import { describe, it, expect } from 'vitest';
import {
  newGhost,
  recordGhost,
  ghostAt,
  downsampleGhost,
  serializeGhost,
  deserializeGhost,
  toChallengeCode,
  fromChallengeCode,
  buildDuelUrl,
  extractDuelCode,
  stripDuelQuery,
  GHOST_INTERVAL,
} from './ghost';

describe('ghost — replay trace + challenge codes', () => {
  it('recordGhost stores one sample per interval slot', () => {
    const g = newGhost(123, 'daily');
    recordGhost(g, 0.0, 10, 20);
    recordGhost(g, 0.05, 11, 21); // still slot 0 → ignored
    recordGhost(g, 0.1, 30, 40); // slot 1
    recordGhost(g, 0.2, 50, 60); // slot 2
    expect(g.xs).toEqual([10, 30, 50]);
    expect(g.ys).toEqual([20, 40, 60]);
  });

  it('recordGhost back-fills skipped slots after a stall', () => {
    const g = newGhost(1, 'daily');
    recordGhost(g, 0, 0, 0); // slot 0
    recordGhost(g, 0.5, 100, 100); // jumped to slot 5 → fill 1..4 with last, then 5
    expect(g.xs.length).toBe(6);
    expect(g.xs[0]).toBe(0);
    expect(g.xs[5]).toBe(100);
    expect(g.xs.slice(1, 5)).toEqual([100, 100, 100, 100]);
  });

  it('ghostAt interpolates between samples and clamps to the ends', () => {
    const g = newGhost(1, 'daily');
    g.xs = [0, 100];
    g.ys = [0, 200];
    g.interval = 0.1;
    expect(ghostAt(g, 0)).toEqual({ x: 0, y: 0, done: false });
    const mid = ghostAt(g, 0.05)!;
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.y).toBeCloseTo(100, 5);
    expect(ghostAt(g, 1)).toEqual({ x: 100, y: 200, done: true }); // past the end → done
    expect(ghostAt(newGhost(1, 'd'), 0)).toBeNull(); // empty trace
  });

  it('downsampleGhost reduces samples + stretches the interval (time-aligned)', () => {
    const g = newGhost(1, 'daily');
    for (let i = 0; i < 100; i++) {
      g.xs.push(i);
      g.ys.push(i * 2);
    }
    const ds = downsampleGhost(g, 10);
    expect(ds.xs.length).toBe(10);
    expect(ds.interval).toBeCloseTo(GHOST_INTERVAL * 10, 6);
    expect(ds.xs[0]).toBe(0); // first sample preserved
    const totalOrig = (g.xs.length - 1) * g.interval;
    const totalDs = (ds.xs.length - 1) * ds.interval;
    expect(Math.abs(totalDs - totalOrig)).toBeLessThan(ds.interval); // ~same span
  });

  it('serialize/deserialize round-trips positions + header exactly', () => {
    const g = newGhost(20260610, 'daily');
    g.name = 'ACE';
    g.score = 12345;
    g.wave = 7;
    for (let i = 0; i < 50; i++) {
      g.xs.push(Math.round(Math.sin(i) * 400 + 640));
      g.ys.push(Math.round(Math.cos(i) * 300 + 360));
    }
    g.heat = 5;
    g.ngPlus = 2;
    const g2 = deserializeGhost(serializeGhost(g))!;
    expect(g2.seed).toBe(g.seed);
    expect(g2.mode).toBe('daily');
    expect(g2.name).toBe('ACE');
    expect(g2.score).toBe(12345);
    expect(g2.wave).toBe(7);
    expect(g2.interval).toBeCloseTo(g.interval, 6);
    expect(g2.heat).toBe(5); // duel modifiers survive the round-trip
    expect(g2.ngPlus).toBe(2);
    expect(g2.xs).toEqual(g.xs); // int16 exact for these in-range values
    expect(g2.ys).toEqual(g.ys);
  });

  it('a duel code carries the challenger Heat/NG+; an old code defaults them to 0', () => {
    const g = newGhost(424242, 'challenge');
    g.heat = 4;
    g.ngPlus = 3;
    for (let i = 0; i < 200; i++) { g.xs.push(i); g.ys.push(i); }
    const g2 = fromChallengeCode(toChallengeCode(g))!;
    expect(g2.heat).toBe(4); // the acceptor reproduces the challenger's fight
    expect(g2.ngPlus).toBe(3);
    // a legacy code (header without h/ng) decodes to 0 = COLD / no NG+ (safe default)
    const legacy = '{"s":1,"m":"daily","n":"OLD","sc":1,"w":1,"iv":100}|';
    const lg = deserializeGhost(legacy)!;
    expect(lg.heat).toBe(0);
    expect(lg.ngPlus).toBe(0);
  });

  it('challenge code round-trips a downsampled ghost; rejects garbage', () => {
    const g = newGhost(999, 'challenge');
    g.name = 'BOB';
    g.score = 7777;
    for (let i = 0; i < 600; i++) {
      g.xs.push(100 + i);
      g.ys.push(200 + (i % 50));
    }
    const g2 = fromChallengeCode(toChallengeCode(g))!;
    expect(g2.seed).toBe(999);
    expect(g2.score).toBe(7777);
    expect(g2.name).toBe('BOB');
    expect(g2.xs.length).toBeLessThanOrEqual(90); // downsampled for the code
    expect(g2.xs.length).toBeGreaterThan(0);
    expect(fromChallengeCode('garbage')).toBeNull();
    expect(fromChallengeCode('')).toBeNull();
  });
});

describe('4.4 duel-as-link — code survives URL wrapping + extraction', () => {
  // Build a realistic duel code from a recorded ghost (carries seed + heat + ngPlus + trace).
  function sampleCode(): string {
    const g = newGhost(20260617, 'endless');
    g.name = 'DEV';
    g.score = 54321;
    g.wave = 9;
    g.heat = 3;
    g.ngPlus = 1;
    for (let i = 0; i < 300; i++) {
      g.xs.push(Math.round(Math.sin(i / 7) * 500 + 640));
      g.ys.push(Math.round(Math.cos(i / 5) * 320 + 360));
    }
    return toChallengeCode(g);
  }

  it('a duel code round-trips through buildDuelUrl → extractDuelCode → fromChallengeCode', () => {
    const code = sampleCode();
    const url = buildDuelUrl(code, 'https://lancefall.pages.dev/');
    expect(url.startsWith('https://lancefall.pages.dev/#duel=')).toBe(true);
    const back = extractDuelCode(url);
    expect(back).toBe(code); // byte-identical after the URL wrap/extract
    // and the extracted code still decodes to the same DETERMINISM-defining values
    const g = fromChallengeCode(back)!;
    expect(g.seed).toBe(20260617);
    expect(g.score).toBe(54321);
    expect(g.heat).toBe(3);
    expect(g.ngPlus).toBe(1);
  });

  it('extractDuelCode handles a hash fragment, a query param, and a bare hash', () => {
    const code = sampleCode();
    // the `+`/`/`/`=` chars that base64 + JSON produce MUST survive — encodeURIComponent escapes them
    expect(extractDuelCode(`#duel=${encodeURIComponent(code)}`)).toBe(code);
    expect(extractDuelCode(`?duel=${encodeURIComponent(code)}`)).toBe(code);
    expect(extractDuelCode(`https://x.dev/?a=1&duel=${encodeURIComponent(code)}&b=2`)).toBe(code);
    expect(extractDuelCode(`https://x.dev/#duel=${encodeURIComponent(code)}`)).toBe(code);
  });

  it('extractDuelCode returns "" when there is no duel payload', () => {
    expect(extractDuelCode('')).toBe('');
    expect(extractDuelCode('https://lancefall.pages.dev/')).toBe('');
    expect(extractDuelCode('#foo=bar')).toBe('');
    expect(extractDuelCode('?other=1')).toBe('');
  });

  it('stripDuelQuery removes only the duel param, preserving any others', () => {
    expect(stripDuelQuery('?duel=abc')).toBe('');
    expect(stripDuelQuery('?a=1&duel=abc')).toBe('?a=1');
    expect(stripDuelQuery('?duel=abc&b=2')).toBe('?b=2');
    expect(stripDuelQuery('?a=1&duel=abc&b=2')).toBe('?a=1&b=2');
    expect(stripDuelQuery('')).toBe(''); // nothing to strip
    expect(stripDuelQuery('?keep=1')).toBe('?keep=1'); // untouched
  });

  it('base64 special chars (+ / =) survive the round-trip via percent-encoding', () => {
    // a code that definitely contains base64 padding/specials
    const code = '{"s":1,"m":"endless","n":"X","sc":1,"w":1,"iv":100}|AAAA++//==';
    const url = buildDuelUrl(code, '');
    expect(url).toContain('%2B'); // '+' encoded (would otherwise decode to a space)
    expect(extractDuelCode(url)).toBe(code);
  });
});
