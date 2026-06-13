// src/musicScore.ts — PURE score data + selectors. NO ctx/DOM/rng.
//
// This is the "sheet music": the pentatonic pitch set, THE LANCE THEME (the hero
// leitmotif / earworm), the moving-bass chord progression, and pure helpers that
// turn a transport position into "what notes play here." The audio engine reads
// these and synthesizes them; keeping the data pure makes it unit-testable and
// guarantees it can never touch the seeded world.rng.

import type { FormSection } from './musicTransport';

// A-minor pentatonic across two octaves (A C D E G). Consonant by construction, so
// nothing the score emits can sound "wrong" — and it all transposes intact with the
// combo-tier rootMul. Index map: 0=A2 1=C3 2=D3 3=E3 4=G3 5=A3 6=C4 7=D4 8=E4 9=G4.
export const PENTA = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392] as const;

export interface ThemeNote {
  at: number; // start, in 16th-notes within the 2-bar (32-step) phrase
  idx: number; // index into PENTA
  oct: number; // octave multiplier (1 or 2 — lets the hook reach above G4)
  dur: number; // duration in 16th-notes
  vel: number; // 0..1 relative velocity (downbeats + the leap are loudest)
}

// ── THE LANCE THEME ─────────────────────────────────────────────────────────
// An 8-ish-note hook with the earworm shape (Jakubowski et al.): a predictable
// rising-then-falling ARCH (A3→C4→E4→G4), ONE oversized LEAP up to high D5 on a
// syncopated "and" (the snag the ear can't forget), a stepwise DESCENT gap-fill
// (C5→A4→G4→E4), and an UNRESOLVED ending hanging on D (the 4th — the Zeigarnik
// itch that loops the ear back to A). Built from PENTA so it can't clash, and it
// transposes whole with rootMul → the melody literally IS the combo scoreboard.
export const LANCE_THEME: ThemeNote[] = [
  // bar 1 — the rising arch
  { at: 0, idx: 5, oct: 1, dur: 4, vel: 0.95 }, // A3
  { at: 4, idx: 6, oct: 1, dur: 2, vel: 0.6 }, // C4
  { at: 6, idx: 8, oct: 1, dur: 2, vel: 0.65 }, // E4
  { at: 8, idx: 9, oct: 1, dur: 2, vel: 0.7 }, // G4
  { at: 10, idx: 7, oct: 2, dur: 4, vel: 1.0 }, // D5 — THE LEAP (syncopated turning point)
  { at: 14, idx: 6, oct: 2, dur: 2, vel: 0.7 }, // C5 — begin the descent
  // bar 2 — stepwise descent gap-fill, then the unresolved hang
  { at: 16, idx: 5, oct: 2, dur: 2, vel: 0.8 }, // A4
  { at: 18, idx: 9, oct: 1, dur: 2, vel: 0.6 }, // G4
  { at: 20, idx: 8, oct: 1, dur: 4, vel: 0.75 }, // E4
  { at: 24, idx: 7, oct: 1, dur: 2, vel: 0.6 }, // D4
  { at: 26, idx: 6, oct: 1, dur: 2, vel: 0.6 }, // C4
  { at: 28, idx: 7, oct: 1, dur: 4, vel: 0.85 }, // D4 — END UNRESOLVED (the loop-back itch)
];

/** Resolve a theme note to a frequency, given the combo-tier root transpose. */
export function themeFreq(n: ThemeNote, rootMul = 1): number {
  return PENTA[n.idx] * n.oct * rootMul;
}

/** Per-section pitch transform of the hook (anti-fatigue surface variation):
 *  A = plain, A' = up an octave (brighter reprise), B = up a fifth (the FALL
 *  fragment). Returned as a multiplier composed onto rootMul. Pentatonic-safe. */
export function sectionLift(section: FormSection): number {
  if (section === 'Aprime') return 2; // octave up
  if (section === 'B') return Math.pow(2, 7 / 12); // fifth up — the FALL colour
  return 1;
}

// ── MOVING BASS — the chord progression ─────────────────────────────────────
// i–VI–III–VII in A minor (Am–F–C–G): one of the most satisfying loops in pop.
// Only the BASS moves through it (semitone offsets from the key root); the held
// pad/choir and the pentatonic top float over it, so the harmony reads as MOVING
// without any risk of a clash I can't ear-check. 1 chord per bar, 4-bar loop.
export const BASS_PROG = [0, -4, 3, -2] as const; // A2, F2, C3, G2

/** Semitone offset of the bass root for an absolute bar. */
export function bassOffsetAt(bar: number): number {
  const i = ((Math.floor(bar) % BASS_PROG.length) + BASS_PROG.length) % BASS_PROG.length;
  return BASS_PROG[i];
}

/** Frequency multiplier for the bass chord root at an absolute bar. */
export function bassChordMul(bar: number): number {
  return Math.pow(2, bassOffsetAt(bar) / 12);
}

/** All theme notes that START on a given phrase step (0..31). Usually 0 or 1. */
export function themeNotesAt(phraseStep: number): ThemeNote[] {
  const s = ((Math.floor(phraseStep) % 32) + 32) % 32;
  return LANCE_THEME.filter((n) => n.at === s);
}

// ── DIATONIC HARMONY LAYER (the bleakness fix) ───────────────────────────────
// The melodic layer stays pure PENTA (transpose-safe). This NEW harmony layer carries
// real triads/7ths/9ths + a leading tone + a true V→i cadence — the thirds, colour and
// resolution pentatonic structurally lacks. It transposes as a RIGID BLOCK: every voice
// is `220 * rootMul * 2^(rootSemi/12) * 2^(colorSemi/12)`, so because rootMul scales the
// whole block uniformly, every internal interval (3rd, maj7, add9, the G# leading tone)
// is invariant under EVERY combo tier — exactly as consonant as pentatonic, but with mode.

