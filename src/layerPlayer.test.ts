import { describe, it, expect } from 'vitest';
import {
  barSeconds,
  sourceDurationSeconds,
  sourceOffsetSeconds,
  nextBarTime,
  LayerPlayer,
} from './layerPlayer';
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
});

// minimal fake ctx (connect returns its destination, like a real AudioNode)
function makeCtx() {
  const sink = () => ({ connect: (d: unknown) => d, disconnect() {}, gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } });
  return {
    currentTime: 0,
    createGain: sink,
    createBufferSource: () => ({ buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect: (d: unknown) => d, start() {}, stop() {}, disconnect() {}, onended: null }),
  } as unknown as BaseAudioContext;
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
