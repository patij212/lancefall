// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { isMobile, applyMobileClass, type PointerProbe } from './detect';

const desktop: PointerProbe = { coarse: false, noHover: false, touch: false };
const phone: PointerProbe = { coarse: true, noHover: true, touch: true };

describe('desktop isolation', () => {
  beforeEach(() => applyMobileClass(false));

  it('a desktop probe never resolves to mobile', () => {
    expect(isMobile('auto', desktop)).toBe(false);
  });

  it('applying the class for a desktop result leaves the DOM clean', () => {
    applyMobileClass(isMobile('auto', desktop));
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(false);
  });

  it('a phone probe does set the class (positive control)', () => {
    applyMobileClass(isMobile('auto', phone));
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(true);
  });
});
