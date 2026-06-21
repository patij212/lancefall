// THE VIGIL — hold. A shrine kept lit: a layered blue-hot→gold→white flame with
// side wisps and a faceted heart, on an ornate footed brazier, behind a soft
// radial sunburst and a multi-ring halo, ringed by a wreath of tiny votive
// flames, an ember column rising. Steadiness, made sacred.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe, spin, twinkle, when } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const warm = tone(accent, 1, 0.55);
  const deep = tone(accent, 1, 0.4);
  const blue = '#9fd2ff';

  // a small votive flame (teardrop), flickering
  const votive = (cx: number, cy: number, s: number, dur: number) =>
    `<g transform="translate(${cx},${cy})"><path d="M 0 ${(-7 * s).toFixed(1)} C ${(3 * s).toFixed(1)} ${(-2 * s).toFixed(1)} ${(2.4 * s).toFixed(1)} ${(2 * s).toFixed(1)} 0 ${(3 * s).toFixed(1)} C ${(-2.4 * s).toFixed(1)} ${(2 * s).toFixed(1)} ${(-3 * s).toFixed(1)} ${(-2 * s).toFixed(1)} 0 ${(-7 * s).toFixed(1)} Z" fill="${warm}" opacity="${a ? 0.8 : 0.85}">${twinkle(a, dur, 0.5, 1)}</path></g>`;

  // radial sunburst behind (slow)
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const ang = (i * 15 * Math.PI) / 180;
    const r1 = 24, r2 = i % 2 ? 60 : 50;
    rays += `<line x1="${(Math.cos(ang) * r1).toFixed(1)}" y1="${(Math.sin(ang) * r1).toFixed(1)}" x2="${(Math.cos(ang) * r2).toFixed(1)}" y2="${(Math.sin(ang) * r2).toFixed(1)}"/>`;
  }
  const sunburst = `<g stroke="${warm}" stroke-width="0.7" opacity="0.16">${spin(a, 120)}${rays}</g>`;

  // multi-ring halo
  const halo =
    `<circle r="32" fill="${u('core', uid)}" opacity="0.4">${breathe(a, 0.26, 0.5, 4)}</circle>` +
    `<circle r="36" fill="none" stroke="${warm}" stroke-width="0.7" opacity="0.4">${breathe(a, 0.2, 0.45, 5)}</circle>` +
    `<circle r="40" fill="none" stroke="${deep}" stroke-width="0.5" stroke-dasharray="1 5" opacity="0.4">${spin(a, 80, 360, 0)}</circle>`;

  // wreath of votive flames around the rim
  const wreath = `<g>${Array.from({ length: 10 }, (_, i) => {
    const ang = (i * 36 - 90) * (Math.PI / 180);
    return votive(Math.cos(ang) * 50, Math.sin(ang) * 50, 0.85, 2.2 + (i % 4) * 0.4);
  }).join('')}</g>`;

  // ornate footed brazier
  const brazier =
    `<g>` +
    `<rect x="-7" y="40" width="14" height="6" rx="2" fill="${deep}"/>` + // foot
    `<path d="M -5 24 L 5 24 L 7 40 L -7 40 Z" fill="${tone(accent, 0.8, 0.18)}" stroke="${warm}" stroke-width="1"/>` + // stem
    `<path d="M -22 16 Q 0 30 22 16 L 17 26 Q 0 34 -17 26 Z" fill="${tone(accent, 0.7, 0.16)}" stroke="${warm}" stroke-width="1.4"/>` + // bowl
    `<path d="M -23 16 Q 0 24 23 16" fill="none" stroke="${p.hilite}" stroke-width="1.2" opacity="0.7"/>` + // rim highlight
    `<g fill="${warm}"><circle cx="-16" cy="19" r="1.2"/><circle cx="0" cy="22" r="1.2"/><circle cx="16" cy="19" r="1.2"/></g>` + // rim studs
    `<g stroke="${tone(accent, 0.7, 0.28)}" stroke-width="0.6" opacity="0.6"><line x1="-12" y1="20" x2="-12" y2="26"/><line x1="0" y1="23" x2="0" y2="28"/><line x1="12" y1="20" x2="12" y2="26"/></g>` + // engraving
    `<ellipse cx="0" cy="15" rx="11" ry="3.2" fill="${deep}" opacity="0.8"/></g>`; // coals

  // the layered main flame
  const flameSway = when(a, '<animateTransform attributeName="transform" type="rotate" values="-2 0 14;2.5 0 14;-2 0 14" dur="3.4s" repeatCount="indefinite"/>');
  const flame =
    `<g transform="translate(0,2)"><g>${flameSway}` +
    `<path d="M -14 8 Q -20 -2 -12 -6 Q -16 -16 -8 -20 L -10 8 Z" fill="${warm}" opacity="0.5"/>` + // left wisp
    `<path d="M 14 8 Q 20 -2 12 -6 Q 16 -16 8 -20 L 10 8 Z" fill="${warm}" opacity="0.5"/>` + // right wisp
    `<path d="M 0 -38 C 12 -18 14 -2 7 10 C 4 16 -4 16 -7 10 C -14 -2 -12 -18 0 -38 Z" fill="${deep}" filter="${u('bl', uid)}"/>` + // outer
    `<path d="M 0 -29 C 8 -13 9 -2 4 8 C 2 12 -2 12 -4 8 C -9 -2 -8 -13 0 -29 Z" fill="${warm}"/>` + // mid
    `<path d="M 0 -18 C 4.5 -8 4.5 0 2 7 C 0 10 -2 9 -3 6 C -5.5 -1 -4.5 -10 0 -18 Z" fill="${p.core[0]}"/>` + // hot
    `<path d="M -3.5 12 C -2 6 2 6 3.5 12 C 2 16 -2 16 -3.5 12 Z" fill="${blue}" opacity="0.85"/>` + // blue base
    `<circle cx="0" cy="2" r="2.4" fill="#ffffff">${twinkle(a, 2.4, 0.7, 1)}</circle></g></g>`; // heart

  // rising ember column
  const ember = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="-4" r="${r}" opacity="0"><animate attributeName="cy" values="0;-48" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.2;0.8;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="cx" values="${cx};${cx + (cx < 0 ? -4 : 4)}" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-26" r="${r}" opacity="0.55"/>`;
  const embers = `<g fill="${warm}" filter="${u('blS', uid)}">${ember(-6, 1, 4.6, '0s')}${ember(7, 0.8, 6, '1.6s')}${ember(2, 1, 5.2, '3s')}${ember(-3, 0.7, 5.6, '2.2s')}</g>`;

  return (
    coreGlow(ctx, { r: 52, op: 0.16, lo: 0.12, hi: 0.28, dur: 4.4 }) +
    sunburst + halo + wreath + embers + brazier + flame
  );
}
