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
