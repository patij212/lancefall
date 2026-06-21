// THE MIRRORBLADE — mirror. Your doubt as a reflection across a mirror seam: the
// lance above in the boss's red, its rippling reflection below in the player's
// own cyan, lunging in mirror-sync. "Tell me which of us is real."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

const PLAYER_CYAN = '#7df9ff';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a lance pointing up (tip at y≈-30, butt at y≈22), coloured
  const vlance = (color: string) =>
    `<g>` +
    `<polygon points="-4,24 0,28 4,24 0,26" fill="${color}"/>` +
    `<rect x="-1.8" y="-10" width="3.6" height="34" rx="1.4" fill="${color}"/>` +
    `<g stroke="${tone(color, 0.9, 0.1)}" stroke-width="2" opacity="0.8"><line x1="-2.6" y1="2" x2="2.6" y2="2"/><line x1="-2.6" y1="12" x2="2.6" y2="12"/></g>` +
    `<rect x="-2.6" y="-12" width="5.2" height="5" rx="1" fill="${tone(color, 0.9, 0.42)}" stroke="${tone(color, 0.5, 0.85)}" stroke-width="0.5"/>` +
    `<path d="M 0 -30 Q 6 -18 4 -10 L 0 -8 L -4 -10 Q -6 -18 0 -30 Z" fill="${color}"/>` +
    `<line x1="0" y1="-27" x2="0" y2="-10" stroke="#ffffff" stroke-width="0.6" opacity="0.85"/>` +
    `<polygon points="-0.8,-26 0,-31 0.8,-26" fill="#ffffff" filter="${u('bl', uid)}"/>` +
    `</g>`;

  const lunge = (a ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0;0 0" keyTimes="0;0.3;0.6;1" dur="2.6s" repeatCount="indefinite"/>` : '');

  // real lance — upper half, boss red
  const real = `<g transform="translate(0,-22)"><g>${lunge}${vlance(accent)}</g></g>`;
  // reflection — lower half, player cyan, flipped + faintly rippling, translucent
  const sway = a ? `<animateTransform attributeName="transform" type="translate" values="-1.5 0;1.5 0;-1.5 0" dur="3.4s" additive="sum" repeatCount="indefinite"/>` : '';
  const reflection =
    `<g transform="translate(0,22) scale(1,-1)" opacity="0.55"><g>${sway}<g>${lunge}${vlance(PLAYER_CYAN)}</g></g></g>`;

  // the mirror seam — reflective band + a shimmer travelling across it
  const seam =
    `<rect x="-62" y="-2.5" width="124" height="5" fill="${u('core', uid)}" opacity="0.18"/>` +
    `<line x1="-58" y1="0" x2="58" y2="0" stroke="${p.hilite}" stroke-width="1" opacity="0.6"/>` +
    `<line x1="-58" y1="0" x2="58" y2="0" stroke="${p.core[0]}" stroke-width="1.4" stroke-dasharray="12 26" opacity="0.7">${drift(a, -76, 3)}</line>`;

  // ripple lines across the reflection (water)
  const ripple = (y: number, d: number) =>
    `<line x1="-40" y1="${y}" x2="40" y2="${y}" stroke="${PLAYER_CYAN}" stroke-width="0.7" stroke-dasharray="6 14" opacity="0.22">${drift(a, 40, d)}</line>`;
  const ripples = `<g>${ripple(14, 4)}${ripple(28, 5.2)}${ripple(40, 4.6)}</g>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.09, hi: 0.22, dur: 4 }) +
    starfield(ctx, [[-46, -34, 0.9, 2.6, 0.3], [44, -34, 0.8, 3.1, 0.5], [-44, 42, 0.8, 2.2, 0.4], [44, 42, 0.8, 3.6, 0.4]]) +
    reflection + ripples + seam + real
  );
}
