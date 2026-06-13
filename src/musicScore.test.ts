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
  PROGRESSIONS,
  CHORD_SHAPES,
  chordAt,
  chordVoicing,
  chordRootMul,
  brightnessTier,
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

describe('musicScore — diatonic harmony layer', () => {
  it('every chord shape starts on the root and is ascending', () => {
    for (const q of Object.keys(CHORD_SHAPES) as (keyof typeof CHORD_SHAPES)[]) {
      const s = CHORD_SHAPES[q];
      expect(s[0]).toBe(0);
      for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    }
  });

  it('progressions have 4 bars; verse loops carry a leading-tone cadence on the dominant', () => {
    for (const key of ['auroraVerse', 'surgeVerse']) {
      const p = PROGRESSIONS[key];
      expect(p.bars).toHaveLength(4);
      expect(p.cadence).toBeTruthy();
      // the dominant root is E (+7 from A) and contains a major 3rd (+4 = G#, the leading tone)
      expect(p.cadence!.rootSemi).toBe(7);
      expect(CHORD_SHAPES[p.cadence!.quality]).toContain(4);
    }
  });

  it('chordAt substitutes the cadence on bar 3 ONLY when earned (scarcity)', () => {
    const p = PROGRESSIONS.auroraVerse;
    expect(chordAt(p, 3, false)).toEqual(p.bars[3]); // circular by default
    expect(chordAt(p, 3, true)).toEqual(p.cadence); // earned → the V cadence
    expect(chordAt(p, 0, true)).toEqual(p.bars[0]); // only bar 3 cadences
    expect(chordAt(p, 7, true)).toEqual(p.cadence); // wraps (bar 7 = loop bar 3)
  });

  it('brightnessTier is monotonic, discrete 0..3', () => {
    expect(brightnessTier(0.0)).toBe(0);
    expect(brightnessTier(0.29)).toBe(0);
    expect(brightnessTier(0.3)).toBe(1);
    expect(brightnessTier(0.6)).toBe(2);
    expect(brightnessTier(0.85)).toBe(3);
    let prev = -1;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const t = brightnessTier(c);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('low brightness = bare triad; higher = more colour voices', () => {
    const am9 = PROGRESSIONS.auroraVerse.bars[0]; // m9
    expect(chordVoicing(am9, 1, 0).length).toBeLessThan(chordVoicing(am9, 1, 2).length);
    expect(chordVoicing(am9, 1, 0).length).toBe(3); // bare triad
  });

  it('PICARDY (tier 3) raises the minor 3rd to major', () => {
    const am = { rootSemi: 0, quality: 'min' as const };
    const dark = chordVoicing(am, 1, 0);
    const picardy = chordVoicing(am, 1, 3);
    // the minor-3rd voice (ratio 2^(3/12)) becomes a major 3rd (2^(4/12)) — within an octave fold
    const hasRatio = (freqs: number[], semis: number) =>
      freqs.some((f) => Math.abs((((Math.log2(f / 220) * 12) % 12) + 12) % 12 - semis) < 0.01);
    expect(hasRatio(dark, 3)).toBe(true); // minor 3rd present in dark
    expect(hasRatio(picardy, 4)).toBe(true); // major 3rd present in picardy
    expect(hasRatio(picardy, 3)).toBe(false); // no minor 3rd
  });

  it('THE TWO-LAYER INVARIANT: every voiced freq stays on the equal-tempered grid under EVERY combo tier', () => {
    // voice / (transposed key root) must be 2^(integer/12) — i.e. a chromatic semitone of
    // the transposed key, so the harmony block is consonant with the pentatonic melodic
    // layer at any tier (register-folding by octaves preserves the pitch class).
    for (const semis of COHERENCE_AUDIO.tierSemis) {
      const mul = Math.pow(2, semis / 12);
      const keyRoot = 220 * mul;
      for (const key of Object.keys(PROGRESSIONS)) {
        for (const ch of PROGRESSIONS[key].bars.concat(PROGRESSIONS[key].cadence ? [PROGRESSIONS[key].cadence!] : [])) {
          for (let tier = 0; tier <= 3; tier++) {
            for (const f of chordVoicing(ch, mul, tier)) {
              const semitones = Math.log2(f / keyRoot) * 12;
              expect(Math.abs(semitones - Math.round(semitones))).toBeLessThan(1e-6); // exact ET grid
              expect(f).toBeGreaterThan(150); // inside/around the pad slot
              expect(f).toBeLessThan(1250);
            }
          }
        }
      }
    }
  });

  it('chordRootMul matches 2^(rootSemi/12)', () => {
    expect(chordRootMul({ rootSemi: 0, quality: 'min' })).toBeCloseTo(1, 6);
    expect(chordRootMul({ rootSemi: 7, quality: 'dom7' })).toBeCloseTo(Math.pow(2, 7 / 12), 6);
  });
});
