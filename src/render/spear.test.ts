import { describe, it, expect } from 'vitest';
import { spearLineColor } from './spear';
import { trailById } from '../trails';

describe('spearLineColor', () => {
  it('leaves the combo colour untouched for combo-tracking trails (default PULSE)', () => {
    const pulse = trailById('pulse'); // combo: true
    expect(pulse.combo).toBe(true);
    expect(spearLineColor('#22d3ee', pulse)).toBe('#22d3ee');
  });

  it('leans the spear line toward the trail colour for cosmetic (non-combo) trails', () => {
    const ember = trailById('ember'); // combo: false, base #fb7185
    const out = spearLineColor('#22d3ee', ember);
    // a blend, so it equals neither endpoint…
    expect(out).not.toBe('#22d3ee');
    expect(out).not.toBe(ember.base);
    // …and it is a valid rgb() string the canvas can use as strokeStyle
    expect(out).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });
});
