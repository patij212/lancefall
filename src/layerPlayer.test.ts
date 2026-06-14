import { describe, it, expect } from 'vitest';
import {
  barSeconds,
  sourceDurationSeconds,
  sourceOffsetSeconds,
  nextBarTime,
  LayerPlayer,
} from './layerPlayer';
import { positionFromStep } from './musicTransport';
import type { MusicSourceManifest } from './audioManifest';

describe('layer player — pure scheduling math', () => {
  it('a 4-bar 4/4 source at 112 BPM is ~8.5714 s', () => {
    expect(sourceDurationSeconds(112, 4, 4)).toBeCloseTo(8.571428, 5);
    expect(barSeconds(112, 4)).toBeCloseTo(60 / 112 * 4, 9);
  });

  it('bar offset wraps within the loop', () => {
    const bs = barSeconds(112, 4);
    expect(sourceOffsetSeconds(0, 112, 4, 4)).toBe(0);
    expect(sourceOffsetSeconds(1, 112, 4, 4)).toBeCloseTo(bs, 9);
    expect(sourceOffsetSeconds(4, 112, 4, 4)).toBe(0); // wraps
    expect(sourceOffsetSeconds(5, 112, 4, 4)).toBeCloseTo(bs, 9); // 5 % 4 == 1
    expect(sourceOffsetSeconds(-1, 112, 4, 4)).toBeCloseTo(3 * bs, 9); // negative wraps cleanly
  });

  it('nextBarTime returns now on a downbeat, else the next bar', () => {
    const bs = barSeconds(112, 4);
    expect(nextBarTime(10, 0, bs)).toBe(10); // on a downbeat
    expect(nextBarTime(10, 2 * bs, bs)).toBe(10); // exact multiple of a bar
    expect(nextBarTime(10, bs * 0.25, bs)).toBeCloseTo(10 + bs * 0.75, 6);
  });

  // The mandated bar-phase-equality guard (Deep Dive B test (a)): HybridMusic switches an authored
  // source ONLY when step % 16 === 0, and the loop starts at sourceOffsetSeconds(bar). This proves
  // both transports are on a bar downbeat at the switch — so no musicStep re-anchor is needed (and
  // recomputing it would corrupt the procedural arrangement, which is keyed off the absolute step).
  it('a downbeat source switch keeps procedural and authored bar-phase equal', () => {
    const bpm = 114, bars = 8;
    for (const bar of [0, 1, 7, 8, 13, 64]) {
      const step = bar * 16; // the only steps where a switch is allowed
      expect(positionFromStep(step).sixteenthInBar).toBe(0); // procedural transport on a downbeat
      const offsetBars = sourceOffsetSeconds(bar, bpm, 4, bars) / barSeconds(bpm, 4);
      expect(offsetBars % 1).toBeCloseTo(0, 9); // authored loop offset is a whole number of bars
    }
  });
});

// minimal fake ctx (connect returns its destination, like a real AudioNode) — tracks disconnects
// + exposes the created buffer sources so the teardown/leak tests can fire onended.
interface FakeCtx extends BaseAudioContext {
  disconnects(): number;
  sources(): { onended: (() => void) | null }[];
}
function makeCtx(): FakeCtx {
  let disc = 0;
  const srcs: { onended: (() => void) | null }[] = [];
  const sink = () => ({ connect: (d: unknown) => d, disconnect() { disc++; }, gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime() {}, cancelScheduledValues() {} } });
  const ctx = {
    currentTime: 0,
    createGain: sink,
    createBufferSource: () => {
      const s = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect: (d: unknown) => d, start() {}, stop() {}, disconnect() { disc++; }, onended: null as (() => void) | null };
      srcs.push(s);
      return s;
    },
    disconnects: () => disc,
    sources: () => srcs,
  };
  return ctx as unknown as FakeCtx;
}

const loopSource = (id: string): MusicSourceManifest => ({
  id, suite: 'aurora', role: 'verse', bpm: 112, key: 'A minor', layering: 'loop', bars: 4,
  tracks: { main: { opus: `/m/${id}/main.ogg`, mp3: `/m/${id}/main.mp3` } },
  conformed: true, license: 'CC0', integratedLufs: -20, truePeakDbtp: -1,
});

