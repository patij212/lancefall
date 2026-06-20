// HEATFORGED — burn. A forged crest ringed by a wreath of flickering flame
// tongues, heat-shimmer rising off it, embers lifting. Survived the Heat ladder
// and came out tempered.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift, tweenT } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const warm = tone(accent, 1, 0.55);
  const deep = tone(accent, 1, 0.38);

  // wreath of flame tongues around the rim
  const tongues = Array.from({ length: 10 }, (_, i) => {
    const ang = i * 36;
    const dur = 1.4 + (i % 4) * 0.3;
    const flick = a ? `<animateTransform attributeName="transform" type="scale" values="1 0.85;1 1.15;1 0.85" dur="${dur}s" repeatCount="indefinite"/>` : '';
    return (
      `<g transform="rotate(${ang})">` +
      `<g transform="translate(0,-44)"><g>${flick}` +
      `<path d="M 0 10 C 6 2 5 -6 0 -14 C -5 -6 -6 2 0 10 Z" fill="${i % 2 ? warm : deep}" opacity="0.9"/></g></g></g>`
    );
  }).join('');

  // heat-shimmer — wavy vertical lines drifting up
  const shimmer = (x: number, d: number) =>
    `<path d="M ${x} 30 q 5 -10 0 -20 q -5 -10 0 -20" fill="none" stroke="${warm}" stroke-width="0.8" opacity="0.25" stroke-dasharray="3 6">${drift(a, -40, d)}</path>`;
  const shimmers = `<g>${shimmer(-22, 4)}${shimmer(0, 5)}${shimmer(22, 4.5)}</g>`;

  // central forged crest — a hot diamond anvil-mark
  const crest =
    `<g>${tweenT(a, 'scale', '0.94;1.06;0.94', 2.6)}` +
    `<polygon points="0,-22 18,0 0,22 -18,0" fill="${u('core', uid)}"/>` +
    `<polygon points="0,-14 11,0 0,14 -11,0" fill="${deep}"/>` +
    `<polygon points="0,-8 6,0 0,8 -6,0" fill="${p.core[0]}"/>` +
    `<line x1="-18" y1="0" x2="18" y2="0" stroke="${p.hilite}" stroke-width="0.7" opacity="0.7"/></g>`;

  // embers rising
  const ember = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="20" r="${r}" opacity="0"><animate attributeName="cy" values="24;-30" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0" keyTimes="0;0.3;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-4" r="${r}" opacity="0.6"/>`;
  const embers = `<g fill="${p.hilite}" filter="${u('blS', uid)}">${ember(-14, 1, 3.4, '0s')}${ember(12, 0.9, 4.2, '1.5s')}${ember(0, 1.1, 3.8, '2.6s')}</g>`;

  return (
    coreGlow(ctx, { op: 0.18, lo: 0.12, hi: 0.3, dur: 3 }) +
    `<g opacity="0.95">${tongues}</g>` + shimmers + embers + crest
  );
}
