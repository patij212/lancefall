import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import { newCoherence, coherenceTarget, tickCoherence, coherenceBeatKick, coherenceBeatFlash, coherenceEdges, comboTier } from './coherence';
import { makeGrid, BeatClock, gradeRelease } from './beat';

// Guards the #1 invariant: the COHERENCE + BEAT layer is purely cosmetic and must
// NEVER perturb a seeded run. We prove it by DRAW-COUNT INVARIANCE — a fixed
// world.rng draw schedule yields the identical sequence whether or not the soul
// layer runs between draws, and regardless of beat.synced / grade outcome. If a
// future change wires any rng into the beat/coherence path, these tests break.

function drawSeq(seed: number, interleave: () => void, draws = 60): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < draws; i++) {
    interleave();
    out.push(rng.next());
  }
  return out;
}

describe('coherence/beat — determinism guard (draw-count invariance)', () => {
  it('the soul layer never perturbs a seeded rng stream', () => {
    const baseline = drawSeq(12345, () => {});
    const c = newCoherence();
    const beat = new BeatClock(makeGrid(112));
    const withSoul = drawSeq(12345, () => {
      beat.advance(1 / 60);
      c.tier = comboTier(20);
      c.target = coherenceTarget(20, 1, 3, 0);
      const prev = c.value;
      tickCoherence(c, 1 / 60);
      const grade = gradeRelease(beat.beatError(), beat.synced);
      if (grade !== 'off') {
        coherenceBeatKick(c, grade === 'perfect');
        coherenceBeatFlash(c, grade === 'perfect'); // C1 envelope — pure, no rng
      }
      coherenceEdges(prev, c.value); // C2/C3 crossing detection — pure, no rng
    });
    expect(withSoul).toEqual(baseline);
  });

  it('the grade outcome (perfect/good/off) does not change the rng draw sequence', () => {
    const baseline = drawSeq(999, () => {});
    const c = newCoherence();
    for (const beatErr of [0, 0.08, 0.3]) {
      const seq = drawSeq(999, () => {
        const grade = gradeRelease(beatErr, true);
        if (grade !== 'off') coherenceBeatKick(c, grade === 'perfect');
      });
      expect(seq).toEqual(baseline);
    }
  });

  it('beat.synced true vs false yields identical rng draws', () => {
    const c = newCoherence();
    const synced = drawSeq(7, () => {
      const grade = gradeRelease(0, true); // perfect
      if (grade !== 'off') coherenceBeatKick(c, grade === 'perfect');
    });
    const unsynced = drawSeq(7, () => {
      const grade = gradeRelease(0, false); // off
      if (grade !== 'off') coherenceBeatKick(c, grade === 'perfect');
    });
    expect(synced).toEqual(unsynced);
  });
});
