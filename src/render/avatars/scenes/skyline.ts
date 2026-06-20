// THE CITY — flicker. The neon skyline of Lancefall: a back haze layer and a
// front silhouette of towers, windows flickering on against a horizon glow.
// The city the whole game is trying to bring back.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tweenT } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const back = tone(accent, 0.6, 0.2);
  const front = tone(accent, 0.7, 0.12);

  // a lit window — flickers when animated, steady-lit when static (no <animate>)
  const win = (x: number, y: number, dur: number, lo: number, fill: string) =>
    a
      ? `<rect x="${x}" y="${y}" width="2" height="2.4" fill="${fill}" opacity="${lo}"><animate attributeName="opacity" values="${lo};1;${lo}" dur="${dur}s" repeatCount="indefinite"/></rect>`
      : `<rect x="${x}" y="${y}" width="2" height="2.4" fill="${fill}" opacity="0.7"/>`;

  const horizon =
    `<rect x="-66" y="34" width="132" height="22" fill="${u('core', ctx.uid)}" opacity="0.4"/>` +
    `<line x1="-62" y1="40" x2="62" y2="40" stroke="${p.light}" stroke-width="0.7" opacity="0.5"/>`;

  // back haze layer of towers (slow parallax drift)
  const backLayer =
    `<g fill="${back}" opacity="0.65">${tweenT(a, 'translate', '-3 0;3 0;-3 0', 14)}` +
    `<rect x="-60" y="6" width="10" height="36"/><rect x="-46" y="-2" width="8" height="44"/><rect x="-34" y="10" width="11" height="32"/>` +
    `<rect x="-8" y="0" width="9" height="42"/><rect x="6" y="8" width="10" height="34"/><rect x="22" y="-4" width="8" height="46"/>` +
    `<rect x="36" y="6" width="11" height="36"/><rect x="50" y="12" width="9" height="30"/></g>`;

  // front silhouette of towers
  const front_towers =
    `<g fill="${front}">` +
    `<rect x="-54" y="16" width="16" height="26"/><rect x="-36" y="2" width="14" height="40"/><rect x="-20" y="20" width="12" height="22"/>` +
    `<polygon points="-2,42 -2,-6 7,-16 16,-6 16,42"/><rect x="22" y="10" width="15" height="32"/><rect x="40" y="-2" width="13" height="44"/></g>`;

  // antenna beacons + lit windows
  const beacons = `${win(3, -22, 1.4, 0.3, p.core[0])}${win(45, -8, 1.8, 0.4, p.core[0])}${win(-31, -4, 2.2, 0.3, p.core[0])}`;
  const windows = (
    [[-50, 22, 2.3, 0.25], [-46, 28, 3.1, 0.3], [-32, 8, 2.0, 0.2], [-28, 16, 3.4, 0.35],
     [-16, 26, 2.6, 0.3], [1, 4, 2.9, 0.25], [5, 14, 2.1, 0.3], [9, 24, 3.6, 0.35],
     [26, 18, 2.4, 0.3], [31, 26, 3.0, 0.25], [44, 6, 2.2, 0.3], [48, 18, 3.3, 0.35]] as [number, number, number, number][]
  ).map(([x, y, dur, lo]) => win(x, y, dur, lo, p.light)).join('');

  return (
    coreGlow(ctx, { r: 58, op: 0.1, lo: 0.07, hi: 0.16, dur: 5 }) +
    starfield(ctx, [[-44, -44, 1, 2.6, 0.4], [30, -50, 0.9, 3.1, 0.6], [50, -32, 0.8, 2.2, 0.3], [-52, -22, 0.7, 3.6, 0.5], [12, -54, 0.7, 2.9, 0.4]]) +
    horizon + backLayer + front_towers + beacons + windows
  );
}
