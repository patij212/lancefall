import { describe, it, expect } from 'vitest';
import {
  comboMultiplier,
  scoreForKill,
  grazeScore,
  shouldSlowmo,
  tickCombo,
  registerKill,
  hitstopFor,
} from './combat';
import { TUNE } from './tune';

describe('combo multiplier', () => {
  it('starts at 1 with no combo', () => {
    expect(comboMultiplier(0)).toBe(1);
  });

  it('grows with combo and is capped', () => {
    expect(comboMultiplier(10)).toBeCloseTo(2);
    expect(comboMultiplier(10000)).toBe(TUNE.combo.multCap);
  });
});

describe('score', () => {
  it('scales by combo multiplier', () => {
    expect(scoreForKill(100, 0, 0)).toBe(100);
    expect(scoreForKill(100, 10, 0)).toBe(200);
  });

  it('gives an in-dash bonus for multi-kills', () => {
    const single = scoreForKill(100, 0, 0);
    const fourth = scoreForKill(100, 0, 3);
    expect(fourth).toBeGreaterThan(single);
    expect(fourth).toBe(Math.round(100 * 1 * (1 + 3 * 0.25)));
  });

  it('graze score scales with combo', () => {
    expect(grazeScore(0)).toBe(TUNE.graze.scorePerGraze);
    expect(grazeScore(10)).toBe(TUNE.graze.scorePerGraze * 2);
  });
});

describe('slow-mo trigger', () => {
  it('fires only at the chain threshold', () => {
    expect(shouldSlowmo(TUNE.juice.slowmoChainThreshold - 1)).toBe(false);
    expect(shouldSlowmo(TUNE.juice.slowmoChainThreshold)).toBe(true);
  });
});

describe('combo decay', () => {
  it('registerKill bumps combo and refreshes the window', () => {
    const r = registerKill(4);
    expect(r.combo).toBe(5);
    expect(r.timer).toBe(TUNE.combo.window);
  });

  it('ticks down and breaks when the timer expires', () => {
    let s = { combo: 5, timer: 0.1 };
    let r = tickCombo(s.combo, s.timer, 0.05);
    expect(r.broke).toBe(false);
    expect(r.combo).toBe(5);
    r = tickCombo(r.combo, r.timer, 0.2);
    expect(r.broke).toBe(true);
    expect(r.combo).toBe(0);
  });

  it('no-op when there is no combo', () => {
    expect(tickCombo(0, 0, 1)).toEqual({ combo: 0, timer: 0, broke: false });
  });
});

describe('hitstop', () => {
  it('scales with chain size and caps', () => {
    expect(hitstopFor(1)).toBeCloseTo(TUNE.juice.hitstopBase);
    expect(hitstopFor(100)).toBeCloseTo(TUNE.juice.hitstopMax);
    expect(hitstopFor(3)).toBeGreaterThan(hitstopFor(1));
  });
});
