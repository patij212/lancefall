// LANCEFALL — fall. A lance plunging point-down out of the dark, a luminous
// trail streaming up behind it, toward a glowing horizon over the fallen city
// below — the impact already blooming. The name made literal: the lance, falling.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift, breathe, tween } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;

  // shaft gradient keyed to the accent
  const defs =
    `<defs><linearGradient id="${id('fshaft')}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${tone(accent, 0.6, 0.24)}"/><stop offset="50%" stop-color="${p.core[0]}"/><stop offset="100%" stop-color="${tone(accent, 0.6, 0.24)}"/></linearGradient></defs>`;

  // descending light streaks in the dark
  const streak = (x: number, sw: number, dash: string, d: number) =>
    `<line x1="${x}" y1="-64" x2="${x - 4}" y2="46" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.16" stroke-linecap="round">${drift(a, 130, d)}</line>`;
  const streaks = `<g>${streak(-40, 0.8, '3 16', 5)}${streak(-14, 0.7, '2 18', 6.4)}${streak(20, 0.8, '3 14', 4.6)}${streak(44, 0.6, '2 20', 7)}</g>`;

  // horizon + fallen skyline + impact bloom where the lance lands
  const horizon =
    `<rect x="-66" y="44" width="132" height="6" fill="${u('core', uid)}" opacity="0.5"/>` +
    `<line x1="-60" y1="46" x2="60" y2="46" stroke="${p.light}" stroke-width="0.8" opacity="0.5"/>` +
    `<g fill="${tone(accent, 0.7, 0.14)}" opacity="0.9">` +
    `<rect x="-58" y="32" width="11" height="14"/><rect x="-44" y="26" width="8" height="20"/><rect x="-33" y="34" width="10" height="12"/>` +
    `<rect x="-18" y="28" width="7" height="18"/><rect x="13" y="30" width="8" height="16"/><rect x="24" y="24" width="9" height="22"/><rect x="37" y="32" width="11" height="14"/><rect x="50" y="28" width="8" height="18"/></g>` +
    `<ellipse cx="0" cy="46" rx="22" ry="7" fill="${u('core', uid)}" opacity="${a ? 0.3 : 0.4}">${breathe(a, 0.18, 0.5, 2.4)}</ellipse>`;

  // the luminous trail streaming up off the falling lance
  const trail =
    `<path d="M -3 -16 L 0 -62 L 3 -16 Z" fill="${u('core', uid)}" opacity="0.45"/>` +
    `<line x1="0" y1="-16" x2="0" y2="-58" stroke="${p.core[0]}" stroke-width="1" opacity="0.7" stroke-dasharray="2 5">${a ? '<animate attributeName="stroke-dashoffset" from="0" to="14" dur="0.6s" repeatCount="indefinite"/>' : ''}</line>`;

  // the plunging lance (point down): butt up, shaft, head with tip near y≈34
  const lanceBody =
    `<g fill="${accent}"><path d="M -5 -22 L 0 -28 L 5 -22 L 0 -25 Z"/></g>` +
    `<polygon points="0,-22 -4,-17 0,-13 4,-17" fill="${p.hilite}"/>` +
    `<rect x="-1.8" y="-20" width="3.6" height="36" rx="1.4" fill="url(#${id('fshaft')})"/>` +
    `<g stroke="${tone(accent, 0.8, 0.1)}" stroke-width="2" opacity="0.8"><line x1="-2.6" y1="-8" x2="2.6" y2="-8"/><line x1="-2.6" y1="2" x2="2.6" y2="2"/></g>` +
    `<rect x="-2.6" y="13" width="5.2" height="5" rx="1" fill="${p.deep}" stroke="${p.hilite}" stroke-width="0.5"/>` +
    `<path d="M 0 18 Q -7 26 -4 36 L 0 44 L 4 36 Q 7 26 0 18 Z" fill="url(#${id('fshaft')})"/>` +
    `<line x1="0" y1="21" x2="0" y2="42" stroke="#ffffff" stroke-width="0.6" opacity="0.85"/>` +
    `<polygon points="-0.8,40 0,46 0.8,40" fill="#ffffff" filter="${u('bl', uid)}"/>`;
  const plunge = a
    ? `<g transform="translate(0,-6)"><animateTransform attributeName="transform" type="translate" values="0 -14;0 2;0 -14" dur="3.6s" repeatCount="indefinite"/>${lanceBody}</g>`
    : `<g transform="translate(0,-4)">${lanceBody}</g>`;

  // impact spark flash at the tip when it nears the city
  const flash = a
    ? `<circle cx="0" cy="40" r="14" fill="${u('core', uid)}" opacity="0">${tween(a, 'opacity', '0;0;0.7;0;0', 3.6, { keyTimes: '0;0.42;0.5;0.7;1' })}</circle>`
    : `<circle cx="0" cy="40" r="10" fill="${u('core', uid)}" opacity="0.3"/>`;

  return (
    defs +
    coreGlow(ctx, { r: 58, op: 0.12, lo: 0.08, hi: 0.18, dur: 5 }) +
    starfield(ctx, [[-44, -46, 1, 2.6, 0.4], [34, -50, 0.9, 3.1, 0.6], [50, -34, 0.8, 2.2, 0.3], [-52, -26, 0.7, 3.6, 0.5]]) +
    streaks + horizon + trail + flash + plunge
  );
}
