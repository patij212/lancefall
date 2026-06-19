import { describe, it, expect } from 'vitest';
import { openHollowWindow, openHollowWindowWithBeat, hollowSyncActive } from './hollow';
import { HOLLOW } from '../tune';
import type { Enemy } from '../types';

const mk = (over: Partial<Enemy>): Enemy => ({ kind: 'hollow', phase: 0, timer: 99, telegraph: 0, ...over } as Enemy);

describe('hollow window', () => {
  it('hollowSyncActive is the phase-2 (damageable) window', () => {
    expect(hollowSyncActive(mk({ phase: 2 }))).toBe(true);
    expect(hollowSyncActive(mk({ phase: 0 }))).toBe(false);
    expect(hollowSyncActive(mk({ kind: 'beacon', phase: 2 }))).toBe(false);
  });

  it('openHollowWindow earns the window NOW from any phase (the echo-hunt reward)', () => {
    for (const phase of [0, 1, 2]) {
      const e = mk({ phase, timer: 99 });
      openHollowWindow(e);
      expect(e.phase).toBe(2);
      expect(e.timer).toBe(HOLLOW.echoSyncWindow);
      expect(hollowSyncActive(e)).toBe(true);
    }
  });

  it('ignores a non-hollow boss (echo kill near another boss is a no-op)', () => {
    const e = mk({ kind: 'sovereign', phase: 0, timer: 5 });
    openHollowWindow(e);
    expect(e.phase).toBe(0);
    expect(e.timer).toBe(5);
  });

  it('on-beat echo-kill opens a LONGER window than off-beat (the beat teeth)', () => {
    const onB = mk({ phase: 0 });
    openHollowWindowWithBeat(onB, true);
    expect(onB.timer).toBe(HOLLOW.echoSyncWindowOnBeat);
    const offB = mk({ phase: 0 });
    openHollowWindowWithBeat(offB, false);
    expect(offB.timer).toBe(HOLLOW.echoSyncWindow);
    expect(HOLLOW.echoSyncWindowOnBeat).toBeGreaterThan(HOLLOW.echoSyncWindow);
  });
});
