import { describe, it, expect } from 'vitest';
import { TRACKS, getTrack, notesAt } from './soundtracks';
import { PENTA, themeFreq } from './musicScore';
import { COHERENCE_AUDIO } from './tune';

const IDS = ['aurora', 'surge'] as const;

function assertNotesWellFormed(notes: { at: number; idx: number; oct: number; dur: number; vel: number }[], maxAt: number) {
  for (const n of notes) {
    expect(n.idx).toBeGreaterThanOrEqual(0);
    expect(n.idx).toBeLessThan(PENTA.length);
    expect([1, 2]).toContain(n.oct);
    expect(n.at).toBeGreaterThanOrEqual(0);
    expect(n.at).toBeLessThan(maxAt);
    expect(n.at + n.dur).toBeLessThanOrEqual(maxAt + 4); // a final note may ring out a touch
    expect(n.vel).toBeGreaterThan(0);
    expect(n.vel).toBeLessThanOrEqual(1);
  }
}

describe('soundtracks — profiles', () => {
  it('every profile is complete and keyed by its own id', () => {
    for (const id of IDS) {
      const t = TRACKS[id];
      expect(t.id).toBe(id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.kickSteps.length).toBeGreaterThan(0);
      expect(t.bassSteps.length).toBeGreaterThan(0);
      expect(t.pumpDepth).toBeGreaterThan(0);
      expect(t.pumpDepth).toBeLessThanOrEqual(1);
    }
  });

  it('getTrack falls back to aurora for an unknown id', () => {
    // @ts-expect-error — testing the runtime fallback
    expect(getTrack('nope')).toBe(TRACKS.aurora);
  });

  it('all step positions are inside a 16-step bar', () => {
    for (const id of IDS) {
      const t = TRACKS[id];
      for (const arr of [t.kickSteps, t.bassSteps, t.bassHotSteps]) {
        for (const s of arr) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(16);
        }
      }
    }
  });
});

describe('soundtracks — AURORA is the shipped track, unchanged', () => {
  it('keeps the sparse soul groove: clean timbres, no always-on riff', () => {
    const a = TRACKS.aurora;
    expect(a.riff).toHaveLength(0); // dreamy/spacious by design
    expect(a.bassDrive).toBe(1); // clean
    expect(a.leadDrive).toBe(1);
    expect(a.bassSteps).toEqual([0, 8]); // bass on beats 1 & 3
  });
});

describe('soundtracks — SURGE is aggressive AND great out of combo', () => {
  const s = TRACKS.surge;

  it('has an always-on riff so a zero-combo stretch still grooves', () => {
    expect(s.riff.length).toBeGreaterThan(0);
    expect(s.riffGain).toBeGreaterThan(0);
    assertNotesWellFormed(s.riff, 16); // a 1-bar ostinato
  });

  it('is denser + grittier + harder-pumping than AURORA', () => {
    expect(s.bassSteps.length).toBeGreaterThan(TRACKS.aurora.bassSteps.length); // driving 8ths
    expect(s.bassDrive).toBeGreaterThan(1); // distorted
    expect(s.leadDrive).toBeGreaterThan(1);
    expect(s.arpHeat).toBeLessThan(TRACKS.aurora.arpHeat); // arp/perc engage sooner
    expect(s.hatHeat).toBeLessThan(TRACKS.aurora.hatHeat);
    expect(s.pumpDepth).toBeLessThan(TRACKS.aurora.pumpDepth); // deeper pump
  });

  it('hook is a well-formed 2-bar phrase that transposes safely with the combo tier', () => {
    assertNotesWellFormed(s.theme, 32);
    for (const semis of COHERENCE_AUDIO.tierSemis) {
      const mul = Math.pow(2, semis / 12);
      for (const n of s.theme) expect(themeFreq(n, mul)).toBeCloseTo(themeFreq(n) * mul, 4);
    }
  });
});

describe('soundtracks — notesAt', () => {
  it('selects notes starting on a step', () => {
    const riff = TRACKS.surge.riff;
    expect(notesAt(riff, 0)).toHaveLength(1);
    expect(notesAt(riff, 0)[0].idx).toBe(5); // opens on A3
    expect(notesAt(riff, 1)).toHaveLength(0);
  });
});