export type ChordQuality = 'min' | 'maj' | 'sus2' | 'sus4' | 'm9' | 'maj9' | 'add9' | 'dom7' | 'dom7b9';

/** Semitone stacks relative to a chord's own root. */
export const CHORD_SHAPES: Record<ChordQuality, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  dom7: [0, 4, 7, 10],
  dom7b9: [0, 4, 7, 10, 13],
};

export interface Chord {
  rootSemi: number; // chord root, semitones from the key root A
  quality: ChordQuality;
}

export interface Progression {
  name: string;
  bars: Chord[]; // one chord per bar (4-bar loop); bars[3] is the DECEPTIVE/circular default
  cadence?: Chord; // the dominant (with leading tone) — substituted on bar 3 only when EARNED
}

const C = (rootSemi: number, quality: ChordQuality): Chord => ({ rootSemi, quality });

// Named, role-tagged progressions. Roots are offsets from A. Each loop CIRCLES by default
// (no dominant → no resolution, so the V→i payoff doesn't habituate); the `cadence` E7/E7b9
// (G# leading tone → A) is substituted on the last bar only when a boundary EARNS it.
export const PROGRESSIONS: Record<string, Progression> = {
  // AURORA verse — i9 · bVII · bVI · bIII, with E7 as the earned cadence (Neon Rise)
  auroraVerse: { name: 'NEON RISE', bars: [C(0, 'm9'), C(-2, 'add9'), C(-4, 'maj9'), C(3, 'add9')], cadence: C(7, 'dom7') },
  // AURORA chorus — relative-major brightness (starts on C): bIII · bVII · i · bVI (Triumph)
  auroraChorus: { name: 'TRIUMPH', bars: [C(3, 'add9'), C(-2, 'maj'), C(0, 'add9'), C(-4, 'maj9')], cadence: C(7, 'dom7') },
  // SURGE verse — driving darkness via the borrowed iv (Dm) for depth, riff-safe (the
  // always-on A/C/E riff stays consonant — no b2 clash) + the F/C majors for light, E7b9
  // cadence. Darkness comes from timbre/groove, not a clichéd Phrygian b2 (Fall Engine).
  surgeVerse: { name: 'FALL ENGINE', bars: [C(0, 'm9'), C(-4, 'maj9'), C(5, 'min'), C(3, 'add9')], cadence: C(7, 'dom7b9') },
  // SURGE chorus — driving dark: i · bIII · bVI · bVII (majors give brightness inside the aggression)
  surgeChorus: { name: 'DRIVING DARK', bars: [C(0, 'm9'), C(3, 'add9'), C(-4, 'maj9'), C(-2, 'maj')], cadence: C(7, 'dom7b9') },
  // BRIDGE — harmonic contrast, half-cadence OPEN on the dominant E (sets up the drop)
  bridge: { name: 'CONTRAST', bars: [C(5, 'min'), C(3, 'add9'), C(7, 'maj'), C(7, 'maj')] },
};

/** The chord for an absolute bar. On the loop's last bar, the leading-tone cadence is
 *  substituted only when `earned` (a section boundary / combo milestone) — so the V→i
 *  reward stays scarce and never becomes wallpaper. */
export function chordAt(prog: Progression, bar: number, earned: boolean): Chord {
  const i = ((Math.floor(bar) % 4) + 4) % 4;
  if (i === 3 && earned && prog.cadence) return prog.cadence;
  return prog.bars[i];
}

/** Block-transpose multiplier for a chord root (preserves internal intervals). */
export function chordRootMul(chord: Chord): number {
  return Math.pow(2, chord.rootSemi / 12);
}

// Discrete COHERENCE → mode-brightness tier (snapped to steps, read per-bar, NOT a
// continuous morph — continuous harmonic morphing reads as seasick, not composed):
// 0 DARK (bare triads) · 1 DORIAN GLOW (+9ths) · 2 OPEN COLOR (maj7/9) · 3 PICARDY (major lift).
export function brightnessTier(coherence: number): number {
  if (coherence >= 0.85) return 3;
  if (coherence >= 0.6) return 2;
  if (coherence >= 0.3) return 1;
  return 0;
}

/** Voice a chord to absolute frequencies, register-capped + frequency-slotted to the
 *  pad band (~165–1200 Hz) so 9ths/maj7s never smear into the lead's 1.2–4 kHz pocket.
 *  Colour tones are dropped at low brightness (bare triad) and a minor 3rd is raised to
 *  major at PICARDY — the mode-brightness morph. `padLo/padHi` set the slot. */
export function chordVoicing(chord: Chord, rootMul: number, tier: number, padLo = 165, padHi = 1200): number[] {
  let semis = CHORD_SHAPES[chord.quality].slice();
  if (tier <= 0)
    semis = semis.filter((s) => s === 0 || s === 3 || s === 4 || s === 7); // bare triad
  else if (tier === 1)
    semis = semis.filter((s) => s !== 10 && s !== 11 && s !== 13); // triad + add9 (drop 7ths/b9)
  // tier >= 2 keeps full colour (maj7/9)
  if (tier >= 3) semis = semis.map((s) => (s === 3 ? 4 : s)); // PICARDY: minor 3rd → major
  const rootHz = 220 * rootMul * chordRootMul(chord); // chord root in the A3 region
  return semis.map((s) => {
    let f = rootHz * Math.pow(2, s / 12);
    while (f > padHi) f /= 2; // fold high voices down (register cap)
    while (f < padLo) f *= 2; // keep inside the pad slot
    return f;
  });
}
