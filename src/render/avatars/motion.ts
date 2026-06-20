// Avatar visual layer — reusable motion recipes.
//
// SMIL snippet builders shared across the frame and the 24 scenes. The contract
// for accessibility (design §3.4): when `animated` is false every builder emits
// a fully-composed STILL — the element's base attributes already hold a
// representative value, and the `<animate*>` child is simply omitted. No
// element ever disappears in the static frame and there is no layout shift.
//
// Pure string builders; deterministic.

const RC = 'repeatCount="indefinite"';

/** Emit `inner` only when animated — the static escape hatch. */
export const when = (animated: boolean, inner: string): string => (animated ? inner : '');

/** Opacity breathe — a slow glow swell. Static base opacity should be the mid value. */
export function breathe(animated: boolean, lo: number, hi: number, dur: number): string {
  return when(animated, `<animate attributeName="opacity" values="${lo};${hi};${lo}" dur="${dur}s" ${RC}/>`);
}

/** Continuous rotation of the parent group. Static = frozen at `from`. */
export function spin(animated: boolean, dur: number, from = 0, to = 360): string {
  return when(animated, `<animateTransform attributeName="transform" type="rotate" from="${from}" to="${to}" dur="${dur}s" ${RC}/>`);
}

/** Twinkle — staggered opacity flicker for stars/jewels. */
export function twinkle(animated: boolean, dur: number, lo = 0.3, hi = 1): string {
  return when(animated, `<animate attributeName="opacity" values="${lo};${hi};${lo}" dur="${dur}s" ${RC}/>`);
}

/** Flowing-filament dash drift along a stroke. Static = a fixed dash pattern. */
export function drift(animated: boolean, to: number, dur: number, from = 0): string {
  return when(animated, `<animate attributeName="stroke-dashoffset" from="${from}" to="${to}" dur="${dur}s" ${RC}/>`);
}

/** Generic value-list attribute animation (escape hatch for bespoke motion). */
export function tween(
  animated: boolean,
  attr: string,
  values: string,
  dur: number,
  o: { keyTimes?: string; begin?: string } = {},
): string {
  const kt = o.keyTimes ? ` keyTimes="${o.keyTimes}"` : '';
  const bg = o.begin ? ` begin="${o.begin}"` : '';
  return when(animated, `<animate attributeName="${attr}" values="${values}"${kt} dur="${dur}s"${bg} ${RC}/>`);
}

/** Generic transform animation (translate/scale/rotate value-lists). */
export function tweenT(
  animated: boolean,
  type: 'translate' | 'scale' | 'rotate',
  values: string,
  dur: number,
  o: { keyTimes?: string; begin?: string } = {},
): string {
  const kt = o.keyTimes ? ` keyTimes="${o.keyTimes}"` : '';
  const bg = o.begin ? ` begin="${o.begin}"` : '';
  return when(animated, `<animateTransform attributeName="transform" type="${type}" values="${values}"${kt} dur="${dur}s"${bg} ${RC}/>`);
}

/** Traveling rim glint on a bezel circle. A bright short dash sweeps the ring;
 *  multiple glints are phased by `begin`. Static = a fixed highlight arc. */
export function glint(o: {
  uid: string;
  r: number;
  sw: number;
  lead: number;
  stroke: string;
  opacity: number;
  dur: number;
  phase?: number; // starting dashoffset (also the static resting position)
  animated: boolean;
}): string {
  const circ = Math.round(2 * Math.PI * o.r);
  const start = o.phase ?? 0;
  const end = start - circ;
  const a = when(o.animated, `<animate attributeName="stroke-dashoffset" values="${start};${end}" dur="${o.dur}s" ${RC}/>`);
  const off = start !== 0 ? ` stroke-dashoffset="${start}"` : '';
  return (
    `<circle r="${o.r}" fill="none" stroke="${o.stroke}" stroke-width="${o.sw}" stroke-linecap="round" ` +
    `stroke-dasharray="${o.lead} 9999" opacity="${o.opacity}"${off}>${a}</circle>`
  );
}

/** A particle/shard that flies out (opacity 0→1→fade + translate). Static =
 *  frozen mid-flight at ~60% travel with a representative opacity, so the burst
 *  still reads as a composed scene. */
export function flyOut(o: {
  shape: string;        // inner markup, e.g. a <polygon>/<circle> without transform/opacity
  dx: number;
  dy: number;
  dur: number;
  begin?: number;
  animated: boolean;
  peak?: number;        // peak opacity (default 1)
  staticAt?: number;    // fraction of travel for the still (default 0.6)
}): string {
  const peak = o.peak ?? 1;
  if (!o.animated) {
    const f = o.staticAt ?? 0.6;
    return `<g transform="translate(${(o.dx * f).toFixed(1)} ${(o.dy * f).toFixed(1)})" opacity="${(peak * 0.85).toFixed(2)}">${o.shape}</g>`;
  }
  const bg = o.begin ? ` begin="${o.begin}s"` : '';
  return (
    `<g opacity="0">` +
    `<animate attributeName="opacity" values="0;${peak};${(peak * 0.9).toFixed(2)};0" keyTimes="0;0.12;0.6;1" dur="${o.dur}s"${bg} ${RC}/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${o.dx} ${o.dy}" dur="${o.dur}s"${bg} ${RC}/>` +
    `${o.shape}</g>`
  );
}
