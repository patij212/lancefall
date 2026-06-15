// JuiceBudget — a per-FRAME coordinator for screen-wide "feel" effects.
//
// On a big dash-chain, several screen-wide effects can fire in the SAME frame:
// the chain slow-mo (shake spike + slow-mo snap + zoom), and — if a combo
// milestone lands the same frame — a COMBO ERUPTION (its own big flash + snap +
// shake spike + nova). Stacked, that reads as NOISE: a double shake jolt, two
// overlapping slow-mo snaps, two full-frame flashes washing each other out.
//
// This budget lets the game CLAIM each screen-wide channel once per frame. The
// first claimer wins (it's the bigger, earlier event); redundant follow-ups are
// suppressed so a big chain reads CLEAN, not busy. The scheduler already debounces
// the slow-mo SCALE/HOLD via min()/max(); this debounces the per-event AUDIO snap
// and the screen FLASH/SHAKE-SPIKE that the scheduler doesn't see.
//
// Purely cosmetic: it gates audio/flash/shake only — never world.rng, never the
// sim. Reset once per display frame (beginFrame).

export class JuiceBudget {
  private _shakeSpike = false; // a big screen-wide shake kick claimed this frame
  private _slowmoSnap = false; // the slow-mo "snap" audio sting claimed this frame
  private _bigFlash = false; // a full-frame flash claimed this frame

  /** Reset every display frame. Call once at the top of the frame, before any
   *  effect-emitting sim substep runs. */
  beginFrame(): void {
    this._shakeSpike = false;
    this._slowmoSnap = false;
    this._bigFlash = false;
  }

  /** Claim the big screen-shake spike. Returns true the FIRST time per frame
   *  (the caller should add its spike), false afterwards (suppress the redundant
   *  jolt — per-kill micro-shake is unaffected and still accumulates). */
  claimShakeSpike(): boolean {
    if (this._shakeSpike) return false;
    this._shakeSpike = true;
    return true;
  }

  /** Claim the slow-mo "snap" audio sting. The scheduler already debounces the
   *  slow-mo window itself; this stops two clutch/chain events from double-firing
   *  the snap in one frame (the stutter). */
  claimSlowmoSnap(): boolean {
    if (this._slowmoSnap) return false;
    this._slowmoSnap = true;
    return true;
  }

  /** Claim a full-frame flash. Renderer.flash already max()-merges alpha, so a
   *  second flash can only fail to brighten — but claiming keeps the FRAME reading
   *  as one event and lets the caller skip the paired nova/aberration too. */
  claimBigFlash(): boolean {
    if (this._bigFlash) return false;
    this._bigFlash = true;
    return true;
  }
}
