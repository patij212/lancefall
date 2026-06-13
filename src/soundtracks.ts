// src/soundtracks.ts — PURE soundtrack profiles. NO ctx/DOM/rng.
//
// A "track profile" parameterizes the procedural engine so the game can ship more
// than one soundtrack, selectable in Settings. Both tracks stay on the A-minor
// PENTA set + the frozen 112 BPM grid (so the combo-tier transpose + dash-grading
// are valid for either), and differ in groove, density, timbre, drive, and theme.
//
// KEY DESIGN: a lot of play happens OUT of combo (low coherence), where the
// coherence-gated lead hook is silent. So each track also carries an always-on
// `riff` (ungated) — the baseline groove must be great with zero combo, and the
// hook blooms ON TOP as the combo reward.

import type { ThemeNote } from './musicScore';
import { LANCE_THEME } from './musicScore';

export type SoundtrackId = 'aurora' | 'surge';

export interface TrackProfile {
  id: SoundtrackId;
  name: string; // shown in Settings
  blurb: string; // one-line description
  // ── rhythm (16th positions within a bar, 0..15) ──
  kickSteps: number[];
  bassSteps: number[]; // base bass hits
  bassHotSteps: number[]; // extra bass hits once heat > 0.6 (drive)
  // ── timbres / drive (drive 1 = clean; >1 adds tanh grit) ──
  bassWave: OscillatorType;
  bassDrive: number;
  bassCutoff: number;
  bassGain: number;
  arpWave: OscillatorType;
  arpHeat: number; // heat threshold where the arp engages (lower = busier sooner)
  // ── always-on RIFF (ungated ostinato; 1-bar, indexed by sixteenthInBar 0..15) ──
  riff: ThemeNote[];
  riffWave: OscillatorType;
  riffDrive: number;
  riffGain: number;
  // ── coherence-gated lead HOOK (2-bar phrase, indexed by phraseStep 0..31) ──
  theme: ThemeNote[];
  leadWave: OscillatorType;
  leadDrive: number;
  // ── perc/break thresholds + sidechain depth ──
  hatHeat: number;
  snareHeat: number;
  pumpDepth: number; // pad ducked to this on each kick (lower = harder pump)
}

// ── SURGE: an always-on, driving mid-register ostinato (the baseline energy) ──
// A hooky 8th-note figure circling A3 with reaches up to E4 — relentless and catchy,
// so a zero-combo stretch still grooves. Sits above the bass, below the lead hook.
const SURGE_RIFF: ThemeNote[] = [
  { at: 0, idx: 5, oct: 1, dur: 2, vel: 0.95 }, // A3 (downbeat accent)
  { at: 2, idx: 5, oct: 1, dur: 2, vel: 0.6 }, // A3
  { at: 4, idx: 6, oct: 1, dur: 2, vel: 0.75 }, // C4
  { at: 6, idx: 5, oct: 1, dur: 2, vel: 0.6 }, // A3
  { at: 8, idx: 8, oct: 1, dur: 2, vel: 0.9 }, // E4 (mid accent)
  { at: 10, idx: 7, oct: 1, dur: 2, vel: 0.6 }, // D4
  { at: 12, idx: 6, oct: 1, dur: 2, vel: 0.7 }, // C4
  { at: 14, idx: 5, oct: 1, dur: 2, vel: 0.6 }, // A3
];

