// Shared scene atmosphere — keeps the family coherent (the same core glow +
// twinkling starfield the hero scenes use) and the per-scene files small.
// Pure; static-aware.

import type { SceneCtx } from '../registry';
import { tone } from '../primitives';
import { breathe, twinkle } from '../motion';

/** `url(#name-uid)` for a scene. */
export const u = (name: string, uid: string): string => `url(#${name}-${uid})`;

/** Soft central core glow. Pass lo/hi/dur to breathe. */
export function coreGlow(ctx: SceneCtx, o: { r?: number; op?: number; lo?: number; hi?: number; dur?: number } = {}): string {
  const r = o.r ?? 62;
  const op = o.op ?? 0.14;
  const b = o.lo !== undefined ? breathe(ctx.animated, o.lo, o.hi ?? o.lo + 0.14, o.dur ?? 4) : '';
  return `<circle r="${r}" fill="${u('core', ctx.uid)}" opacity="${op}">${b}</circle>`;
}

/** Twinkling starfield from [cx, cy, r, dur, lo] tuples. */
export function starfield(ctx: SceneCtx, pts: [number, number, number, number, number][]): string {
  const fill = tone(ctx.accent, 0.6, 0.78);
  const dots = pts
    .map(([cx, cy, r, dur, lo]) => `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${ctx.animated ? lo : 0.7}">${twinkle(ctx.animated, dur, lo, 1)}</circle>`)
    .join('');
  return `<g fill="${fill}">${dots}</g>`;
}
