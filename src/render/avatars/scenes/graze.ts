// GRAZE — skim. The dart sweeps a tight arc that just kisses the edge of a big
// incoming bullet-orb — a spark fan firing and a graze-ring pinging at the
// near-miss. The reward for cutting it close, made a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.8;
  const danger = '#ff5a7d';

  // the big incoming bullet-orb with a pulsing danger aura
  const orb =
    `<circle cx="14" cy="-4" r="22" fill="none" stroke="${danger}" stroke-width="1" opacity="${a ? 0.4 : 0.5}">${breathe(a, 0.2, 0.5, 2)}</circle>` +
    `<circle cx="14" cy="-4" r="15" fill="${danger}" opacity="0.22" filter="${u('bl', uid)}"/>` +
    `<circle cx="14" cy="-4" r="9" fill="${tone(danger, 0.9, 0.18)}" stroke="${danger}" stroke-width="1.4"/>` +
    `<circle cx="14" cy="-4" r="3.4" fill="#ffd0da"/>`;

  // the graze path the dart rides (tangent to the orb) — drawn faint as the route
  const path = 'M -52 34 Q -2 -34 50 16';
  const route = `<path d="${path}" fill="none" stroke="${accent}" stroke-width="0.8" stroke-dasharray="2 7" opacity="0.4"/>`;
  // a bright graze-arc that lights along the route near the kiss
  const grazeArc = `<path d="M -22 -8 Q -2 -22 22 -14" fill="none" stroke="${p.core[0]}" stroke-width="1.6" stroke-linecap="round" opacity="${a ? 0.5 : 0.7}">${a ? '<animate attributeName="opacity" values="0.2;0.9;0.2" dur="2.8s" repeatCount="indefinite"/>' : ''}</path>`;

  // the graze point — spark fan + ring ping at closest approach
  const gx = -1, gy = -19;
  const sparks = a
    ? Array.from({ length: 6 }, (_, i) => {
        const ang = (i * 60 - 90) * (Math.PI / 180);
        return `<line x1="${gx}" y1="${gy}" x2="${(gx + Math.cos(ang) * 15).toFixed(1)}" y2="${(gy + Math.sin(ang) * 15).toFixed(1)}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.4;0.5;0.62;1" dur="${dur}s" repeatCount="indefinite"/></line>`;
      }).join('')
    : Array.from({ length: 6 }, (_, i) => {
        const ang = (i * 60 - 90) * (Math.PI / 180);
        return `<line x1="${gx}" y1="${gy}" x2="${(gx + Math.cos(ang) * 11).toFixed(1)}" y2="${(gy + Math.sin(ang) * 11).toFixed(1)}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`;
      }).join('');
  const ping = a
    ? `<circle cx="${gx}" cy="${gy}" r="6" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0"><animate attributeName="r" values="4;4;16;16" keyTimes="0;0.4;0.6;1" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.85;0;0" keyTimes="0;0.4;0.48;0.62;1" dur="${dur}s" repeatCount="indefinite"/></circle>`
    : `<circle cx="${gx}" cy="${gy}" r="12" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.4"/>`;

  // the dart riding the path (animateMotion); parked at the graze point when static
  const dartGlyph = `<g><circle r="7" fill="${tone(accent, 1, 0.5)}" opacity="0.25"/><polygon points="0,-6 5,4 -5,4" fill="${p.core[0]}"/><circle r="1.6" fill="${p.hilite}"/></g>`;
  const dart = a
    ? `<g><animateMotion path="${path}" dur="${dur}s" rotate="auto" repeatCount="indefinite"/>${dartGlyph}</g>`
    : `<g transform="translate(${gx},${gy})">${dartGlyph}</g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.4 }) +
    starfield(ctx, [[-48, -40, 0.9, 2.6, 0.3], [44, 34, 0.8, 3.1, 0.5], [-40, 44, 0.8, 2.2, 0.4]]) +
    route + orb + grazeArc + ping + sparks + dart
  );
}
