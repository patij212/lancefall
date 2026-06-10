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
    const g2 = deserializeGhost(serializeGhost(g))!;
    expect(g2.seed).toBe(g.seed);
    expect(g2.mode).toBe('daily');
    expect(g2.name).toBe('ACE');
    expect(g2.score).toBe(12345);
    expect(g2.wave).toBe(7);
    expect(g2.interval).toBeCloseTo(g.interval, 6);
    expect(g2.xs).toEqual(g.xs); // int16 exact for these in-range values
    expect(g2.ys).toEqual(g.ys);
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
