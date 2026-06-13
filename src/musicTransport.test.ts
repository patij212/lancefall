import { describe, it, expect } from 'vitest';
import {
  positionFromStep,
  transportAt,
  formAt,
  FORM_TOTAL_BARS,
  SIXTEENTHS_PER_BAR,
  PHRASE_SIXTEENTHS,
} from './musicTransport';
import { MUSIC_BPM } from './tune';

describe('musicTransport — positionFromStep', () => {
  it('step 0 is bar 0, beat 0', () => {
    const p = positionFromStep(0);
    expect(p).toMatchObject({ step: 0, bar: 0, beatInBar: 0, sixteenthInBar: 0, sixteenthInBeat: 0, phraseStep: 0 });
  });

  it('decomposes mid-bar steps correctly', () => {
    const p = positionFromStep(6); // bar 0, beat 1, 3rd sixteenth
    expect(p.bar).toBe(0);
    expect(p.sixteenthInBar).toBe(6);
    expect(p.beatInBar).toBe(1);
    expect(p.sixteenthInBeat).toBe(2);
  });

  it('rolls into the next bar at 16 sixteenths', () => {
    const p = positionFromStep(SIXTEENTHS_PER_BAR + 4); // bar 1, beat 1
    expect(p.bar).toBe(1);
    expect(p.beatInBar).toBe(1);
    expect(p.sixteenthInBar).toBe(4);
  });

  it('phraseStep wraps every two bars', () => {
    expect(positionFromStep(PHRASE_SIXTEENTHS).phraseStep).toBe(0);
    expect(positionFromStep(PHRASE_SIXTEENTHS + 5).phraseStep).toBe(5);
  });

  it('clamps negative steps to 0', () => {
    expect(positionFromStep(-10).step).toBe(0);
  });

  it('floors fractional steps', () => {
    expect(positionFromStep(6.9).step).toBe(6);
  });
});

describe('musicTransport — transportAt', () => {
  it('time 0 (and below) is step 0', () => {
    expect(transportAt(0).step).toBe(0);
    expect(transportAt(-1).step).toBe(0);
  });

  it('one beat of time advances exactly 4 sixteenths', () => {
    const beatDur = 60 / MUSIC_BPM;
    const p = transportAt(beatDur + 1e-6);
    expect(p.step).toBe(4);
    expect(p.beatInBar).toBe(1);
  });

  it('one bar of time advances exactly 16 sixteenths', () => {
    const barDur = (60 / MUSIC_BPM) * 4;
    expect(transportAt(barDur + 1e-6).step).toBe(SIXTEENTHS_PER_BAR);
  });

  it('is monotonic in time', () => {
    let last = -1;
    for (let t = 0; t < 10; t += 0.013) {
      const s = transportAt(t).step;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });
});

describe('musicTransport — macro-form A → A′ → B → A', () => {
  it('totals 28 bars per rotation', () => {
    expect(FORM_TOTAL_BARS).toBe(28);
  });

  it('maps the four segments', () => {
    expect(formAt(0)).toMatchObject({ section: 'A', barInSection: 0 });
    expect(formAt(7)).toMatchObject({ section: 'A', barInSection: 7 });
    expect(formAt(8)).toMatchObject({ section: 'Aprime', barInSection: 0 });
    expect(formAt(15)).toMatchObject({ section: 'Aprime', barInSection: 7 });
    expect(formAt(16)).toMatchObject({ section: 'B', barInSection: 0 });
    expect(formAt(19)).toMatchObject({ section: 'B', barInSection: 3 });
    expect(formAt(20)).toMatchObject({ section: 'A', barInSection: 0 });
    expect(formAt(27)).toMatchObject({ section: 'A', barInSection: 7 });
  });

  it('loops cleanly after a full rotation', () => {
    expect(formAt(28)).toMatchObject({ section: 'A', barInSection: 0, cycleBar: 0 });
    expect(formAt(28 + 8)).toMatchObject({ section: 'Aprime', barInSection: 0 });
  });

  it('handles negative bars without crashing', () => {
    const f = formAt(-1);
    expect(f.cycleBar).toBe(FORM_TOTAL_BARS - 1);
    expect(f.section).toBe('A');
  });
});

import { sectionAt, SONG_TOTAL_BARS } from './musicTransport';

describe('musicTransport — song spine (sectionAt)', () => {
  it('advances through a real arrangement regardless of play', () => {
    expect(sectionAt(0).section).toBe('verse');
    expect(sectionAt(8).section).toBe('prechorus');
    expect(sectionAt(16).section).toBe('chorus');
    expect(sectionAt(24).section).toBe('verse'); // verse 2
    expect(sectionAt(48).section).toBe('bridge');
    expect(sectionAt(52).section).toBe('drop');
  });

  it('reports section length, position, and the upcoming section (for builds)', () => {
    const s = sectionAt(15); // last bar of the first prechorus (8..15)
    expect(s.section).toBe('prechorus');
    expect(s.barInSection).toBe(7);
    expect(s.sectionBars).toBe(8);
    expect(s.next).toBe('chorus'); // → a build fires here
  });

  it('totals 56 bars and loops cleanly', () => {
    expect(SONG_TOTAL_BARS).toBe(56);
    expect(sectionAt(56).section).toBe('verse');
    expect(sectionAt(56 + 48).section).toBe('bridge');
  });

  it('handles negative bars', () => {
    expect(sectionAt(-1).section).toBe('drop'); // last section of the loop
  });
});
