// src/layerPlayer.ts — aligned N-track authored playback (N=1 loop / 2–3 layers / 6 stems).
// Pure scheduling math (bar offsets, durations) is split out and unit-tested; the class wraps
// looping AudioBufferSourceNodes with an equal-time crossfade between sources. It refuses to
// start a source unless ALL its tracks are decoded, so a half-loaded scene never stutters.

import { tracksForLayering, type MusicSourceManifest, type MusicTrackKey } from './audioManifest';

const BEATS_PER_BAR = 4;
const CROSSFADE_S = 0.25;

export function barSeconds(bpm: number, beatsPerBar: number): number {
  return (60 / bpm) * beatsPerBar;
}

export function sourceDurationSeconds(bpm: number, beatsPerBar: number, bars: number): number {
  return barSeconds(bpm, beatsPerBar) * bars;
}

/** Seconds into the loop for an absolute bar index (wraps cleanly, incl. negatives). */
export function sourceOffsetSeconds(absoluteBar: number, bpm: number, beatsPerBar: number, bars: number): number {
  const wrapped = ((Math.floor(absoluteBar) % bars) + bars) % bars;
  return wrapped * barSeconds(bpm, beatsPerBar);
}

/** `now` if `musicTime` is on a bar downbeat, else the time of the next bar. */
export function nextBarTime(now: number, musicTime: number, barSecondsVal: number): number {
  const rem = ((musicTime % barSecondsVal) + barSecondsVal) % barSecondsVal;
  return rem < 1e-6 ? now : now + (barSecondsVal - rem);
}

interface ActiveScene {
  id: string;
  master: GainNode;
  tracks: Map<MusicTrackKey, { src: AudioBufferSourceNode; gain: GainNode }>;
}

export class LayerPlayer {
  private current: ActiveScene | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    private readonly bufferFor: (sourceId: string, key: MusicTrackKey) => AudioBuffer | null,
  ) {}

  get activeScene(): string | null {
    return this.current?.id ?? null;
  }

  /** Start `source` bar-aligned at time `at`, crossfading from any current scene. Returns false
   *  (no-op) unless every track this source's layering requires is decoded. */
  play(source: MusicSourceManifest, absoluteBar: number, at: number, gains: Partial<Record<MusicTrackKey, number>>): boolean {
    const keys = tracksForLayering(source.layering);
    const buffers = keys.map((k) => [k, this.bufferFor(source.id, k)] as const);
    if (buffers.some(([, b]) => b === null)) return false;

    const bars = source.bars ?? 4;
    const offset = sourceOffsetSeconds(absoluteBar, source.bpm, BEATS_PER_BAR, bars);
    const loopEnd = sourceDurationSeconds(source.bpm, BEATS_PER_BAR, bars);

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0, at);
    master.gain.linearRampToValueAtTime(1, at + CROSSFADE_S);
    master.connect(this.destination);

    const tracks = new Map<MusicTrackKey, { src: AudioBufferSourceNode; gain: GainNode }>();
    for (const [k, b] of buffers) {
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = loopEnd;
      const gain = this.ctx.createGain();
      gain.gain.value = gains[k] ?? 1;
      src.connect(gain).connect(master);
      src.start(at, offset);
      tracks.set(k, { src, gain });
    }

    const old = this.current;
    if (old) {
      old.master.gain.cancelScheduledValues(at);
      old.master.gain.setValueAtTime(1, at);
      old.master.gain.linearRampToValueAtTime(0, at + CROSSFADE_S);
      const stopAt = at + CROSSFADE_S + 0.05;
      for (const { src } of old.tracks.values()) {
        try {
          src.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
    }
    this.current = { id: source.id, master, tracks };
    return true;
  }
}
