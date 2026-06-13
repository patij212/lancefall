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
    // loop at the ideal bar length, but never PAST the decoded buffer: lossy codecs (Opus pre-skip /
    // MP3 padding) make the real buffer a few ms off ideal, and looping beyond it wraps into silence.
    const idealLoopEnd = sourceDurationSeconds(source.bpm, BEATS_PER_BAR, bars);
    const durs = buffers.map(([, b]) => b!.duration).filter((d): d is number => typeof d === 'number' && d > 0);
    const loopEnd = durs.length ? Math.min(idealLoopEnd, ...durs) : idealLoopEnd;

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
      this.teardown(old, at + CROSSFADE_S + 0.05);
    }
    this.current = { id: source.id, master, tracks };
    return true;
  }

  /** Stop a scene's sources at `stopAt` and disconnect its whole node graph once they end —
   *  otherwise every source switch orphans master+gains+sources (GC-reachable via `destination`). */
  private teardown(scene: ActiveScene, stopAt: number): void {
    const nodes = [...scene.tracks.values()];
    if (!nodes.length) {
      scene.master.disconnect();
      return;
    }
    let pending = nodes.length;
    for (const { src, gain } of nodes) {
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
        if (--pending === 0) scene.master.disconnect();
      };
      try {
        src.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Smoothly ramp the present tracks of the active scene toward `gains` (for `layers`/`stems`
   *  vertical fades; `loop` rides at 1). Keys with no live track are ignored. No-op if idle. */
  setGains(gains: Partial<Record<MusicTrackKey, number>>, at?: number): void {
    if (!this.current) return;
    const t = at ?? this.ctx.currentTime;
    for (const [k, v] of Object.entries(gains) as [MusicTrackKey, number][]) {
      const tr = this.current.tracks.get(k);
      if (tr) tr.gain.gain.setTargetAtTime(v, t, 0.08);
    }
  }

  /** Fade the active scene out, stop its sources, and disconnect its graph; clears `activeScene`.
   *  No-op if idle. */
  stop(at?: number): void {
    const scene = this.current;
    if (!scene) return;
    this.current = null;
    const t = at ?? this.ctx.currentTime;
    scene.master.gain.cancelScheduledValues(t);
    scene.master.gain.setValueAtTime(1, t);
    scene.master.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
    this.teardown(scene, t + CROSSFADE_S + 0.05);
  }
}
