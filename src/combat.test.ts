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
  longestDayBonus,
  perfectThreadReady,
  perfectThreadScore,
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

describe('THE LONGEST DAY bonus (Sovereign victory)', () => {
  it('is at least the scaled base even on a slow, scrappy kill', () => {
    const slow = TUNE.score.timeBonusBase / TUNE.score.timeBonusPerSec + 100; // speed bonus floored to 0
    expect(longestDayBonus(slow, 9, 0, 1)).toBe(TUNE.victory.longestDayBase); // base only, ascension 0
  });
  it('rewards a faster, flawless kill more', () => {
    expect(longestDayBonus(30, 0, 0, 1)).toBeGreaterThan(longestDayBonus(120, 5, 0, 1));
  });
  it('the ASCEND multiplier lifts the payout (risk pays)', () => {
    const a0 = longestDayBonus(60, 0, 0, 1);
    const a4 = longestDayBonus(60, 0, 4, 1);
    expect(a4).toBeCloseTo(a0 * (1 + 4 * TUNE.victory.ascendScorePerLoop), 6);
  });
  it('scales with scoreMul and treats a negative ascension as 0', () => {
    expect(longestDayBonus(60, 0, 0, 2)).toBe(2 * longestDayBonus(60, 0, 0, 1));
    expect(longestDayBonus(60, 0, -3, 1)).toBe(longestDayBonus(60, 0, 0, 1));
  });
});

describe('hitstop', () => {
  it('scales with chain size and caps', () => {
    expect(hitstopFor(1)).toBeCloseTo(TUNE.juice.hitstopBase);
    expect(hitstopFor(100)).toBeCloseTo(TUNE.juice.hitstopMax);
    expect(hitstopFor(3)).toBeGreaterThan(hitstopFor(1));
  });
});

describe('PERFECT THREAD', () => {
  const T = TUNE.perfectThread.threshold;

  it('does not fire below the threshold', () => {
    for (let g = 0; g < T; g++) {
      expect(perfectThreadReady(g, false)).toBe(false);
    }
  });

  it('fires exactly at the threshold and stays armed only while not yet fired', () => {
    expect(perfectThreadReady(T, false)).toBe(true);
    // once the per-dash latch is set, it never re-fires no matter how many more grazes land
    expect(perfectThreadReady(T, true)).toBe(false);
    expect(perfectThreadReady(T + 5, true)).toBe(false);
  });

  it('rewards once across a single dash: counting up, latching, and resetting next dash', () => {
    // Mirror the game.ts graze() loop: a per-dash counter + a one-shot latch.
    let grazesThisDash = 0;
    let fired = false;
    let fireCount = 0;
    const graze = () => {
      grazesThisDash++;
      if (perfectThreadReady(grazesThisDash, fired)) {
        fired = true;
        fireCount++;
      }
    };
    // thread far past the threshold within one dash
    for (let i = 0; i < T + 4; i++) graze();
    expect(fireCount).toBe(1); // rewarded exactly ONCE this dash
    expect(grazesThisDash).toBe(T + 4);

    // a new dash re-arms the latch (player.ts dash-fire reset)
    grazesThisDash = 0;
    fired = false;
    for (let i = 0; i < T; i++) graze();
    expect(fireCount).toBe(2); // a second dash that threads the threshold rewards again
  });

  it('score scales with the live combo multiplier', () => {
    expect(perfectThreadScore(0)).toBe(TUNE.perfectThread.score);
    expect(perfectThreadScore(10)).toBe(TUNE.perfectThread.score * 2);
  });
});
