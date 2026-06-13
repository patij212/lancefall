// src/musicTransport.ts — PURE music transport. NO ctx/DOM/rng (mirrors beat.ts),
// so it's unit-testable and Daily-deterministic by construction.
//
// Turns a position on the beat grid (an absolute 16th-note step, or a musicTime in
// seconds) into bar/beat coordinates, and maps the absolute bar onto the anti-fatigue
// MACRO-FORM rotation A → A' → B → A. The audio engine drives note scheduling from
// these so the song has structure instead of being one endless 16-step loop.

import { MUSIC_BPM, MACRO_FORM } from './tune';

export interface TransportPos {
  step: number; // absolute 16th-note index since the music epoch (clamped ≥ 0)
  bar: number; // absolute bar index (16 sixteenths / 4 beats per bar)
  beatInBar: number; // 0..3
  sixteenthInBar: number; // 0..15
  sixteenthInBeat: number; // 0..3
  phraseStep: number; // 0..31 — position within the 2-bar hook phrase
}

export const SIXTEENTHS_PER_BAR = 16;
export const PHRASE_SIXTEENTHS = 32; // the LANCE THEME hook is a 2-bar phrase

/** Coordinates for an absolute 16th-note step (the scheduler's source of truth). */
export function positionFromStep(step: number): TransportPos {
  const s = step < 0 ? 0 : Math.floor(step);
  const sixteenthInBar = s % SIXTEENTHS_PER_BAR;
  return {
    step: s,
    bar: Math.floor(s / SIXTEENTHS_PER_BAR),
    beatInBar: Math.floor(sixteenthInBar / 4),
    sixteenthInBar,
    sixteenthInBeat: sixteenthInBar % 4,
    phraseStep: s % PHRASE_SIXTEENTHS,
  };
}

/** Coordinates from a musicTime in seconds (used by callers/tests that hold the clock). */
export function transportAt(musicTime: number, bpm = MUSIC_BPM): TransportPos {
  const sixteenthDur = 60 / bpm / 4;
  const step = musicTime <= 0 ? 0 : Math.floor(musicTime / sixteenthDur);
  return positionFromStep(step);
}

export type FormSection = 'A' | 'Aprime' | 'B';

const FORM_SEQ: { section: FormSection; bars: number }[] = [
  { section: 'A', bars: MACRO_FORM.aBars },
  { section: 'Aprime', bars: MACRO_FORM.aPrimeBars },
  { section: 'B', bars: MACRO_FORM.bBars },
  { section: 'A', bars: MACRO_FORM.aBars },
];

/** Total bars in one full macro-form rotation. */
export const FORM_TOTAL_BARS = FORM_SEQ.reduce((n, s) => n + s.bars, 0);

export interface FormInfo {
  section: FormSection;
  barInSection: number; // 0-based bar within the current section
  cycleBar: number; // 0..FORM_TOTAL_BARS-1
}

/** Map an absolute bar index onto the macro-form rotation (loops forever). */
export function formAt(bar: number): FormInfo {
  const cycleBar = ((Math.floor(bar) % FORM_TOTAL_BARS) + FORM_TOTAL_BARS) % FORM_TOTAL_BARS;
  let acc = 0;
  for (const seg of FORM_SEQ) {
    if (cycleBar < acc + seg.bars) return { section: seg.section, barInSection: cycleBar - acc, cycleBar };
    acc += seg.bars;
  }
  // unreachable (cycleBar < FORM_TOTAL_BARS), but keep the function total
  return { section: 'A', barInSection: 0, cycleBar };
}

// ── SONG SPINE (real arrangement) ────────────────────────────────────────────
// A deterministic, time-based section sequence that ADVANCES REGARDLESS OF PLAY (the
// critic's must-fix: a gameplay-gated form can't guarantee a song progresses for a
// mid-skill player). Each section dictates which LAYERS play — so the track BREATHES
// (sparse verse → building pre-chorus → full chorus → contrast bridge → drop) instead
// of stacking every layer at once (the "too busy" fix). Coherence/heat then modulate
// intensity ON TOP of this spine. One clock; drama events quantize to its bars.

export type Section = 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'drop';

const SONG: { section: Section; bars: number }[] = [
  { section: 'verse', bars: 8 },
  { section: 'prechorus', bars: 8 },
  { section: 'chorus', bars: 8 },
  { section: 'verse', bars: 8 }, // verse 2
  { section: 'prechorus', bars: 8 },
  { section: 'chorus', bars: 8 },
  { section: 'bridge', bars: 4 }, // the build (lead drops, half-cadence)
  { section: 'drop', bars: 4 }, // the release
];

export const SONG_TOTAL_BARS = SONG.reduce((n, s) => n + s.bars, 0); // 56 bars ≈ 2:00 @112

export interface SectionInfo {
  section: Section;
  barInSection: number; // 0-based bar within the current section
  sectionBars: number; // length of the current section
  next: Section; // the upcoming section (for builds/anticipation)
  cycleBar: number; // 0..SONG_TOTAL_BARS-1
}

/** The song-spine section for an absolute bar (loops forever). */
export function sectionAt(bar: number): SectionInfo {
  const cycleBar = ((Math.floor(bar) % SONG_TOTAL_BARS) + SONG_TOTAL_BARS) % SONG_TOTAL_BARS;
  let acc = 0;
  for (let i = 0; i < SONG.length; i++) {
    const seg = SONG[i];
    if (cycleBar < acc + seg.bars) {
      return {
        section: seg.section,
        barInSection: cycleBar - acc,
        sectionBars: seg.bars,
        next: SONG[(i + 1) % SONG.length].section,
        cycleBar,
      };
    }
    acc += seg.bars;
  }
  return { section: 'verse', barInSection: 0, sectionBars: SONG[0].bars, next: SONG[1].section, cycleBar };
}
