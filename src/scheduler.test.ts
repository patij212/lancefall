import { describe, it, expect } from 'vitest';
import { Scheduler } from './scheduler';
import { TUNE } from './tune';

describe('Scheduler hitstop', () => {
  it('freezes the sim (returns 0 dt) while hitstop is active', () => {
    const s = new Scheduler();
    s.requestHitstop(0.1);
    expect(s.frozen).toBe(true);
    expect(s.update(0.016)).toBe(0); // sim dt is zero while frozen
    expect(s.frozen).toBe(true); // still time left
  });

  it('thaws once the hitstop window elapses', () => {
    const s = new Scheduler();
    s.requestHitstop(0.05);
    s.update(0.05); // consume exactly the window
    expect(s.frozen).toBe(false);
    expect(s.update(0.016)).toBeCloseTo(0.016); // normal time resumes
  });

  it('overlapping hitstops take the max, never stacking into a lag spike', () => {
    const s = new Scheduler();
    s.requestHitstop(0.1);
    s.requestHitstop(0.04); // shorter — must NOT shorten the running freeze
    s.update(0.05);
    expect(s.frozen).toBe(true); // 0.1 - 0.05 = 0.05 left, still frozen
  });
});

describe('Scheduler slow-mo', () => {
  it('drops the time scale and slows the returned sim dt', () => {
    const s = new Scheduler();
    s.requestSlowmo();
    const dt = s.update(0.016);
    expect(s.timeScale).toBe(TUNE.juice.slowmoScale);
    expect(dt).toBeCloseTo(0.016 * TUNE.juice.slowmoScale);
  });

  it('a deeper slow-mo can never be lightened by a shallower request', () => {
    const s = new Scheduler();
    s.requestDeepSlowmo(0.1, 1.0); // deep LAST BREATH bullet-time
    s.requestSlowmo(); // routine 0.3 slow-mo must not raise the scale
    expect(s.timeScale).toBe(0.1);
  });

  it('a longer hold can never be cut short by a shorter request', () => {
    const s = new Scheduler();
    s.requestDeepSlowmo(0.2, 2.0);
    s.requestSlowmo(); // shorter hold must not shorten the deep window
    s.update(TUNE.juice.slowmoHold + 0.01); // past the routine hold...
    expect(s.timeScale).toBe(0.2); // ...but the deep window still holds
  });

  it('eases back to full speed after the hold expires', () => {
    const s = new Scheduler();
    s.requestSlowmo();
    s.update(TUNE.juice.slowmoHold + 0.001); // hold expires, easing arms
    // run the ease to completion
    let guard = 0;
    while (s.timeScale < 1 && guard++ < 1000) s.update(0.016);
    expect(s.timeScale).toBe(1);
  });
});

describe('Scheduler reset', () => {
  it('clears all time-control state back to normal', () => {
    const s = new Scheduler();
    s.requestHitstop(0.2);
    s.requestSlowmo();
    s.reset();
    expect(s.timeScale).toBe(1);
    expect(s.frozen).toBe(false);
    expect(s.update(0.016)).toBeCloseTo(0.016); // immediately normal again
  });
});
