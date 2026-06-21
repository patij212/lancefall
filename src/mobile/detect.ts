// Mobile/touch detection + the single isolation switch. Desktop NEVER enters the mobile
// path: isMobile() is false on any device whose PRIMARY pointer is fine / hover-capable
// (mouse, trackpad, touch-laptop), so no mobile element can ever mount on desktop. A
// touch-laptop player can still opt in via inputMode:'touch'.

export type InputMode = 'auto' | 'touch' | 'desktop';

export interface PointerProbe {
  coarse: boolean;
  noHover: boolean;
  touch: boolean;
}

function mm(q: string): boolean {
  try {
    return window.matchMedia(q).matches;
  } catch {
    return false;
  }
}

/** Read the live device pointer characteristics. Separated from isMobile() so tests can
 *  inject a probe without stubbing matchMedia. */
export function probePointer(): PointerProbe {
  return {
    coarse: mm('(pointer: coarse)'),
    noHover: mm('(hover: none)'),
    touch: typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0,
  };
}

/** Should this device get the touch UI? `auto` derives from the primary pointer; the two
 *  Force modes are explicit overrides for edge cases and tests. */
export function isMobile(mode: InputMode, probe: PointerProbe = probePointer()): boolean {
  if (mode === 'touch') return true;
  if (mode === 'desktop') return false;
  return probe.coarse && probe.noHover && probe.touch;
}

/** Toggle the one class every mobile CSS rule is scoped under — mirrors the existing
 *  reduce-motion toggle in game.ts applySettings. Safe to call any time. */
export function applyMobileClass(active: boolean): void {
  try {
    document.documentElement.classList.toggle('lf-mobile', active);
  } catch {
    /* no DOM (non-browser test env) */
  }
}
