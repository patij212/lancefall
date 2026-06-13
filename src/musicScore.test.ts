import { describe, it, expect } from 'vitest';
import {
  PENTA,
  LANCE_THEME,
  themeFreq,
  themeNotesAt,
  sectionLift,
  BASS_PROG,
  bassOffsetAt,
  bassChordMul,
} from './musicScore';
import { COHERENCE_AUDIO } from './tune';

describe('musicScore — pentatonic set', () => {
  it('has 10 strictly ascending notes (A-minor pentatonic, 2 octaves)', () => {
    expect(PENTA).toHaveLength(10);
    for (let i = 1; i < PENTA.length; i++) expect(PENTA[i]).toBeGreaterThan(PENTA[i - 1]);
  });
});

describe('musicScore — THE LANCE THEME', () => {
  it('every note is well-formed and inside the phrase', () => {
    for (const n of LANCE_THEME) {
      expect(n.idx).toBeGreaterThanOrEqual(0);
      expect(n.idx).toBeLessThan(PENTA.length);
      expect([1, 2]).toContain(n.oct);
      expect(n.at).toBeGreaterThanOrEqual(0);
      expect(n.at).toBeLessThan(32);
      expect(n.at + n.dur).toBeLessThanOrEqual(32);
      expect(n.vel).toBeGreaterThan(0);
      expect(n.vel).toBeLessThanOrEqual(1);
    }
  });

  it('notes do not overlap (monophonic lead) and are time-ordered', () => {
    const sorted = [...LANCE_THEME].sort((a, b) => a.at - b.at);
    expect(LANCE_THEME).toEqual(sorted); // authored in order
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].at).toBeGreaterThanOrEqual(sorted[i - 1].at + sorted[i - 1].dur);
    }
  });

  it('has the earworm shape: a single oversized upward leap at the turning point', () => {
    // the peak note (highest freq) is the syncopated D5 leap, on an offbeat ("and")
    let peak = LANCE_THEME[0];
    for (const n of LANCE_THEME) if (themeFreq(n) > themeFreq(peak)) peak = n;
    expect(peak.oct).toBe(2);
    expect(peak.at % 2).toBe(0); // on a sixteenth grid…
    expect(peak.at % 4).not.toBe(0); // …but NOT on a downbeat → syncopated
    // ends unresolved on D (not on the tonic A)
    const last = LANCE_THEME[LANCE_THEME.length - 1];
    expect(PENTA[last.idx]).not.toBe(PENTA[5]); // not A3
    expect(PENTA[last.idx]).not.toBe(PENTA[0]); // not A2
  });

  it('all notes resolve to sane frequencies (80–1300 Hz) at rootMul 1', () => {
    for (const n of LANCE_THEME) {
      const f = themeFreq(n);
      expect(f).toBeGreaterThan(80);
      expect(f).toBeLessThan(1300);
    }
  });

  it('transposes intact with the combo-tier rootMul', () => {
    for (const semis of COHERENCE_AUDIO.tierSemis) {
      const mul = Math.pow(2, semis / 12);
      for (const n of LANCE_THEME) {
        expect(themeFreq(n, mul)).toBeCloseTo(themeFreq(n) * mul, 4);
      }
    }
    // highest tier still in a musical range
    const top = Math.pow(2, 12 / 12);
    for (const n of LANCE_THEME) expect(themeFreq(n, top)).toBeLessThan(2600);
  });

  it('themeNotesAt returns the note starting on a step', () => {
    expect(themeNotesAt(0)).toHaveLength(1);
    expect(themeNotesAt(0)[0].idx).toBe(5); // opens on A3
    expect(themeNotesAt(1)).toHaveLength(0); // nothing starts here
    expect(themeNotesAt(32)).toEqual(themeNotesAt(0)); // wraps every 2 bars
  });
});

describe('musicScore — section lift (anti-fatigue)', () => {
  it('A plain, A′ octave-up, B fifth-up', () => {
    expect(sectionLift('A')).toBe(1);
    expect(sectionLift('Aprime')).toBe(2);
    expect(sectionLift('B')).toBeCloseTo(Math.pow(2, 7 / 12), 6);
  });
});

describe('musicScore — moving bass progression', () => {
  it('is the Am–F–C–G loop as semitone offsets', () => {
    expect([...BASS_PROG]).toEqual([0, -4, 3, -2]);
  });

  it('cycles every 4 bars and handles negatives', () => {
    expect(bassOffsetAt(0)).toBe(0);
    expect(bassOffsetAt(1)).toBe(-4);
    expect(bassOffsetAt(4)).toBe(0);
    expect(bassOffsetAt(-1)).toBe(-2); // last chord of the loop
  });

  it('bassChordMul matches 2^(semis/12)', () => {
    expect(bassChordMul(0)).toBeCloseTo(1, 6);
    expect(bassChordMul(1)).toBeCloseTo(Math.pow(2, -4 / 12), 6);
  });
});
