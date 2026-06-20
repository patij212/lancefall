// LAST BREATH — clutch. An hourglass nearly run out; at the final grain a clutch
// spark fires the second wind and a slow time-ripple spreads. The bullet-time
// save, caught and held.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const cyc = 4.2;

  // slow time-ripple rings (dilated time)
  const ripple = (begin: number) =>
    a
      ? `<circle fill="none" stroke="${accent}" stroke-width="1.2" opacity="0"><animate attributeName="r" values="10;56" dur="${cyc}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0" dur="${cyc}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle r="${20 + begin * 8}" fill="none" stroke="${accent}" stroke-width="1.1" opacity="${0.35 - begin * 0.2}"/>`;
  const ripples = ripple(0) + ripple(cyc * 0.5);

  // hourglass frame
  const frame =
    `<g stroke="${p.light}" stroke-width="2" fill="none" stroke-linecap="round">` +
    `<line x1="-20" y1="-34" x2="20" y2="-34"/><line x1="-20" y1="34" x2="20" y2="34"/></g>` +
    `<path d="M -16 -32 L 16 -32 L 2 0 L 16 32 L -16 32 L -2 0 Z" fill="${tone(accent, 0.7, 0.1)}" fill-opacity="0.4" stroke="${accent}" stroke-width="1.6"/>`;

  // sand — top bulb draining, bottom bulb filling, a thin falling stream
  const sandTop = a
    ? `<path d="M -11 -26 L 11 -26 L 4 -12 L -4 -12 Z" fill="${tone(accent, 0.8, 0.55)}"><animate attributeName="opacity" values="1;0.25;1" dur="${cyc}s" repeatCount="indefinite"/></path>`
    : `<path d="M -8 -24 L 8 -24 L 3 -14 L -3 -14 Z" fill="${tone(accent, 0.8, 0.55)}" opacity="0.7"/>`;
  const sandBottom = `<path d="M -13 30 L 13 30 L 6 16 Q 0 12 -6 16 Z" fill="${tone(accent, 0.8, 0.55)}"/>`;
  const stream = `<line x1="0" y1="-6" x2="0" y2="14" stroke="${p.core[0]}" stroke-width="1" opacity="0.8" stroke-dasharray="1 3">${a ? '<animate attributeName="stroke-dashoffset" from="0" to="-8" dur="0.5s" repeatCount="indefinite"/>' : ''}</line>`;

  // the clutch spark at the pinch — fires the second wind
  const spark = a
    ? `<g><circle r="4" fill="${p.core[0]}" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.5;0.58;0.72;1" dur="${cyc}s" repeatCount="indefinite"/><animate attributeName="r" values="2;2;9;2;2" keyTimes="0;0.5;0.6;0.72;1" dur="${cyc}s" repeatCount="indefinite"/></circle>` +
      Array.from({ length: 6 }, (_, i) => {
        const ang = (i * 60 - 90) * (Math.PI / 180);
        return `<line x1="0" y1="0" x2="${(Math.cos(ang) * 14).toFixed(1)}" y2="${(Math.sin(ang) * 14).toFixed(1)}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.52;0.6;0.74;1" dur="${cyc}s" repeatCount="indefinite"/></line>`;
      }).join('') + `</g>`
    : `<g><circle r="4.5" fill="${p.core[0]}" opacity="0.7"/></g>`;

  return (
    coreGlow(ctx, { op: 0.15, lo: 0.1, hi: 0.24, dur: cyc }) +
    ripples +
    `<circle r="28" fill="${u('core', uid)}" opacity="0.2">${breathe(a, 0.12, 0.3, cyc)}</circle>` +
    frame + sandBottom + sandTop + stream + spark
  );
}
