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
  /** Adaptive per-track tempo: swap the grid to a new BPM and re-epoch so the next
   *  reconcile re-seeds `t` to the new source's transport (the existing unsynced-seed
   *  branch). Cosmetic only — never affects the seeded sim (Daily-safe by construction). */
  retempo(bpm: number): void {
    this.grid = makeGrid(bpm, this.grid.beatsPerBar);
    this.synced = false;
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
 *  audio epoch is known). A ~1-frame grace forgives input-poll quantization.
 *
 *  Playtest (Nick): slow-mo "interrupted the rhythm". The beat clock keeps REAL time (audio is
 *  immune to slow-mo) while the dash plays out in SLOWED sim time, so the real-time beatErr is
 *  inflated ~1/timeScale relative to how on-beat the dash FELT — and an on-beat-feeling dash
 *  graded 'off'. We widen the windows by 1/timeScale so the felt cadence maps back to the
 *  grade. timeScale defaults to 1 ⇒ byte-identical at normal speed. The ~1-frame grace is a
 *  real-time input-poll artifact, so it is NOT scaled. Pure + Daily-safe (reward-only). */
export function gradeRelease(beatErr: number, synced: boolean, timeScale = 1): BeatGrade {
  if (!synced) return 'off';
  const e = beatErr - BEAT.graceOnLanding;
  const w = timeScale > 0 && timeScale < 1 ? 1 / timeScale : 1; // widen windows during slow-mo only
  const EPS = 1e-9; // inclusive windows: float noise must not flip a grade at the exact edge
  if (e <= BEAT.perfectWindow * w + EPS) return 'perfect';
  if (e <= BEAT.goodWindow * w + EPS) return 'good';
  return 'off';
}
