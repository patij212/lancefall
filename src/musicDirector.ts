// src/musicDirector.ts — PURE music decisions (no ctx/DOM/rng). Converts game/music state
// into (a) a horizontal source choice and (b) the vertical mix: authored layer gains, a loop
// mix-modulation cutoff, the procedural REACTIVE punctuation level, and the source bpm/key.
// Reactive ≠ a procedural bed (Deep Dive B): authored carries the bed, procedural punctuates.

import { sourceById, type MusicLayering, type MusicTrackKey } from './audioManifest';

// The arena rotates through these 4 distinct energetic tracks, one per ROTATE_BARS-bar phase —
// variety across a run, coherence within a phase, and the switch lands on a bar downbeat.
const ARENA_POOL = ['aurora_verse', 'aurora_build', 'aurora_chorus', 'aurora_drop'] as const;
const ARENA_ROTATE_BARS = 24; // = one full 24-bar loop per phase (clean switch at the loop boundary)

export interface BossMusicState {
  kind: string;
  phase: number;
  subPhase: number;
  hpFrac: number;
}

export interface MusicDirectorState {
  intensity: number; // 0..1
  coherence: number; // 0..1
  boss: BossMusicState | null;
}

export interface MusicDecision {
  sourceId: string;
  layerGains: Partial<Record<MusicTrackKey, number>>;
  loopCutoff: number; // Hz — opens the single loop's lowpass with intensity (vertical layering for `loop`)
  reactiveGain: number; // procedural reactive punctuation level (NOT a bed)
  bpm: number;
  key: string;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Horizontal resequencing: which source plays. Boss overrides the arena song-spine. */
export function sourceFor(state: MusicDirectorState, absoluteBar: number): string {
  if (state.boss) {
    // WARDEN is the only authored boss suite. WARDEN gets its full phase progression; every OTHER
    // boss borrows the tension suite (enraged ≤34% HP, else spiral) so a happy arena chorus/drop
    // never plays under a boss fight (the procedural per-boss motif still layers on top).
    if (state.boss.hpFrac <= 0.34) return 'warden_enraged';
    return state.boss.kind === 'warden' && state.boss.phase === 1 ? 'warden_fan' : 'warden_spiral';
  }
  // arena: rotate the distinct-track pool by run-progress; the loop cutoff (decideMusic) gives the
  // intensity curve within each track, so variety comes from the pool, energy from the reactive open.
  return ARENA_POOL[Math.floor(Math.max(0, absoluteBar) / ARENA_ROTATE_BARS) % ARENA_POOL.length];
}

/** Authored vertical layering per source shape. `loop` rides at full gain (its intensity comes
 *  from `loopCutoff`); `layers`/`stems` fade their sub-mixes with intensity/COHERENCE. */
function layerGainsFor(layering: MusicLayering, intensity: number, coherence: number): Partial<Record<MusicTrackKey, number>> {
  if (layering === 'loop') return { main: 1 };
  if (layering === 'layers') {
    return { bed: 1, energy: intensity, lead: clamp01((coherence - 0.3) / 0.7) };
  }
  // stems (forward-compatible)
  return {
    drums_core: 1,
    drive: 0.15 + intensity * 0.85,
    bass: 0.85 + intensity * 0.15,
    harmony: 0.45 + coherence * 0.55,
    hook: clamp01((coherence - 0.28) / 0.72),
    atmosphere: 0.35 + coherence * 0.65,
  };
}

export function decideMusic(state: MusicDirectorState, absoluteBar: number): MusicDecision {
  const sourceId = sourceFor(state, absoluteBar);
  const src = sourceById(sourceId);
  const layering: MusicLayering = src?.layering ?? 'loop';
  const intensity = clamp01(state.intensity);
  const coherence = clamp01(state.coherence);
  return {
    sourceId,
    layerGains: layerGainsFor(layering, intensity, coherence),
    loopCutoff: 800 + (18000 - 800) * clamp01(0.6 * intensity + 0.4 * coherence),
    reactiveGain: 0.25 + 0.45 * coherence,
    bpm: src?.bpm ?? 112,
    key: src?.key ?? 'A minor',
  };
}
