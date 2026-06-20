// LANCEFALL — fall. A falling star streaks down toward a glowing horizon over a
// faint fallen-city skyline, trailing light, with descending streaks drifting in
// the dark. The name made literal: the light comes down.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tween, drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 3.4;

  // horizon glow band + faint skyline silhouette (clipped feel, low in the hex)
  const horizon =
    `<rect x="-66" y="40" width="132" height="6" fill="${u('core', uid)}" opacity="0.5"/>` +
    `<line x1="-60" y1="42" x2="60" y2="42" stroke="${p.light}" stroke-width="0.8" opacity="0.55"/>` +
    `<g fill="${tone(accent, 0.7, 0.16)}" opacity="0.9">` +
    `<rect x="-58" y="26" width="12" height="16"/><rect x="-42" y="18" width="9" height="24"/><rect x="-30" y="30" width="11" height="12"/>` +
    `<rect x="-15" y="22" width="8" height="20"/><rect x="-4" y="12" width="10" height="30"/><rect x="9" y="28" width="9" height="14"/>` +
    `<rect x="21" y="20" width="8" height="22"/><rect x="32" y="30" width="12" height="12"/><rect x="47" y="24" width="9" height="18"/></g>`;

  // descending light streaks drifting in the background
  const streak = (x: number, sw: number, dash: string, d: number) =>
    `<line x1="${x}" y1="-64" x2="${x - 10}" y2="44" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.18" stroke-linecap="round">${drift(a, 120, d)}</line>`;
  const streaks = `<g>${streak(-34, 0.8, '3 16', 5)}${streak(-2, 0.7, '2 18', 6.5)}${streak(28, 0.8, '3 14', 4.4)}${streak(48, 0.6, '2 20', 7)}</g>`;

  // the falling star — bright head + tapering trail, falling top → horizon
  const starGlyph =
    `<g>` +
    `<path d="M 0 -10 L 5 -22 L 0 -10 Z" fill="none"/>` +
    `<path d="M 1.6 -8 L 9 -34 L -6 -2 Z" fill="${accent}" opacity="0.5"/>` +
    `<path d="M 1 -6 L 5 -24 L -3 -1 Z" fill="${p.light}" opacity="0.7"/>` +
    `<circle r="3.2" fill="${p.core[0]}"/>` +
    `<circle r="6" fill="none" stroke="${p.hilite}" stroke-width="0.8" opacity="0.6"/>` +
    `</g>`;
  const star = a
    ? `<g transform="translate(-22,-54)"><animateTransform attributeName="transform" type="translate" values="-22 -54;14 38;14 38" keyTimes="0;0.55;1" dur="${dur}s" repeatCount="indefinite"/>` +
      `<g opacity="1"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.1;0.5;0.62;1" dur="${dur}s" repeatCount="indefinite"/>${starGlyph}</g></g>`
    : `<g transform="translate(-2,-6)">${starGlyph}</g>`;

  // impact bloom at the horizon when the star lands
  const bloom = a
    ? `<circle cx="14" cy="40" r="20" fill="${u('core', uid)}" opacity="0">${tween(a, 'opacity', '0;0;0.7;0;0', dur, { keyTimes: '0;0.5;0.58;0.78;1' })}</circle>`
    : `<circle cx="14" cy="40" r="14" fill="${u('core', uid)}" opacity="0.3"/>`;

  return (
    coreGlow(ctx, { r: 58, op: 0.12, lo: 0.08, hi: 0.18, dur: 5 }) +
    starfield(ctx, [[-44, -44, 1, 2.6, 0.4], [30, -50, 0.9, 3.1, 0.6], [50, -30, 0.8, 2.2, 0.3], [-52, -18, 0.7, 3.6, 0.5], [40, -10, 0.7, 2.9, 0.4]]) +
    streaks + horizon + bloom + star
  );
}
