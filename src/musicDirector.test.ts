import { describe, it, expect } from 'vitest';
import { decideMusic, sourceFor, type MusicDirectorState } from './musicDirector';

const arena = (intensity = 0, coherence = 0): MusicDirectorState => ({ intensity, coherence, boss: null });
const warden = (phase: number, hpFrac: number): MusicDirectorState => ({
  intensity: 1, coherence: 1, boss: { kind: 'warden', phase, subPhase: 0, hpFrac },
});

describe('music director — horizontal source selection', () => {
  it('rotates the arena through the distinct-track pool by run-progress (32-bar phases)', () => {
    expect(sourceFor(arena(), 0)).toBe('aurora_verse'); // phase 0
    expect(sourceFor(arena(), 31)).toBe('aurora_verse'); // still phase 0
    expect(sourceFor(arena(), 32)).toBe('aurora_build'); // phase 1
    expect(sourceFor(arena(), 64)).toBe('aurora_chorus'); // phase 2
    expect(sourceFor(arena(), 96)).toBe('aurora_drop'); // phase 3
    expect(sourceFor(arena(), 128)).toBe('aurora_verse'); // wraps
  });

  it('selects the WARDEN source from phase, then enrage at ≤34% HP', () => {
    expect(sourceFor(warden(0, 1), 0)).toBe('warden_spiral');
    expect(sourceFor(warden(1, 1), 0)).toBe('warden_fan');
    expect(sourceFor(warden(0, 0.3), 0)).toBe('warden_enraged');
    expect(sourceFor(warden(1, 0.34), 0)).toBe('warden_enraged'); // enrage overrides phase
  });

  it('routes a NON-warden boss to the WARDEN tension suite, never an arena chorus', () => {
    const boss = (kind: string, hpFrac: number): MusicDirectorState => ({
      intensity: 1, coherence: 1, boss: { kind, phase: 0, subPhase: 0, hpFrac },
    });
    // bar 16/52 would be aurora_chorus/aurora_drop in the arena — a happy bed under a boss. Not anymore.
    expect(sourceFor(boss('sovereign', 0.8), 16)).toBe('warden_spiral');
    expect(sourceFor(boss('hollow', 0.8), 52)).toBe('warden_spiral');
    expect(sourceFor(boss('mirrorblade', 0.2), 16)).toBe('warden_enraged'); // low HP → enraged
  });
});

describe('music director — vertical decision for a loop source', () => {
  it('keeps the authored loop at full gain and opens its cutoff with intensity/COHERENCE', () => {
    const lo = decideMusic(arena(0, 0), 0);
    const hi = decideMusic(arena(1, 1), 0);
    expect(lo.layerGains.main).toBe(1);
    expect(hi.layerGains.main).toBe(1);
    expect(hi.loopCutoff).toBeGreaterThan(lo.loopCutoff); // mix-modulation reads as intensity
  });

  it('emits a modest, COHERENCE-rising reactive (procedural punctuation) gain', () => {
    const lo = decideMusic(arena(1, 0), 0);
    const hi = decideMusic(arena(1, 1), 0);
    expect(hi.reactiveGain).toBeGreaterThan(lo.reactiveGain);
    expect(hi.reactiveGain).toBeLessThanOrEqual(0.8); // never overwhelms the bed
  });

  it('carries the selected source bpm/key', () => {
    expect(decideMusic(arena(), 0).bpm).toBe(107); // arena phase 0 = Magenta Metropolis (107 BPM)
    expect(decideMusic(arena(), 0).key).toBe('A minor');
    expect(decideMusic(warden(0, 1), 0).bpm).toBe(112); // WARDEN = Cyber Thriller (112 BPM)
  });
});
