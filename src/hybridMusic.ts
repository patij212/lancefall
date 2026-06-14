// src/hybridMusic.ts — the orchestration facade (Deep Dive B). Turns game/music state into a
// horizontal source choice + vertical mix, switching authored sources ONLY on bar downbeats and
// only when all their tracks are decoded; otherwise the procedural fallback keeps playing. When
// authored is live the procedural BED is suppressed (host.setAuthoredActive) and procedural is
// reactive-only; vertical intensity comes from loopCutoff (loop) / layer gains. It owns the
// active clock {bpm} and drives a host (the audio engine) to re-anchor its scheduler.
// All of this lives in the cosmetic/audio layer — it never touches the seeded sim (Deep Dive A).

import { sourceById, type MusicSourceManifest, type MusicTrackKey } from './audioManifest';
import { decideMusic, type BossMusicState, type MusicDirectorState } from './musicDirector';
import type { AudioAssetStatus } from './audioAssetManager';

const PROCEDURAL_BPM = 112; // MUSIC_BPM — the fallback clock

export interface HybridAssetSource {
  preloadCore(): Promise<void>;
  getTrack(sourceId: string, key: MusicTrackKey): AudioBuffer | null;
  getSfx(id: string): readonly AudioBuffer[];
  status(): AudioAssetStatus;
}

export interface HybridLayerPlayer {
  play(source: MusicSourceManifest, absoluteBar: number, at: number, gains: Partial<Record<MusicTrackKey, number>>): boolean;
  setGains(gains: Partial<Record<MusicTrackKey, number>>, at?: number): void;
  stop(at?: number): void;
  readonly activeScene: string | null;
}

export interface HybridSampleSfx {
  play(id: string, options?: { at?: number; pan?: number; gainMul?: number }): boolean;
  stopAll(): void;
  readonly activeVoices: number;
}

/** The audio-engine side HybridMusic drives: suppress/restore the procedural bed, set the
 *  reactive punctuation level + the loop's lowpass, and re-anchor the scheduler to a new clock. */
export interface ProceduralHost {
  setAuthoredActive(active: boolean, at?: number): void;
  setReactiveGain(gain: number, at?: number): void;
  setLoopCutoff(hz: number, at?: number): void;
  reanchor(bpm: number, at: number): void;
}

export interface HybridMusicDeps {
  assets: HybridAssetSource;
  layerPlayer: HybridLayerPlayer;
  sampleSfx: HybridSampleSfx;
  host: ProceduralHost;
}

export class HybridMusic {
  private readonly state: MusicDirectorState = { intensity: 0, coherence: 0, boss: null, musicVariant: 0 };
  private currentSourceId: string | null = null;
  private authoredActive = false;
  private bpm = PROCEDURAL_BPM;

  constructor(private readonly deps: HybridMusicDeps) {}

  get activeBpm(): number {
    return this.bpm;
  }

  setIntensity(value: number): void {
    this.state.intensity = value;
  }

  setCoherence(value: number): void {
    this.state.coherence = value;
  }

  /** Pick the arena track for this run (from the run seed) — one coherent track, not constant rotation. */
  setMusicVariant(value: number): void {
    this.state.musicVariant = value;
  }

  /** Update the boss music state and emit Warden edge samples (arrival/phase/fan) once per edge. */
  setBossState(kind: string | null, phase = 0, subPhase = 0, hpFrac = 1): void {
    const prev = this.state.boss;
    const next: BossMusicState | null = kind ? { kind, phase, subPhase, hpFrac } : null;
    if (next?.kind === 'warden') {
      if (prev?.kind !== 'warden') {
        this.deps.sampleSfx.play('warden_arrival');
      } else {
        const enrageEdge = prev.hpFrac > 0.34 && next.hpFrac <= 0.34;
        if (next.phase !== prev.phase || enrageEdge) this.deps.sampleSfx.play('warden_phase');
        if (next.phase === 1 && next.subPhase > prev.subPhase) this.deps.sampleSfx.play('warden_fan');
      }
    }
    this.state.boss = next;
  }

  /** Called per scheduled 16th. Acts only on bar downbeats: pick the source, switch it (if its
   *  tracks exist) re-anchoring the clock, and push the vertical mix. */
  tick(step: number, at: number): void {
    if (step % 16 !== 0) return;
    const bar = Math.floor(step / 16);
    const decision = decideMusic(this.state, bar);

    if (decision.sourceId !== this.currentSourceId) {
      const source = sourceById(decision.sourceId);
      if (source && this.deps.layerPlayer.play(source, bar, at, decision.layerGains)) {
        this.currentSourceId = decision.sourceId;
        this.authoredActive = true;
        this.bpm = decision.bpm;
        this.deps.host.setAuthoredActive(true, at);
        this.deps.host.reanchor(decision.bpm, at);
      }
      // else: keep the current scene; procedural fills any gap (never a broken run)
    } else {
      this.deps.layerPlayer.setGains(decision.layerGains, at);
    }

    if (this.authoredActive) {
      // co-schedule the duck/cutoff/reactive ramps with the bed's bar onset `at`, not wall-clock now
      this.deps.host.setLoopCutoff(decision.loopCutoff, at);
      this.deps.host.setReactiveGain(decision.reactiveGain, at);
    }
  }

  /** Stop all authored playback + voices and restore the procedural fallback clock. */
  stop(): void {
    this.deps.layerPlayer.stop();
    this.deps.sampleSfx.stopAll();
    this.currentSourceId = null;
    this.authoredActive = false;
    this.bpm = PROCEDURAL_BPM;
    this.deps.host.setAuthoredActive(false);
    this.deps.host.reanchor(PROCEDURAL_BPM, 0);
  }
}
