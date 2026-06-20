// SOLSTICE — shine. The gold flagship sun: a many-pointed corona star with a
// pulsing core and a shimmering ring, regal and centred. The SOLSTICE PROTOCOL
// crest — won THE LONGEST DAY.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, twinkle } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const gold = tone(accent, 1, 0.6);

  // long + short corona rays (alternating), slowly rotating
  const corona = (n: number, rIn: number, long: number, short: number) => {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = ((i * (360 / (n * 2))) - 90) * (Math.PI / 180);
      const r = i % 2 === 0 ? long : short;
      pts.push(`${(Math.cos(ang) * r).toFixed(1)},${(Math.sin(ang) * r).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${gold}" opacity="0.5"/>` +
      `<circle r="${rIn}" fill="${tone(accent, 0.8, 0.18)}"/>`;
  };
  const corona1 = `<g>${spin(a, 70)}${corona(12, 26, 58, 34)}</g>`;
  const corona2 = `<g opacity="0.6">${spin(a, 48, 360, 0)}${corona(8, 20, 44, 28)}</g>`;

  // shimmer ring
  const shimmerRing = `<circle r="30" fill="none" stroke="${p.core[0]}" stroke-width="1" stroke-dasharray="2 6" opacity="0.6">${spin(a, 24)}</circle>`;

  // pulsing sun core
  const core =
    `<g>${breathe(a, 0.85, 1, 3)}` +
    `<circle r="22" fill="${u('core', uid)}" opacity="0.95"/>` +
    `<circle r="15" fill="${gold}"/>` +
    `<circle r="15" fill="none" stroke="${p.core[0]}" stroke-width="0.8" opacity="0.7"/>` +
    `<circle r="7" fill="${p.core[0]}"/></g>`;

  // a flagship sparkle at the very centre
  const sparkle = `<g fill="${p.core[0]}"><polygon points="0,-30 2,-6 0,0 -2,-6" opacity="${a ? 0.6 : 0.8}">${twinkle(a, 2.4, 0.4, 1)}</polygon><polygon points="0,30 2,6 0,0 -2,6" opacity="${a ? 0.6 : 0.8}">${twinkle(a, 2.4, 0.4, 1)}</polygon></g>`;

  return (
    coreGlow(ctx, { r: 60, op: 0.2, lo: 0.14, hi: 0.34, dur: 3.4 }) +
    corona1 + corona2 + shimmerRing + core + sparkle
  );
}
