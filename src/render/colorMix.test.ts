import { describe, it, expect } from 'vitest';
import { hexRgb, mix, mixHex } from './colorMix';

describe('colorMix', () => {
  it('hexRgb parses 6- and 3-digit hex', () => {
    expect(hexRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('mix blends to an rgb() string at the endpoints', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('rgb(0,0,0)');
    expect(mix('#000000', '#ffffff', 1)).toBe('rgb(255,255,255)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
  });

  it('mixHex returns a #rrggbb hex (re-feedable into hexRgb/mix)', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    // result must parse back cleanly — this is the whole reason mixHex exists
    const blended = mixHex('#22d3ee', '#fb923c', 0.4);
    expect(blended).toMatch(/^#[0-9a-f]{6}$/);
    expect(() => hexRgb(blended)).not.toThrow();
    expect(() => mix(blended, '#ffffff', 0.5)).not.toThrow();
  });

  it('mixHex pads single-digit channels and clamps', () => {
    // low channel → needs zero-padding (e.g. 0x05 → "05")
    expect(mixHex('#000000', '#0a0a0a', 0.5)).toBe('#050505');
  });
});
