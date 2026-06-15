import { describe, it, expect } from 'vitest';
import { decideMusic, sourceFor, type MusicDirectorState } from './musicDirector';
import { MUSIC_MIX } from './tune';

const arena = (intensity = 0, coherence = 0): MusicDirectorState => ({ intensity, coherence, boss: null });
const warden = (phase: number, hpFrac: number): MusicDirectorState => ({
  intensity: 1, coherence: 1, boss: { kind: 'warden', phase, subPhase: 0, hpFrac },
});

describe('music director — horizontal source selection', () => {
  it('settles on ONE arena track (from musicVariant), trading off at a loop boundary every 128 bars', () => {
    const run = (variant: number): MusicDirectorState => ({ intensity: 0, coherence: 0, boss: null, musicVariant: variant });
    // a run holds ITS track for the whole ~5-min trade window (128 bars = 4 of the 32-bar loops)
    expect(sourceFor(run(0), 0)).toBe('aurora_verse');
    expect(sourceFor(run(0), 50)).toBe('aurora_verse');
    expect(sourceFor(run(0), 127)).toBe('aurora_verse'); // still — just before the boundary
    // then gently trades off to the next track at the loop boundary
    expect(sourceFor(run(0), 128)).toBe('aurora_build');
    expect(sourceFor(run(0), 256)).toBe('aurora_chorus');
    // different runs start on different tracks (variety across runs); raw seeds wrap via % pool
    expect(sourceFor(run(1), 0)).toBe('aurora_build');
    expect(sourceFor(run(2), 0)).toBe('aurora_chorus');
    expect(sourceFor(run(3), 0)).toBe('aurora_drop');
    expect(sourceFor(run(4), 0)).toBe('aurora_verse'); // wraps
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

  it('keeps a generous mix FLOOR so a struggling (low-coherence) player still hears a full mix', () => {
    // the worst case: no intensity, no coherence — a player getting wrecked. The mix must
    // stay PRESENT (dark, not silent-adjacent): the loop cutoff and reactive floor are lifted.
    const floor = decideMusic(arena(0, 0), 0);
    expect(floor.loopCutoff).toBe(MUSIC_MIX.loopCutoffFloor);
    expect(floor.loopCutoff).toBeGreaterThanOrEqual(1500); // lifted from the old 800 Hz mud
    expect(floor.reactiveGain).toBe(MUSIC_MIX.reactiveGainFloor);
    expect(floor.reactiveGain).toBeGreaterThanOrEqual(0.34); // lifted from the old 0.25
    // and the ceiling still resolves to the fully-open cutoff at coherence/intensity 1
    expect(decideMusic(arena(1, 1), 0).loopCutoff).toBe(MUSIC_MIX.loopCutoffCeil);
  });

  it('carries the selected source bpm/key', () => {
    expect(decideMusic(arena(), 0).bpm).toBe(107); // arena phase 0 = Magenta Metropolis (107 BPM)
    expect(decideMusic(arena(), 0).key).toBe('A minor');
    expect(decideMusic(warden(0, 1), 0).bpm).toBe(112); // WARDEN = Cyber Thriller (112 BPM)
  });
});
