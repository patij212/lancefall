// THE VIGIL — hold. A single flame held steady in a cradle, ringed by a soft
// halo, embers drifting slowly up. Almost still — steadiness is the whole point.
// The Vigil: defiance that chose to become peace.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const warm = tone(accent, 1, 0.55);
  const deep = tone(accent, 1, 0.4);

  // soft halo ring around the flame
  const halo =
    `<circle r="30" fill="${u('core', uid)}" opacity="0.4">${breathe(a, 0.28, 0.5, 4)}</circle>` +
    `<circle r="34" fill="none" stroke="${warm}" stroke-width="0.6" opacity="0.35">${breathe(a, 0.2, 0.45, 5)}</circle>`;

  // the flame — outer / mid / hot core, with a barely-there sway
  const flameOuter = `<path d="M 0 -34 C 11 -16 13 -2 7 9 C 4 15 -4 15 -7 9 C -13 -2 -11 -16 0 -34 Z" fill="${deep}" filter="${u('bl', uid)}"/>`;
  const flameMid = `<path d="M 0 -26 C 7 -12 8 -2 4 7 C 2 11 -2 11 -4 7 C -8 -2 -7 -12 0 -26 Z" fill="${warm}"/>`;
  const flameHot = `<path d="M 0 -16 C 4 -8 4 0 2 6 C 0 9 -2 8 -3 5 C -5 -1 -4 -9 0 -16 Z" fill="${p.core[0]}"/>`;
  const flameSway = a
    ? '<animateTransform attributeName="transform" type="rotate" values="-2 0 9;2.5 0 9;-2 0 9" dur="3.2s" repeatCount="indefinite"/>'
    : '';
  const flame = `<g transform="translate(0,2)"><g>${flameSway}${flameOuter}${flameMid}${flameHot}</g></g>`;

  // the cradle holding it
  const cradle =
    `<path d="M -20 18 Q 0 30 20 18 L 16 30 Q 0 38 -16 30 Z" fill="${tone(accent, 0.7, 0.14)}" stroke="${warm}" stroke-width="1.4"/>` +
    `<line x1="-16" y1="22" x2="16" y2="22" stroke="${p.hilite}" stroke-width="0.7" opacity="0.6"/>` +
    `<ellipse cx="0" cy="14" rx="9" ry="3" fill="${deep}" opacity="0.7"/>`;

  // slow embers
  const ember = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="-2" r="${r}" opacity="0"><animate attributeName="cy" values="2;-42" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.2;0.8;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-24" r="${r}" opacity="0.55"/>`;
  const embers = `<g fill="${warm}">${ember(-7, 1, 5, '0s')}${ember(8, 0.8, 6.5, '2s')}${ember(2, 0.9, 5.8, '3.5s')}</g>`;

  return (
    coreGlow(ctx, { r: 50, op: 0.16, lo: 0.12, hi: 0.26, dur: 4.4 }) +
    halo + embers + cradle + flame
  );
}