// ── SURGE lead HOOK: denser + higher + more syncopated than the AURORA theme —
// aggressive ascending stabs, a driving descent, ending unresolved on D (the itch). ──
const SURGE_THEME: ThemeNote[] = [
  // bar 1 — aggressive ascending stabs
  { at: 0, idx: 5, oct: 2, dur: 2, vel: 1.0 }, // A4
  { at: 2, idx: 5, oct: 2, dur: 1, vel: 0.7 }, // A4 (stutter)
  { at: 4, idx: 6, oct: 2, dur: 2, vel: 0.85 }, // C5
  { at: 6, idx: 8, oct: 2, dur: 2, vel: 0.9 }, // E5
  { at: 8, idx: 7, oct: 2, dur: 2, vel: 0.95 }, // D5 (peak)
  { at: 10, idx: 6, oct: 2, dur: 1, vel: 0.75 }, // C5
  { at: 12, idx: 5, oct: 2, dur: 2, vel: 0.85 }, // A4
  { at: 14, idx: 8, oct: 1, dur: 2, vel: 0.7 }, // E4
  // bar 2 — driving descent → unresolved hang on D
  { at: 16, idx: 9, oct: 1, dur: 2, vel: 0.8 }, // G4
  { at: 18, idx: 5, oct: 2, dur: 2, vel: 0.9 }, // A4
  { at: 20, idx: 9, oct: 1, dur: 1, vel: 0.7 }, // G4
  { at: 22, idx: 8, oct: 1, dur: 1, vel: 0.7 }, // E4
  { at: 24, idx: 7, oct: 1, dur: 2, vel: 0.85 }, // D4
  { at: 26, idx: 6, oct: 1, dur: 1, vel: 0.7 }, // C4
  { at: 28, idx: 7, oct: 1, dur: 4, vel: 0.95 }, // D4 — end unresolved (loops the ear)
];

export const TRACKS: Record<SoundtrackId, TrackProfile> = {
  // AURORA — the original "soul" track: dreamy, spacious, the hook SOARS as a clean
  // run earns it. Sparse baseline by design (kept exactly as shipped). No riff.
  aurora: {
    id: 'aurora',
    name: 'AURORA',
    blurb: 'dreamy · soaring · the soul of the fall',
    kickSteps: [0, 4, 8, 12],
    bassSteps: [0, 8],
    bassHotSteps: [6, 14],
    bassWave: 'sawtooth',
    bassDrive: 1,
    bassCutoff: 600,
    bassGain: 0.18,
    arpWave: 'triangle',
    arpHeat: 0.25,
    riff: [],
    riffWave: 'triangle',
    riffDrive: 1,
    riffGain: 0,
    theme: LANCE_THEME,
    leadWave: 'sawtooth',
    leadDrive: 1,
    hatHeat: 0.65,
    snareHeat: 0.5,
    pumpDepth: 0.5,
  },
  // SURGE — aggressive darksynth: a relentless always-on riff + a gritty driving
  // 8th-note bass + a distorted square lead + a deep pump + early percussion. The
  // baseline grooves hard with ZERO combo; the hook blooms on top as the reward.
  surge: {
    id: 'surge',
    name: 'SURGE',
    blurb: 'aggressive · driving · always energized',
    kickSteps: [0, 4, 8, 12],
    bassSteps: [0, 2, 4, 6, 8, 10, 12, 14], // driving 8th-note bass (the engine of energy)
    bassHotSteps: [],
    bassWave: 'sawtooth',
    bassDrive: 1.6, // gritty bass
    bassCutoff: 950,
    bassGain: 0.15,
    arpWave: 'square',
    arpHeat: 0.15, // arp engages early — more energy sooner
    riff: SURGE_RIFF,
    riffWave: 'square',
    riffDrive: 1.5,
    riffGain: 0.07,
    theme: SURGE_THEME,
    leadWave: 'square',
    leadDrive: 1.9, // distorted, biting lead
    hatHeat: 0.4, // hats come in early
    snareHeat: 0.3, // backbeat snare comes in early
    pumpDepth: 0.4, // deeper, harder sidechain pump
  },
};

export function getTrack(id: SoundtrackId): TrackProfile {
  return TRACKS[id] ?? TRACKS.aurora;
}

/** Notes from a pattern that START on a given step index (1-bar riffs use
 *  sixteenthInBar 0..15; 2-bar hooks use phraseStep 0..31). */
export function notesAt(notes: ThemeNote[], stepIndex: number): ThemeNote[] {
  return notes.filter((n) => n.at === stepIndex);
}
