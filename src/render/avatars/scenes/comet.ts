// DASH — dash. A comet head with a segmented, tapering trail streaks diagonally
// across the field through motion-blur streaks, then loops. The momentum-dash
// that defines the game's movement, as a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, drift, tweenT } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.6;

  // background motion-blur streaks along the dash axis
  const streak = (off: number, sw: number, dash: string, d: number) =>
    `<line x1="-66" y1="${off}" x2="62" y2="${off - 22}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.14" stroke-linecap="round">${drift(a, -80, d)}</line>`;
  const field = `<g transform="rotate(8)">${streak(-30, 0.8, '4 14', 3)}${streak(0, 0.7, '3 16', 3.6)}${streak(30, 0.8, '4 12', 2.8)}</g>`;

  // a faint dashed orbit ring for atmosphere
  const orbit = `<circle r="52" fill="none" stroke="${p.deep}" stroke-width="0.7" stroke-dasharray="2 10" opacity="0.4">${spin(a, 30)}</circle>`;

  // the comet — head + 6 tapering trail blobs, built along -x so it points +x
  const trail = [
    [-9, 3.0, 0.9], [-17, 2.5, 0.7], [-25, 2.0, 0.55], [-33, 1.5, 0.4], [-41, 1.1, 0.28], [-49, 0.7, 0.16],
  ]
    .map(([x, r, o]) => `<circle cx="${x}" cy="0" r="${r}" fill="${accent}" opacity="${o}"/>`)
    .join('');
  const cometGlyph =
    `<g>` +
    `<path d="M 0 0 L -52 4 L -52 -4 Z" fill="${tone(accent, 0.8, 0.5)}" opacity="0.3"/>` +
    trail +
    `<circle r="5" fill="${accent}" opacity="0.4" filter="${u('bl', uid)}"/>` +
    `<circle r="3.4" fill="${p.core[0]}"/>` +
    `<circle r="1.4" fill="#ffffff"/></g>`;
  // dash diagonally bottom-left → top-right, looping; angled to the path
  const comet = a
    ? `<g transform="rotate(-10)"><g transform="translate(-46,0)">${tweenT(a, 'translate', '-46 0;48 0;48 0', dur, { keyTimes: '0;0.6;1' })}` +
      `<g opacity="1"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.55;0.66;1" dur="${dur}s" repeatCount="indefinite"/>${cometGlyph}</g></g></g>`
    : `<g transform="rotate(-10)"><g transform="translate(6,0)">${cometGlyph}</g></g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.2 }) +
    starfield(ctx, [[-44, -30, 0.9, 2.6, 0.3], [42, -38, 0.8, 3.1, 0.5], [48, 26, 0.9, 2.2, 0.3], [-38, 42, 0.8, 3.6, 0.5], [10, -50, 0.7, 2.9, 0.4]]) +
    field + orbit + comet
  );
}
