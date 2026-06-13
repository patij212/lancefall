// src/sampleSfx.ts — priority + voice-limited authored SFX playback. Layered OVER the
// existing synthesized transients (a missing sample never suppresses the synth). Variant
// choice uses an INJECTED rng (a local mulberry32 at the call site) so it can never touch
// or perturb the seeded world rng — Daily stays deterministic.

import type { SfxManifest } from './audioManifest';

export interface SampleSfxPlayOptions {
  at?: number;
  pan?: number; // -1..1
  gainMul?: number;
}

export interface ActiveSampleVoice {
  id: string;
  priority: 1 | 2 | 3;
  stop: () => void;
}

/** Index of the lowest-priority active voice STRICTLY below `incomingPriority`, or -1 if
 *  none can be culled (so a higher- or equal-priority field is never thinned for a newcomer). */
export function chooseVoiceToCull(active: readonly ActiveSampleVoice[], incomingPriority: number): number {
  let pick = -1;
  let lowest = incomingPriority;
  for (let i = 0; i < active.length; i++) {
    if (active[i].priority < lowest) {
      lowest = active[i].priority;
      pick = i;
    }
  }
  return pick;
}

interface LiveVoice extends ActiveSampleVoice {
  node: AudioBufferSourceNode;
}

export class SampleSfxDirector {
  private active: LiveVoice[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    private readonly manifests: readonly SfxManifest[],
    private readonly buffersFor: (id: string) => readonly AudioBuffer[],
    private readonly random: () => number,
    private readonly maxVoices = 24,
  ) {}

  get activeVoices(): number {
    return this.active.length;
  }

  play(id: string, options: SampleSfxPlayOptions = {}): boolean {
    const def = this.manifests.find((m) => m.id === id);
    if (!def) return false;
    const buffers = this.buffersFor(id);
    if (!buffers.length) return false;

    // per-ID cap: make room by culling the OLDEST voice of this id
    if (this.active.filter((v) => v.id === id).length >= def.maxVoices) {
      const oldest = this.active.findIndex((v) => v.id === id);
      if (oldest >= 0) this.cull(oldest);
    }
    // global cap: displace a strictly-lower-priority voice, or drop
    if (this.active.length >= this.maxVoices) {
      const idx = chooseVoiceToCull(this.active, def.priority);
      if (idx < 0) return false;
      this.cull(idx);
    }

    const at = options.at ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffers[Math.floor(this.random() * buffers.length)];
    const gain = this.ctx.createGain();
    gain.gain.value = def.gain * (options.gainMul ?? 1);
    if (options.pan !== undefined) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = options.pan;
      src.connect(gain).connect(pan).connect(this.destination);
    } else {
      src.connect(gain).connect(this.destination);
    }

    const voice: LiveVoice = {
      id,
      priority: def.priority,
      node: src,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    src.onended = () => this.remove(voice);
    src.start(at);
    this.active.push(voice);
    return true;
  }

  stopAll(): void {
    for (const v of this.active) v.stop();
    this.active.length = 0;
  }

  private cull(index: number): void {
    const v = this.active[index];
    if (!v) return;
    v.stop();
    this.active.splice(index, 1);
  }

  private remove(voice: LiveVoice): void {
    const i = this.active.indexOf(voice);
    if (i >= 0) this.active.splice(i, 1);
    try {
      voice.node.disconnect();
    } catch {
      /* node already gone */
    }
  }
}
