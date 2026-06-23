import { describe, it, expect } from 'vitest';
import { mobileViewZoom } from './viewport';

describe('mobileViewZoom', () => {
  it('does not zoom out when the screen is already tall enough', () => {
    expect(mobileViewZoom(640)).toBe(1);
    expect(mobileViewZoom(900)).toBe(1);
  });

  it('zooms OUT (z<1) on a short landscape phone, so more world is visible', () => {
    expect(mobileViewZoom(375)).toBeLessThan(1);
    expect(mobileViewZoom(375)).toBeCloseTo(375 / 640, 3);
    // world height becomes viewport / zoom → taller than the raw viewport
    expect(375 / mobileViewZoom(375)).toBeGreaterThan(375);
  });

  it('clamps the zoom-out on very short screens so entities stay readable', () => {
    expect(mobileViewZoom(200)).toBe(0.58);
  });

  it('degrades safely on bad input', () => {
    expect(mobileViewZoom(0)).toBe(1);
    expect(mobileViewZoom(-5)).toBe(1);
    expect(mobileViewZoom(NaN)).toBe(1);
  });
});
