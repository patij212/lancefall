// Temporary composed scene for sigils not yet hand-built. Still a *filled*
// scene (core glow + resonance rings + a faceted accent gem + twinkles) so the
// gallery shows the frame working on all 24 while bespoke scenes land in batches.
// Each scenes/<id>.ts that still delegates here gets replaced with its own scene.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe, spin, twinkle, drift, tweenT } from '../motion';

export function placeholderScene(ctx: SceneCtx): string {
  const { uid, accent, animated } = ctx;
  const p = paletteFor(accent);
  const u = (n: string) => `url(#${n}-${uid})`;
  const star = (cx: number, cy: number, r: number, dur: number, lo: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${lo}">${twinkle(animated, dur, lo, 1)}</circle>`;
  const gem =
    `<g>${tweenT(animated, 'scale', '0.92;1.07;0.92', 3.4)}` +
    `<polygon points="0,-19 16,0 0,19 -16,0" fill="${u('core')}"/>` +
    `<polygon points="0,-11 9,0 0,11 -9,0" fill="${p.core[0]}"/>` +
    `<g stroke="${p.deep}" stroke-width="0.5" opacity="0.85"><line x1="0" y1="-19" x2="0" y2="19"/><line x1="-16" y1="0" x2="16" y2="0"/></g></g>`;
  return (
    `<circle r="62" fill="${u('core')}" opacity="0.18">${breathe(animated, 0.12, 0.26, 4.2)}</circle>` +
    `<g fill="${p.light}">${star(-40, -28, 1, 2.6, 0.3)}${star(40, -36, 0.9, 3.1, 0.4)}${star(46, 22, 1, 2.2, 0.3)}${star(-28, 42, 0.8, 3.6, 0.5)}</g>` +
    `<g fill="none">` +
    `<circle r="54" stroke="${tone(accent, 0.7, 0.4)}" stroke-width="0.7" stroke-dasharray="3 6" opacity="0.5"/>` +
    `<circle r="42" stroke="${p.mid}" stroke-width="1" opacity="0.55"/>` +
    `<circle r="30" stroke="${p.light}" stroke-width="1.2" opacity="0.7"/></g>` +
    `<circle r="48" fill="none" stroke="${accent}" stroke-width="1.4" stroke-dasharray="5 11" opacity="0.8">${drift(animated, -160, 7)}</circle>` +
    `<circle r="58" fill="none" stroke="${accent}" stroke-width="1.2" stroke-dasharray="2 12" opacity="0.6">${spin(animated, 22)}</circle>` +
    gem +
    `<circle r="2.6" fill="${p.core[0]}"/>`
  );
}
