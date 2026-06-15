import { describe, it, expect } from 'vitest';
import {
  comboMultiplier,
  scoreForKill,
  grazeScore,
  shouldSlowmo,
  tickCombo,
  registerKill,
  hitstopFor,
  clearTimeBonus,
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
  it('registerKill bumps combo and grows the window with the streak', () => {
    const r = registerKill(4);
    expect(r.combo).toBe(5);
    // the window grows with the just-earned kill (next = 5), capped at windowMax
    expect(r.timer).toBe(Math.min(TUNE.combo.window + 5 * TUNE.combo.windowPerCombo, TUNE.combo.windowMax));
  });

  it('clamps the dynamic combo window at windowMax', () => {
    expect(registerKill(1000).timer).toBe(TUNE.combo.windowMax);
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

describe('§4 M3 clearTimeBonus', () => {
  it('a faster clear scores higher than a slower one', () => {
    expect(clearTimeBonus(30, 5, 1)).toBeGreaterThan(clearTimeBonus(120, 5, 1));
  });
  it('clamps the speed bonus to 0 for a very slow clear', () => {
    const huge = TUNE.score.timeBonusBase / TUNE.score.timeBonusPerSec + 100;
    expect(clearTimeBonus(huge, 5, 1)).toBe(0); // 5 hits → no no-hit bonus either
  });
  it('adds the flat no-hit bonus only at hitsTaken === 0', () => {
    const withHit = clearTimeBonus(60, 1, 1);
    const flawless = clearTimeBonus(60, 0, 1);
    expect(flawless - withHit).toBe(TUNE.score.noHitBonus);
  });
  it('scales linearly with scoreMul', () => {
    expect(clearTimeBonus(60, 0, 2)).toBe(2 * clearTimeBonus(60, 0, 1));
  });
});

describe('hitstop', () => {
  it('scales with chain size and caps', () => {
    expect(hitstopFor(1)).toBeCloseTo(TUNE.juice.hitstopBase);
    expect(hitstopFor(100)).toBeCloseTo(TUNE.juice.hitstopMax);
    expect(hitstopFor(3)).toBeGreaterThan(hitstopFor(1));
  });
});