const buf = () => ({ length: 1, numberOfChannels: 2 } as AudioBuffer);

describe('LayerPlayer — all-tracks-present gate', () => {
  it('refuses to start a source when a required track buffer is missing', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => null);
    expect(p.play(loopSource('aurora_verse'), 0, 0, { main: 1 })).toBe(false);
    expect(p.activeScene).toBeNull();
  });

  it('starts and reports the active scene when all tracks are present', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    expect(p.play(loopSource('aurora_verse'), 0, 0, { main: 1 })).toBe(true);
    expect(p.activeScene).toBe('aurora_verse');
  });
});

describe('LayerPlayer — setGains / stop', () => {
  it('setGains is a safe no-op when nothing is playing', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    expect(() => p.setGains({ main: 0.5 })).not.toThrow();
    expect(p.activeScene).toBeNull();
  });

  it('setGains keeps the active scene (ramps present tracks, ignores absent keys)', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    p.play(loopSource('aurora_verse'), 0, 0, { main: 1 });
    expect(() => p.setGains({ main: 0.4, lead: 0.9 })).not.toThrow();
    expect(p.activeScene).toBe('aurora_verse');
  });

  it('stop clears the active scene', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    p.play(loopSource('aurora_verse'), 0, 0, { main: 1 });
    expect(p.activeScene).toBe('aurora_verse');
    p.stop();
    expect(p.activeScene).toBeNull();
  });

  it('stop is a safe no-op when nothing is playing', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    expect(() => p.stop()).not.toThrow();
  });
});

describe('LayerPlayer — loopEnd tracks the decoded buffer (codec padding)', () => {
  const lastLoopEnd = (ctx: FakeCtx) => (ctx.sources().at(-1) as unknown as { loopEnd: number }).loopEnd;

  it('caps loopEnd at a SHORTER decoded duration so the loop never wraps into silence', () => {
    const ctx = makeCtx();
    const short = () => ({ length: 1, numberOfChannels: 2, duration: 1.0 } as AudioBuffer); // < ideal 8.57s
    const p = new LayerPlayer(ctx, ctx.destination, () => short());
    p.play(loopSource('a'), 0, 0, { main: 1 });
    expect(lastLoopEnd(ctx)).toBeLessThanOrEqual(1.0);
  });

  it('keeps loopEnd at the ideal bar length when the buffer is longer (trailing encoder padding)', () => {
    const ctx = makeCtx();
    const long = () => ({ length: 1, numberOfChannels: 2, duration: 999 } as AudioBuffer);
    const p = new LayerPlayer(ctx, ctx.destination, () => long());
    p.play(loopSource('a'), 0, 0, { main: 1 }); // 4 bars @112 ≈ 8.5714 s
    expect(lastLoopEnd(ctx)).toBeCloseTo(8.5714, 3);
  });
});

describe('LayerPlayer — node teardown (no leak)', () => {
  it('disconnects the crossfaded-out scene once its sources end', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    p.play(loopSource('a'), 0, 0, { main: 1 });
    const oldSources = [...ctx.sources()]; // scene A's source(s)
    const before = ctx.disconnects();
    p.play(loopSource('b'), 0, 1, { main: 1 }); // crossfade A → B
    // A's sources must carry an onended that tears the old graph down
    expect(oldSources.every((s) => typeof s.onended === 'function')).toBe(true);
    oldSources.forEach((s) => s.onended!());
    // src + per-track gain + scene master all disconnected (≥ 3 for a 1-track scene)
    expect(ctx.disconnects() - before).toBeGreaterThanOrEqual(3);
    expect(p.activeScene).toBe('b');
  });

  it('stop disconnects the active scene once its sources end', () => {
    const ctx = makeCtx();
    const p = new LayerPlayer(ctx, ctx.destination, () => buf());
    p.play(loopSource('a'), 0, 0, { main: 1 });
    const sources = [...ctx.sources()];
    const before = ctx.disconnects();
    p.stop();
    sources.forEach((s) => s.onended!());
    expect(ctx.disconnects() - before).toBeGreaterThanOrEqual(3);
    expect(p.activeScene).toBeNull();
  });
});
