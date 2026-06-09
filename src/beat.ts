// src/beat.ts — PURE rhythm clock + dash-release grading. NO ctx/DOM/rng.
// The beat layer is a REWARD ONLY: an on-beat dash kicks Coherence and nothing
// else; off-beat loses nothing (the dash is byte-identical to today). The clock
// is advanced by the fixed-timestep loop (realDt) and gently reconciled toward
// the audio clock (ctx.currentTime), which is read in game.ts and passed in —
// keeping this module pure and therefore Daily-deterministic by construction.
import { BEAT } from './tune';

export type BeatGrade = 'perfect' | 'good' | 'off';

export interface BeatGrid {
  bpm: number;
  beatDur: number;
  barDur: number;
  sixteenthDur: number;
  beatsPerBar: number;
}

export function makeGrid(bpm: number, beatsPerBar = 4): BeatGrid {
  const beatDur = 60 / bpm;
  return { bpm, beatDur, barDur: beatDur * beatsPerBar, sixteenthDur: beatDur / 4, beatsPerBar };
}

/** Phase within a period, 0..1 (wraps cleanly for negative t). */
export function phase01(t: number, period: number): number {
  if (period <= 0) return 0;
  const m = ((t % period) + period) % period;
  return m / period;
}

/** Signed distance to the nearest period boundary: <0 just past, >0 just before. */
export function signedNearest(t: number, period: number): number {
  if (period <= 0) return 0;
  const m = ((t % period) + period) % period;
  return m <= period / 2 ? -m : period - m;
}

export class BeatClock {
  t = 0;
  grid: BeatGrid;
  synced = false;
  constructor(grid: BeatGrid) {
    this.grid = grid;
  }
  /** Advance by REAL dt (audio is immune to slow-mo). */
  advance(dt: number): void {
    if (dt > 0) this.t += dt;
  }
  /** Pull the pure clock toward audio truth: hard-snap on a big drift (tab
   *  refocus), otherwise ease. First reconcile seeds the epoch exactly. */
  reconcile(audioMusicTime: number, dt: number): void {
    if (!Number.isFinite(audioMusicTime)) return;
    if (!this.synced) {
      this.t = audioMusicTime;
      this.synced = true;
      return;
    }
    const drift = audioMusicTime - this.t;
    if (Math.abs(drift) > BEAT.reseedSnapTolerance) this.t = audioMusicTime;
    else this.t += drift * Math.min(1, BEAT.reseedEase * dt);
  }
  beatPhase(): number {
    return phase01(this.t, this.grid.beatDur);
  }
  barPhase(): number {
    return phase01(this.t, this.grid.barDur);
  }
  signedBeatError(): number {
    return signedNearest(this.t, this.grid.beatDur);
  }
  beatError(): number {
    return Math.abs(this.signedBeatError());
  }
  /** The next 16th-note grid time strictly after `t` (snare quantization). */
  nextGridTime(): number {
    const s = this.grid.sixteenthDur;
    return Math.ceil((this.t + 1e-6) / s) * s;
  }
}

/** PURE grade of a dash release. Unsynced ⇒ 'off' (no false rewards before the
 *  audio epoch is known). A ~1-frame grace forgives input-poll quantization. */
export function gradeRelease(beatErr: number, synced: boolean): BeatGrade {
  if (!synced) return 'off';
  const e = beatErr - BEAT.graceOnLanding;
  const EPS = 1e-9; // inclusive windows: float noise must not flip a grade at the exact edge
  if (e <= BEAT.perfectWindow + EPS) return 'perfect';
  if (e <= BEAT.goodWindow + EPS) return 'good';
  return 'off';
}
