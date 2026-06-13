// Per-boss musical identity. Each boss layers a distinct "tension chord" of drone
// voices over the procedural soundtrack and shifts the arpeggio's colour, so every
// boss fight sounds different. Pure data + a total selector (audio.ts consumes it);
// intervals are semitones above the 55 Hz (A1) music root.

import type { EnemyKind } from './types';

export interface BossTheme {
  name: string;
  drone: number[]; // semitone intervals above the root → the tension chord's voices
  wave: OscillatorType;
  detune: number; // cents of detune per voice (thickness)
  arpMul: number; // multiplier on the soundtrack arp pitch (darker < 1 < brighter)
  // ── horizontal re-sequencing: each boss states a recognizable 1-bar LEAD MOTIF
  //    (PENTA indices, one per 8th-note over the bar; -1 = rest) that REPLACES the
  //    arena LANCE THEME hook during the fight. Distinct contour per boss → you hear
  //    WHO you're fighting. The hook returns when the boss is felled.
  motif: number[]; // length 8 (8th-notes), values = PENTA index 0..9 or -1 (rest)
  motifGain: number; // lead gain for the motif voice
  motifOct: number; // octave multiplier for the motif (1 or 2)
}

const DEFAULT: BossTheme = {
  name: 'WARDEN',
  drone: [6],
  wave: 'sawtooth',
  detune: 5,
  arpMul: 0.75,
  motif: [5, -1, 4, -1, 3, -1, 5, -1],
  motifGain: 0.09,
  motifOct: 1,
};

export const BOSS_THEMES: Partial<Record<EnemyKind, BossTheme>> = {
  // WARDEN — the classic tritone tension. Motif: a stalking A3-G3-E3-A3 descent.
  warden: { name: 'WARDEN', drone: [6], wave: 'sawtooth', detune: 5, arpMul: 0.75, motif: [5, -1, 4, -1, 3, -1, 5, -1], motifGain: 0.09, motifOct: 1 },
  // WEAVER — a minor-third + minor-seventh stack on a soft triangle: hypnotic. Motif:
  // a pinwheeling A3-C4-E4-C4 circle that never settles.
  weaver: { name: 'WEAVER', drone: [3, 10], wave: 'triangle', detune: 8, arpMul: 1.0, motif: [5, 6, 8, 6, 5, 6, 8, 6], motifGain: 0.08, motifOct: 1 },
  // BEACON — a bright fifth + octave: piercing. Motif: ascending reaching sweeps.
  beacon: { name: 'BEACON', drone: [7, 12], wave: 'sawtooth', detune: 4, arpMul: 1.5, motif: [5, 8, 9, -1, 6, 8, 9, -1], motifGain: 0.085, motifOct: 1 },
  // MIRRORBLADE — root + octave on a hard square: aggressive duelist. Motif: sharp,
  // gapped call-and-response stabs.
  mirrorblade: { name: 'MIRRORBLADE', drone: [0, 12], wave: 'square', detune: 6, arpMul: 0.5, motif: [9, -1, 9, 8, -1, 5, -1, -1], motifGain: 0.08, motifOct: 1 },
  // HOLLOW — a detuned minor-second + tritone cluster: eerie. Motif: sparse, floating
  // fragments with big gaps (intangible dread).
  hollow: { name: 'HOLLOW', drone: [1, 6], wave: 'sawtooth', detune: 14, arpMul: 0.66, motif: [7, -1, -1, 6, -1, -1, 8, -1], motifGain: 0.08, motifOct: 1 },
  // THE SOVEREIGN — a grand four-voice chord: the finale. Motif: a stately rising
  // fanfare that settles UNRESOLVED on D — the throne echoing the hero's own theme.
  sovereign: { name: 'SOVEREIGN', drone: [0, 7, 12, 16], wave: 'sawtooth', detune: 7, arpMul: 0.75, motif: [5, 7, 9, 9, 8, 7, 5, 7], motifGain: 0.1, motifOct: 1 },
};

/** Total: returns the boss theme for a kind, falling back to the Warden tritone. */
export function bossTheme(kind: EnemyKind): BossTheme {
  return BOSS_THEMES[kind] ?? DEFAULT;
}
