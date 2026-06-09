// The time-control spine. EVERYTHING routes through here so slow-mo and hitstop
// are free to layer. The loop asks the scheduler each frame for the effective
// sim dt: hitstop freezes the sim entirely; slow-mo scales it down smoothly.

import { TUNE } from './tune';
import { clamp, easeInQuad } from './vec';

export class Scheduler {
  /** Current global time scale (1 = normal). */
  timeScale = 1;
  private hitstop = 0; // seconds of frozen sim remaining
  private holdTimer = 0; // slow-mo hold remaining
  private easing = false;
  private easeT = 0;
  private easeFrom = 1;

  /** Freeze the sim for `sec` seconds. Uses max() so overlapping kills don't
   *  stack into a lag spike. */
  requestHitstop(sec: number): void {
    if (sec > this.hitstop) this.hitstop = sec;
  }

  /** Drop into slow-mo, holding for the configured time (+extra from perks). */
  requestSlowmo(extraHold = 0): void {
    this.timeScale = TUNE.juice.slowmoScale;
    this.holdTimer = Math.max(this.holdTimer, TUNE.juice.slowmoHold + extraHold);
    this.easing = false;
  }

  /** A custom-depth, custom-length slow-mo (LAST BREATH's deep bullet-time).
   *  Takes the deeper scale + longer hold so it can't be cut short by a lighter
   *  slow-mo already running. */
  requestDeepSlowmo(scale: number, hold: number): void {
    this.timeScale = Math.min(this.timeScale, scale);
    this.holdTimer = Math.max(this.holdTimer, hold);
    this.easing = false;
  }

  get frozen(): boolean {
    return this.hitstop > 0;
  }

  /** Advance time controllers on real (unscaled) dt. Returns the sim dt to feed
   *  the fixed-timestep accumulator this frame. */
  update(realDt: number): number {
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - realDt);
      return 0; // sim frozen
    }

    if (this.holdTimer > 0) {
      this.holdTimer -= realDt;
      if (this.holdTimer <= 0) {
        this.easing = true;
        this.easeT = 0;
        this.easeFrom = this.timeScale;
      }
    } else if (this.easing) {
      this.easeT += realDt;
      const k = clamp(this.easeT / TUNE.juice.slowmoEase, 0, 1);
      this.timeScale = this.easeFrom + (1 - this.easeFrom) * easeInQuad(k);
      if (k >= 1) {
        this.easing = false;
        this.timeScale = 1;
      }
    }

    return realDt * this.timeScale;
  }

  reset(): void {
    this.timeScale = 1;
    this.hitstop = 0;
    this.holdTimer = 0;
    this.easing = false;
  }
}
