import { describe, it, expect } from 'vitest';
import { boardEligible } from './withhold';

describe('boardEligible', () => {
  it('a normal ranked run submits', () => {
    expect(boardEligible(true, false, false, false)).toBe(true);
  });
  it('strong-assist withholds even a ranked run', () => {
    expect(boardEligible(true, false, false, true)).toBe(false);
  });
  it('challenge/duel never submits', () => {
    expect(boardEligible(true, true, false, false)).toBe(false);
  });
  it('cipher-off boss rush never submits', () => {
    expect(boardEligible(true, false, true, false)).toBe(false);
  });
  it('an unranked mode never submits', () => {
    expect(boardEligible(false, false, false, false)).toBe(false);
  });
});
