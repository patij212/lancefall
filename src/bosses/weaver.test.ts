import { describe, it, expect } from 'vitest';
import { weaverGapIndices, weaverSecondGapStart, weaverGapWidth } from './weaver';
import { WEAVER } from '../tune';

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

describe('weaver gap width (enraged thread test)', () => {
  it('stays full ringGap when not enraged, every ring', () => {
    expect(weaverGapWidth(0, false)).toBe(WEAVER.ringGap);
    expect(weaverGapWidth(99, false)).toBe(WEAVER.ringGap);
  });
  it('opens at full width on ring 0 even when enraged', () => {
    expect(weaverGapWidth(0, true)).toBe(WEAVER.ringGap);
  });
  it('narrows over successive enraged rings', () => {
    expect(weaverGapWidth(WEAVER.gapShrinkRings, true)).toBe(WEAVER.gapShrinkMin);
    // monotonic non-increasing across rings
    let prev = weaverGapWidth(0, true);
    for (let r = 1; r <= WEAVER.gapShrinkRings + 2; r++) {
      const w = weaverGapWidth(r, true);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });
  it('clamps to gapShrinkMin (never zero/negative)', () => {
    expect(weaverGapWidth(9999, true)).toBe(WEAVER.gapShrinkMin);
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
