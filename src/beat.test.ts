import { describe, it, expect } from 'vitest';
import { BEAT } from './tune';
import { makeGrid, phase01, signedNearest, BeatClock, gradeRelease } from './beat';

const g = makeGrid(112);

describe('beat — pure rhythm clock + grading', () => {
  it('makeGrid derives the grid @112 BPM', () => {
    expect(g.beatDur).toBeCloseTo(0.535714, 5);
    expect(g.barDur).toBeCloseTo(2.142857, 5);
    expect(g.sixteenthDur).toBeCloseTo(0.133929, 5);
    expect(g.beatsPerBar).toBe(4);
  });

  it('phase01 basic + on-beat wrap', () => {
    expect(phase01(g.beatDur, g.beatDur)).toBeCloseTo(0, 6);
    expect(phase01(g.beatDur / 2, g.beatDur)).toBeCloseTo(0.5, 6);
    expect(phase01(0, g.beatDur)).toBe(0);
  });

  it('phase01 handles negative t', () => {
    expect(phase01(-g.beatDur * 0.25, g.beatDur)).toBeCloseTo(0.75, 6);
  });

  it('barPhase wraps cleanly at bar end', () => {
    expect(phase01(g.barDur - 1e-4, g.barDur)).toBeGreaterThan(0.99);
    expect(phase01(g.barDur + 1e-4, g.barDur)).toBeLessThan(0.01);
  });

  it('signedNearest sign convention', () => {
    expect(signedNearest(0.01, g.beatDur)).toBeLessThan(0); // just past a beat
    expect(signedNearest(g.beatDur - 0.01, g.beatDur)).toBeGreaterThan(0); // just before the next
    expect(signedNearest(g.beatDur / 2, g.beatDur)).toBeCloseTo(g.beatDur / 2, 6);
  });

  it('beatError is non-negative and ≤ beatDur/2', () => {
    const c = new BeatClock(g);
    for (const t of [0, 0.1, 0.2678, 0.4, 0.535, 1.07]) {
      c.t = t;
      expect(c.beatError()).toBeGreaterThanOrEqual(0);
      expect(c.beatError()).toBeLessThanOrEqual(g.beatDur / 2 + 1e-9);
    }
  });

  it('perfect window boundary (after grace subtraction)', () => {
    expect(gradeRelease(0, true)).toBe('perfect');
    expect(gradeRelease(0.105, true)).toBe('perfect'); // 0.105 - 0.06 = 0.045 (edge)
    expect(gradeRelease(0.105 + 5e-10, true)).toBe('perfect'); // EPS protects the edge vs float noise
    expect(gradeRelease(0.106, true)).toBe('good');
  });

  it('good window boundary', () => {
    expect(gradeRelease(0.17, true)).toBe('good'); // 0.17 - 0.06 = 0.11 (edge)
    expect(gradeRelease(0.171, true)).toBe('off');
  });

  it('off when far from the beat', () => {
    expect(gradeRelease(g.beatDur / 2, true)).toBe('off');
  });

  it('unsynced always grades off (no false rewards)', () => {
    expect(gradeRelease(0, false)).toBe('off');
    expect(new BeatClock(g).synced).toBe(false);
  });

  it('reconcile first-sync seeds the epoch exactly', () => {
    const c = new BeatClock(g);
    c.reconcile(1.234, 0.016);
    expect(c.synced).toBe(true);
    expect(c.t).toBe(1.234);
  });

  it('reconcile hard-snaps on big drift, eases on small drift', () => {
    const snap = new BeatClock(g);
    snap.reconcile(0, 0.016); // sync at 0
    snap.t = 0;
    snap.reconcile(BEAT.reseedSnapTolerance + 1, 0.016); // drift > tolerance → snap
    expect(snap.t).toBe(BEAT.reseedSnapTolerance + 1);

    const ease = new BeatClock(g);
    ease.reconcile(0, 0.016);
    ease.t = 0;
    ease.reconcile(0.1, 0.016); // drift 0.1 < tolerance → ease strictly between
    expect(ease.t).toBeGreaterThan(0);
    expect(ease.t).toBeLessThan(0.1);
  });

  it('nextGridTime quantizes forward; identical dt sequences are deterministic', () => {
    const c = new BeatClock(g);
    c.t = 0.2;
    const ng = c.nextGridTime();
    expect(ng).toBeGreaterThan(c.t);
    expect(ng - c.t).toBeLessThanOrEqual(g.sixteenthDur + 1e-9);

    const a = new BeatClock(g);
    const b = new BeatClock(g);
    for (const dt of [0.016, 0.017, 0.016, 0.02, 0.015]) {
      a.advance(dt);
      b.advance(dt);
    }
    expect(a.t).toBe(b.t);
  });

  it('nextGridTime is strictly forward even ON a grid boundary (the risky case)', () => {
    const c = new BeatClock(g);
    for (const tt of [0, g.sixteenthDur, 2 * g.sixteenthDur]) {
      c.t = tt;
      expect(c.nextGridTime()).toBeGreaterThan(tt);
      expect(c.nextGridTime() - tt).toBeLessThanOrEqual(g.sixteenthDur + 1e-9);
    }
  });
});
