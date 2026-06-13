import { describe, it, expect } from 'vitest';
import { SampleSfxDirector, chooseVoiceToCull, type ActiveSampleVoice } from './sampleSfx';
import type { SfxManifest } from './audioManifest';

const voice = (priority: 1 | 2 | 3): ActiveSampleVoice => ({ id: 'x', priority, stop: () => {} });

describe('chooseVoiceToCull', () => {
  it('culls the lowest-priority voice strictly below the incoming priority', () => {
    expect(chooseVoiceToCull([voice(2), voice(1), voice(3)], 3)).toBe(1); // the priority-1
    expect(chooseVoiceToCull([voice(3), voice(3)], 1)).toBe(-1); // nothing below pri-1
    expect(chooseVoiceToCull([], 2)).toBe(-1);
  });
});

// minimal Web Audio fake that records created sources (so we can assert variant choice).
// connect() returns its destination, matching the real AudioNode chaining contract.
function makeCtx() {
  const sources: { buffer: AudioBuffer | null; onended: null | (() => void) }[] = [];
  let disc = 0;
  const sink = () => ({ connect: (d: unknown) => d, disconnect() { disc++; }, gain: { value: 0, setValueAtTime() {} }, pan: { value: 0, setValueAtTime() {} } });
  const ctx = {
    currentTime: 0,
    destination: sink(),
    createBufferSource() {
      const s = { buffer: null as AudioBuffer | null, connect: (d: unknown) => d, start() {}, stop() {}, disconnect() { disc++; }, onended: null as null | (() => void) };
      sources.push(s);
      return s;
    },
    createGain: sink,
    createStereoPanner: sink,
  } as unknown as BaseAudioContext;
  return { ctx, sources, disconnects: () => disc };
}

const buf = (tag: string) => ({ tag } as unknown as AudioBuffer);

const MANIFESTS: SfxManifest[] = [
  { id: 'low', gain: 0.5, priority: 1, maxVoices: 5, variants: [] },
  { id: 'hi', gain: 0.7, priority: 3, maxVoices: 1, variants: [] },
  { id: 'cap2', gain: 0.5, priority: 2, maxVoices: 2, variants: [] },
];

describe('SampleSfxDirector', () => {
  it('enforces a per-ID voice cap by culling the oldest of that id', () => {
    const { ctx } = makeCtx();
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [buf('a'), buf('b')], () => 0, 24);
    d.play('cap2'); d.play('cap2'); d.play('cap2'); // maxVoices 2
    expect(d.activeVoices).toBe(2);
  });

  it('lets a higher-priority cue displace a lower one at the global cap, and drops when none is lower', () => {
    const { ctx } = makeCtx();
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [buf('a')], () => 0, 2); // global cap 2
    expect(d.play('low')).toBe(true);
    expect(d.play('low')).toBe(true);
    expect(d.play('hi')).toBe(true); // pri-3 displaces a pri-1
    expect(d.activeVoices).toBe(2);
    expect(d.play('low')).toBe(false); // full of {hi:3, low:1}; nothing strictly below pri-1
    expect(d.activeVoices).toBe(2);
  });

  it('selects a variant via the injected RNG (never world rng)', () => {
    const { ctx, sources } = makeCtx();
    const a = buf('a'), b = buf('b');
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [a, b], () => 0.99, 24);
    expect(d.play('low')).toBe(true);
    expect(sources.at(-1)!.buffer).toBe(b); // 0.99 → index 1
  });

  it('returns false with no side effects when the buffer is unavailable', () => {
    const { ctx, sources } = makeCtx();
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [], () => 0, 24);
    expect(d.play('low')).toBe(false);
    expect(d.activeVoices).toBe(0);
    expect(sources.length).toBe(0);
  });

  it('disconnects the whole src→gain→pan chain on cull (no orphaned gain/pan nodes)', () => {
    const { ctx, disconnects } = makeCtx();
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [buf('a')], () => 0, 24);
    d.play('cap2', { pan: 0.5 });
    d.play('cap2', { pan: -0.5 });
    const before = disconnects();
    d.play('cap2', { pan: 0 }); // 3rd over maxVoices 2 → culls the oldest synchronously
    expect(disconnects() - before).toBeGreaterThanOrEqual(2); // culled src + gain (+ pan)
  });

  it('disconnects gain/pan when a voice ends naturally (onended)', () => {
    const { ctx, sources, disconnects } = makeCtx();
    const d = new SampleSfxDirector(ctx, ctx.destination, MANIFESTS, () => [buf('a')], () => 0, 24);
    d.play('low', { pan: 0.4 });
    const before = disconnects();
    sources.at(-1)!.onended!(); // the source ends
    expect(disconnects() - before).toBeGreaterThanOrEqual(2); // gain + pan torn down, not just src
  });
});
