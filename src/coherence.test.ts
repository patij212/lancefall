import { describe, it, expect } from 'vitest';
import { COHERENCE } from './tune';
import {
  newCoherence,
  resetCoherence,
  coherenceTarget,
  tickCoherence,
  coherenceBeatKick,
  comboTier,
} from './coherence';

describe('coherence — the soul dial', () => {
  it('newCoherence is zero; resetCoherence returns to zero', () => {
    expect(newCoherence()).toEqual({ value: 0, target: 0, focusPulse: 0, tier: 0 });
    const c = { value: 0.5, target: 0.7, focusPulse: 0.3, tier: 4 };
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

  it('is frame-rate stable (integrated 60Hz ≈ 120Hz over 1s)', () => {
    const a = newCoherence();
    a.target = 1;
    const b = newCoherence();
    b.target = 1;
    for (let i = 0; i < 60; i++) tickCoherence(a, 1 / 60);
    for (let i = 0; i < 120; i++) tickCoherence(b, 1 / 120);
    expect(Math.abs(a.value - b.value)).toBeLessThan(2e-3);
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
