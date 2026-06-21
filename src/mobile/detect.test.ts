// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { isMobile, applyMobileClass, type PointerProbe } from './detect';

const phone: PointerProbe = { coarse: true, noHover: true, touch: true };
const laptop: PointerProbe = { coarse: false, noHover: false, touch: true }; // touch-laptop
const desktop: PointerProbe = { coarse: false, noHover: false, touch: false };

describe('isMobile', () => {
  it('auto: a phone (coarse + no-hover + touch) is mobile', () => {
    expect(isMobile('auto', phone)).toBe(true);
  });
  it('auto: a touch-laptop (fine pointer / hover) is NOT mobile', () => {
    expect(isMobile('auto', laptop)).toBe(false);
  });
  it('auto: a plain desktop is NOT mobile', () => {
    expect(isMobile('auto', desktop)).toBe(false);
  });
  it('force touch overrides any probe', () => {
    expect(isMobile('touch', desktop)).toBe(true);
  });
  it('force desktop overrides any probe', () => {
    expect(isMobile('desktop', phone)).toBe(false);
  });
});

describe('applyMobileClass', () => {
  it('toggles the html.lf-mobile class', () => {
    applyMobileClass(true);
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(true);
    applyMobileClass(false);
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(false);
  });
});
