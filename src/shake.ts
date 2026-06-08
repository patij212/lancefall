// Nystrom trauma-model screen shake. Add trauma on impacts; shake = trauma²
// so small hits barely register and big chains rattle the whole arena. Decays
// in real time (so it keeps settling during a hitstop freeze).

import { TUNE } from './tune';
import { clamp } from './vec';

export class Shake {
  trauma = 0;
  private t = 0; // running time for smooth noise
  ox = 0;
  oy = 0;
  angle = 0;
  /** 0..1 user setting (1 = full), 0 disables shake entirely */
  intensity = 1;

  add(amount: number): void {
    this.trauma = clamp(this.trauma + amount * this.intensity, 0, 1);
  }

  /** Advance on real dt and compute this frame's offset. */
  update(realDt: number): void {
    this.t += realDt;
    this.trauma = Math.max(0, this.trauma - TUNE.juice.traumaDecay * realDt);
    const s = this.trauma * this.trauma;
    // cheap smooth-ish noise via layered sines at different frequencies
    const n1 = Math.sin(this.t * 47.0) * 0.6 + Math.sin(this.t * 91.7) * 0.4;
    const n2 = Math.sin(this.t * 53.3 + 1.7) * 0.6 + Math.sin(this.t * 83.1 + 0.4) * 0.4;
    const n3 = Math.sin(this.t * 61.1 + 3.1);
    this.ox = TUNE.juice.maxShake * s * n1;
    this.oy = TUNE.juice.maxShake * s * n2;
    this.angle = TUNE.juice.maxShakeAngle * s * n3;
  }

  reset(): void {
    this.trauma = 0;
    this.ox = this.oy = this.angle = 0;
  }
}
