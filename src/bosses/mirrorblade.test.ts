import { describe, it, expect } from 'vitest';
import { mirrorbladeStaggerable, staggerMirrorblade } from './mirrorblade';
import { MIRRORBLADE } from '../tune';
import type { Enemy } from '../types';

const mk = (over: Partial<Enemy>): Enemy =>
  ({ kind: 'mirrorblade', phase: 1, timer: 0.1, telegraph: 1, vx: 900, vy: -300, ...over } as Enemy);

describe('mirrorblade parry-counter', () => {
  it('is staggerable ONLY mid-lunge (phase 1)', () => {
    expect(mirrorbladeStaggerable(mk({ phase: 1 }))).toBe(true);
    expect(mirrorbladeStaggerable(mk({ phase: 0 }))).toBe(false); // wind-up
    expect(mirrorbladeStaggerable(mk({ phase: 2 }))).toBe(false); // already recovering
    expect(mirrorbladeStaggerable(mk({ kind: 'warden', phase: 1 }))).toBe(false);
  });

  it('stagger cancels the lunge → extended RECOVER window, body stops dead', () => {
    const e = mk({ phase: 1, vx: 950, vy: -120, telegraph: 1 });
    staggerMirrorblade(e);
    expect(e.phase).toBe(2); // RECOVER (vulnerable)
    expect(e.timer).toBeCloseTo(MIRRORBLADE.recoverFast + MIRRORBLADE.staggerRecoverBonus, 6);
    expect(e.vx).toBe(0);
    expect(e.vy).toBe(0);
    expect(e.telegraph).toBe(0);
    // the window is genuinely longer than a normal fast recover (a real punish opening)
    expect(e.timer).toBeGreaterThan(MIRRORBLADE.recoverFast);
  });
});
