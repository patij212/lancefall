import { describe, it, expect } from 'vitest';
import { COHERENCE } from './tune';
import {
  newCoherence,
  resetCoherence,
  coherenceTarget,
  tickCoherence,
  coherenceBeatKick,
  coherenceBeatFlash,
  coherenceEdges,
  comboTier,
} from './coherence';

describe('coherence — the soul dial', () => {
  it('newCoherence is zero; resetCoherence returns to zero', () => {
    expect(newCoherence()).toEqual({ value: 0, target: 0, focusPulse: 0, tier: 0, beatFlash: 0, collapseDip: 0 });
    const c = { value: 0.5, target: 0.7, focusPulse: 0.3, tier: 4, beatFlash: 0.8, collapseDip: 0.6 };
    resetCoherence(c);
    expect(c).toEqual(newCoherence());
  });

  it('target floors when the chain is dead (regardless of combo)', () => {
    expect(coherenceTarget(0, 0, 0, 0)).toBe(COHERENCE.floor);
    expect(coherenceTarget(80, 0, 0, 0)).toBe(COHERENCE.floor);
  });

  it('target rises monotonically with combo (saturating, bounded ≤1)', () => {
    let prev = -1;
    for (let combo = 0; combo <= 200; combo += 5) {
      const t = coherenceTarget(combo, 1, 0, 0);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });

  it('a hot dash-chain lifts the target and caps at dashChainFull', () => {
    expect(coherenceTarget(10, 1, 5, 0)).toBeGreaterThan(coherenceTarget(10, 1, 0, 0));
    expect(coherenceTarget(10, 1, 99, 0)).toBe(coherenceTarget(10, 1, 5, 0));
  });

  it('LAST BREATH dims the target by lastBreathDim', () => {
    expect(coherenceTarget(40, 1, 0, 1)).toBeCloseTo(
      coherenceTarget(40, 1, 0, 0) * COHERENCE.lastBreathDim,
      10,
    );
  });

  it('target clamps to [0,1] for extreme/negative inputs', () => {
    const big = coherenceTarget(1e6, 1, 1e6, 0);
    expect(big).toBeLessThanOrEqual(1);
    expect(big).toBeGreaterThanOrEqual(0);
    expect(coherenceTarget(-5, 1, -5, 0)).toBeGreaterThanOrEqual(0);
  });

  it('eases toward target fast on the rise', () => {
    const c = newCoherence();
    c.target = 1;
    tickCoherence(c, 1 / 60);
    expect(c.value).toBeGreaterThan(0);
    expect(c.value).toBeLessThan(1);
    for (let i = 0; i < 59; i++) tickCoherence(c, 1 / 60); // ~1s total
    expect(c.value).toBeGreaterThan(0.95);
  });

  it('eases slower on the fall than on an equal-distance rise (asymmetric)', () => {
    const rise = { ...newCoherence(), value: 0.5, target: 1 };
    const fall = { ...newCoherence(), value: 0.5, target: 0 };
    tickCoherence(rise, 0.1);
    tickCoherence(fall, 0.1);
    const riseDelta = rise.value - 0.5;
    const fallDelta = 0.5 - fall.value;
    expect(fallDelta).toBeGreaterThan(0);
    expect(fallDelta).toBeLessThan(riseDelta);
  });

  it('is frame-rate independent (exponential smoothing composes exactly)', () => {
    const mk = () => {
      const c = newCoherence();
      c.target = 1;
      return c;
    };
    // one second of rise integrates to 1 - e^(-riseRate) regardless of step size,
    // across the whole 30–240 Hz range the game can actually run at.
    const a = mk();
    for (let i = 0; i < 30; i++) tickCoherence(a, 1 / 30);
    const b = mk();
    for (let i = 0; i < 240; i++) tickCoherence(b, 1 / 240);
    const d = mk();
    for (let i = 0; i < 60; i++) tickCoherence(d, 1 / 60);
    expect(Math.abs(a.value - b.value)).toBeLessThan(1e-6);
    expect(Math.abs(a.value - d.value)).toBeLessThan(1e-6);
  });

  it('beat kick: perfect > good and perfect lights focusPulse', () => {
    const cp = newCoherence();
    coherenceBeatKick(cp, true);
    expect(cp.value).toBeCloseTo(COHERENCE.perfectKick, 10);
    expect(cp.focusPulse).toBe(1);
    const cg = newCoherence();
    coherenceBeatKick(cg, false);
    expect(cg.value).toBeCloseTo(COHERENCE.onbeatKick, 10);
    expect(cp.value).toBeGreaterThan(cg.value);
  });

  it('good kick does not set focusPulse', () => {
    const c = newCoherence();
    coherenceBeatKick(c, false);
    expect(c.focusPulse).toBe(0);
  });

  it('focusPulse decays to exactly 0 and never goes negative', () => {
    const c = newCoherence();
    c.focusPulse = 1;
    const steps = Math.ceil(COHERENCE.focusPulseDecay / (1 / 60)) + 5;
    for (let i = 0; i < steps; i++) tickCoherence(c, 1 / 60);
    expect(c.focusPulse).toBe(0);
  });

  it('C2/C3: coherenceEdges fires once on the dial own-threshold crossings (edge, not level)', () => {
    const T = COHERENCE.collapseThreshold;
    const W = COHERENCE.windowThreshold;
    expect(coherenceEdges(T + 0.2, T - 0.01).collapsed).toBe(true); // crossed DOWN
    expect(coherenceEdges(T - 0.01, T - 0.02).collapsed).toBe(false); // already below — no refire
    expect(coherenceEdges(T + 0.2, T + 0.1).collapsed).toBe(false); // didn't cross
    expect(coherenceEdges(W - 0.1, W + 0.01).rose).toBe(true); // crossed UP
    expect(coherenceEdges(W + 0.1, W + 0.2).rose).toBe(false); // already above
    expect(coherenceEdges(W - 0.2, W - 0.1).rose).toBe(false); // didn't reach
  });

  it('C3: collapseDip decays to exactly 0 and never goes negative', () => {
    const c = newCoherence();
    c.collapseDip = 1;
    const steps = Math.ceil(COHERENCE.collapseDipDecay / (1 / 60)) + 5;
    for (let i = 0; i < steps; i++) tickCoherence(c, 1 / 60);
    expect(c.collapseDip).toBe(0);
  });

  it('C1: coherenceBeatFlash lights the ring (perfect=1, good=beatFlashGood) and decays to 0', () => {
    const cp = newCoherence();
    coherenceBeatFlash(cp, true);
    expect(cp.beatFlash).toBe(1);
    const cg = newCoherence();
    coherenceBeatFlash(cg, false);
    expect(cg.beatFlash).toBe(COHERENCE.beatFlashGood);
    // decays to exactly 0, never negative
    const steps = Math.ceil(COHERENCE.beatFlashDecay / (1 / 60)) + 5;
    for (let i = 0; i < steps; i++) tickCoherence(cp, 1 / 60);
    expect(cp.beatFlash).toBe(0);
  });

  it('kick clamps value at exactly 1', () => {
    const c = newCoherence();
    for (let i = 0; i < 50; i++) coherenceBeatKick(c, true);
    expect(c.value).toBe(1);
  });

  it('comboTier is monotone with the correct cut points', () => {
    let prev = -1;
    for (let combo = 0; combo <= 120; combo++) {
      const t = comboTier(combo);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(COHERENCE.tierCombo.length);
      prev = t;
    }
    expect(comboTier(9)).toBe(0);
    expect(comboTier(10)).toBe(1);
    expect(comboTier(100)).toBe(6);
  });

  it('comboTier matches every cut point (catches interior drift)', () => {
    expect([9, 10, 19, 20, 34, 35, 49, 50, 74, 75, 99, 100].map(comboTier)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
    ]);
  });

  it('only the beat kick lifts value above target (the ease never overshoots)', () => {
    const c = newCoherence();
    c.target = 0.3;
    for (let i = 0; i < 600; i++) tickCoherence(c, 1 / 60); // converge from below
    expect(c.value).toBeLessThanOrEqual(c.target + 1e-9);
    coherenceBeatKick(c, true);
    expect(c.value).toBeGreaterThan(c.target);
  });

  it('value + focusPulse stay in [0,1] across a scripted run', () => {
    const c = newCoherence();
    for (const tgt of [0.2, 0.9, 0.1, 1, 0]) {
      c.target = tgt;
      for (let i = 0; i < 20; i++) tickCoherence(c, 1 / 60);
      coherenceBeatKick(c, true);
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(1);
      expect(c.focusPulse).toBeGreaterThanOrEqual(0);
      expect(c.focusPulse).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: identical schedules give identical state', () => {
    const run = () => {
      const c = newCoherence();
      const sched: [number, number, boolean][] = [
        [0.5, 0.1, false],
        [1, 0.2, true],
        [0, 0.05, false],
      ];
      for (const [tgt, dt, perfect] of sched) {
        c.target = tgt;
        tickCoherence(c, dt);
        coherenceBeatKick(c, perfect);
      }
      return c;
    };
    expect(run()).toEqual(run());
  });
});
