import { describe, it, expect } from 'vitest';
import { weaverGapIndices, weaverSecondGapStart } from './weaver';

describe('weaver gap indices', () => {
  const n = 26, gapWidth = 3;
  it('omits exactly one contiguous gap when not enraged', () => {
    const g = weaverGapIndices(5, n, gapWidth, false, 18);
    expect(g).toEqual([5, 6, 7]);
  });
  it('omits TWO gaps when enraged (a second lane, no rng)', () => {
    const g = weaverGapIndices(5, n, gapWidth, true, 18);
    expect(g).toEqual([5, 6, 7, 18, 19, 20]);
  });
  it('wraps indices past n', () => {
    const g = weaverGapIndices(25, n, gapWidth, false, 0);
    expect(g).toEqual([0, 1, 25]); // 25,26%26=0,27%26=1
  });
});

describe('weaver second gap drift', () => {
  const n = 26, gapWidth = 3, step = 1;
  it('starts ~half a ring from the first gap (ring 0)', () => {
    expect(weaverSecondGapStart(0, n, gapWidth, 0, step)).toBe(13); // floor(26/2)
  });
  it('drifts toward the first gap as rings advance', () => {
    expect(weaverSecondGapStart(0, n, gapWidth, 3, step)).toBe(10); // 13 - 3
  });
  it('clamps so the two lanes never merge (keeps a wall between them)', () => {
    const far = weaverSecondGapStart(0, n, gapWidth, 999, step);
    const maxDrift = Math.floor(n / 2) - gapWidth - 1; // 9
    expect(far).toBe(Math.floor(n / 2) - maxDrift); // 13 - 9 = 4
  });
});
