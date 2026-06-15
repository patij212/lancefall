// src/slingshot.ts — the SLINGSHOT TETHER dash: an OPTIONAL alternate dash style
// (selectable on the title) that leaves the default Lance dash byte-identical.
// You "load" by holding — drifting backward against the tether, exposed — then
// release to SNAP forward, farther + faster than the Lance. Pure math; the same
// swept-spear / i-frame dash mechanism in player.ts fires it. NO new sim systems.
import { SLINGSHOT } from './tune';
import { chargeToLen, dashDuration } from './dash';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Backward "load" drift speed (px/s) at a given charge — the wind-up pull. */
export function loadDrift(charge: number): number {
  return SLINGSHOT.loadDrift * clamp01(charge);
}

/** The slingshot dash length for a charge — the range bonus RAMPS with charge so a
 *  tap is ~Lance length and only a full, exposed load earns the full fling. */
export function slingshotLen(charge: number, dashLenMul: number): number {
  const c = clamp01(charge);
  const mul = SLINGSHOT.lenMulMin + (SLINGSHOT.lenMul - SLINGSHOT.lenMulMin) * c;
  return chargeToLen(charge) * dashLenMul * mul;
}

/** Travel time for a slingshot dash of length `len` — a snappier, faster snap. */
export function slingshotDuration(len: number): number {
  return dashDuration(len) * SLINGSHOT.durMul;
}
