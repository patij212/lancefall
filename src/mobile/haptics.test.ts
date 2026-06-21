// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { haptics, setHapticsEnabled } from './haptics';

describe('haptics', () => {
  let calls: Array<number | number[]>;
  beforeEach(() => {
    calls = [];
    (navigator as unknown as { vibrate: (p: number | number[]) => boolean }).vibrate = (p) => {
      calls.push(p);
      return true;
    };
    setHapticsEnabled(true);
  });

  it('fires the dash tick when enabled', () => {
    haptics.dash();
    expect(calls).toEqual([10]);
  });

  it('no-ops when disabled', () => {
    setHapticsEnabled(false);
    haptics.hit();
    haptics.parry();
    expect(calls).toEqual([]);
  });

  it('parry uses a multi-pulse pattern', () => {
    haptics.parry();
    expect(calls[0]).toEqual([14, 20, 14]);
  });

  it('never throws when navigator.vibrate is absent', () => {
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    setHapticsEnabled(true);
    expect(() => haptics.hit()).not.toThrow();
  });
});
