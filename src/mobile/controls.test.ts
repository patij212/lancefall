import { describe, it, expect } from 'vitest';
import { resolveStick, classifyDash } from './controls';

describe('resolveStick', () => {
  it('is neutral inside the deadzone', () => {
    expect(resolveStick(0, 0, 3, 0, 8, 60)).toEqual({ x: 0, y: 0 });
  });
  it('is a unit-ish vector past full', () => {
    const v = resolveStick(0, 0, 120, 0, 8, 60); // way past full → clamped magnitude 1
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });
  it('scales linearly between dead and full', () => {
    const v = resolveStick(0, 0, 30, 0, 8, 60); // 30/60 = 0.5 magnitude
    expect(v.x).toBeCloseTo(0.5, 2);
  });
});

describe('classifyDash', () => {
  it('a short, still touch is a tap', () => {
    expect(classifyDash(80, 4, 160, 12)).toBe('tap');
  });
  it('a long hold that ended is a charged release', () => {
    expect(classifyDash(420, 30, 160, 12)).toBe('released');
  });
  it('a short but far-travelled touch is a release (it aimed), not a tap', () => {
    expect(classifyDash(90, 40, 160, 12)).toBe('released');
  });
});
