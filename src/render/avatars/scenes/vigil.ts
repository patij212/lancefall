// THE VIGIL — hold. A shrine kept lit: a rich layered flame crowned in white on a
// tall ornate fluted brazier, behind a mandala halo and a double sunburst, ringed
// by a wreath of votive flames and framed by faint shrine pillars, embers rising
// and ash drifting down. Steadiness, made sacred.

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

  const votive = (cx: number, cy: number, s: number, dur: number) =>
    `<g transform="translate(${cx},${cy})"><path d="M 0 ${(-7 * s).toFixed(1)} C ${(3 * s).toFixed(1)} ${(-2 * s).toFixed(1)} ${(2.4 * s).toFixed(1)} ${(2 * s).toFixed(1)} 0 ${(3 * s).toFixed(1)} C ${(-2.4 * s).toFixed(1)} ${(2 * s).toFixed(1)} ${(-3 * s).toFixed(1)} ${(-2 * s).toFixed(1)} 0 ${(-7 * s).toFixed(1)} Z" fill="${warm}" opacity="${a ? 0.8 : 0.85}">${twinkle(a, dur, 0.5, 1)}</path></g>`;

  // double radial sunburst (counter-rotating)
  const burst = (r1: number, r2a: number, r2b: number, n: number, dir: 1 | -1, sw: number, op: number, dur: number) => {
    let rays = '';
    for (let i = 0; i < n; i++) { const ang = (i * (360 / n)) * Math.PI / 180; const r2 = i % 2 ? r2a : r2b; rays += `<line x1="${(Math.cos(ang) * r1).toFixed(1)}" y1="${(Math.sin(ang) * r1).toFixed(1)}" x2="${(Math.cos(ang) * r2).toFixed(1)}" y2="${(Math.sin(ang) * r2).toFixed(1)}"/>`; }
    return `<g stroke="${warm}" stroke-width="${sw}" opacity="${op}">${spin(a, dur, dir === 1 ? 0 : 360, dir === 1 ? 360 : 0)}${rays}</g>`;
  };
  const sunburst = burst(24, 60, 50, 24, 1, 0.7, 0.16, 120) + burst(20, 44, 38, 16, -1, 0.5, 0.1, 90);

  // mandala halo — rings + a petal-ring
  let petals = '';
  for (let i = 0; i < 16; i++) { const ang = (i * 22.5) * Math.PI / 180; const x = Math.cos(ang) * 44, y = Math.sin(ang) * 44; petals += `<polygon points="${x.toFixed(1)},${(y - 2.4).toFixed(1)} ${(x + 1.6).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + 2.4).toFixed(1)} ${(x - 1.6).toFixed(1)},${y.toFixed(1)}" fill="${deep}" opacity="0.5"/>`; }
  const halo =
    `<circle r="30" fill="${u('core', uid)}" opacity="0.4">${breathe(a, 0.26, 0.5, 4)}</circle>` +
    `<circle r="34" fill="none" stroke="${warm}" stroke-width="0.7" opacity="0.4">${breathe(a, 0.2, 0.45, 5)}</circle>` +
    `<g>${spin(a, 100, 360, 0)}${petals}</g>` +
    `<circle r="48" fill="none" stroke="${deep}" stroke-width="0.5" stroke-dasharray="1 5" opacity="0.4">${spin(a, 80)}</circle>`;

  // wreath of votive flames around the rim
  const wreath = `<g>${Array.from({ length: 12 }, (_, i) => { const ang = (i * 30 - 90) * (Math.PI / 180); return votive(Math.cos(ang) * 54, Math.sin(ang) * 54, 0.8, 2.2 + (i % 4) * 0.4); }).join('')}</g>`;

  // faint shrine pillars framing
  const pillar = (x: number) =>
    `<g stroke="${tone(accent, 0.6, 0.22)}" stroke-width="1" opacity="0.4" fill="none"><line x1="${x}" y1="-30" x2="${x}" y2="40"/><line x1="${x - 4}" y1="-30" x2="${x + 4}" y2="-30"/><line x1="${x - 5}" y1="40" x2="${x + 5}" y2="40"/></g>`;
  const pillars = pillar(-50) + pillar(50);

  // tall ornate fluted brazier on a stepped base
  const brazier =
    `<g>` +
    `<rect x="-12" y="48" width="24" height="5" rx="1.5" fill="${deep}"/><rect x="-9" y="43" width="18" height="5" rx="1.5" fill="${tone(accent, 0.7, 0.2)}"/>` + // stepped base
    `<path d="M -6 26 L 6 26 L 8 43 L -8 43 Z" fill="${tone(accent, 0.8, 0.18)}" stroke="${warm}" stroke-width="1"/>` + // stem
    `<g stroke="${tone(accent, 0.7, 0.3)}" stroke-width="0.5" opacity="0.6"><line x1="-3" y1="28" x2="-3.5" y2="42"/><line x1="0" y1="28" x2="0" y2="42"/><line x1="3" y1="28" x2="3.5" y2="42"/></g>` + // flutes
    `<ellipse cx="0" cy="30" rx="8" ry="2.4" fill="${deep}"/>` + // collar
    `<path d="M -24 18 Q 0 32 24 18 L 18 28 Q 0 36 -18 28 Z" fill="${tone(accent, 0.7, 0.16)}" stroke="${warm}" stroke-width="1.4"/>` + // bowl
    `<path d="M -25 18 Q 0 26 25 18" fill="none" stroke="${p.hilite}" stroke-width="1.2" opacity="0.7"/>` + // rim
    `<path d="M -24 19 Q -32 16 -30 24" fill="none" stroke="${warm}" stroke-width="1.4"/><path d="M 24 19 Q 32 16 30 24" fill="none" stroke="${warm}" stroke-width="1.4"/>` + // handles
    `<g fill="${warm}"><circle cx="-18" cy="21" r="1.2"/><circle cx="-9" cy="24" r="1.2"/><circle cx="0" cy="25" r="1.2"/><circle cx="9" cy="24" r="1.2"/><circle cx="18" cy="21" r="1.2"/></g>` + // studs
    `<ellipse cx="0" cy="17" rx="12" ry="3.4" fill="${deep}" opacity="0.85"/></g>`; // coals

  // the layered main flame, crowned white
  const flameSway = when(a, '<animateTransform attributeName="transform" type="rotate" values="-2 0 16;2.5 0 16;-2 0 16" dur="3.4s" repeatCount="indefinite"/>');
  const flame =
    `<g transform="translate(0,4)"><g>${flameSway}` +
    `<path d="M -15 8 Q -22 -2 -13 -7 Q -18 -18 -9 -22 L -11 8 Z" fill="${warm}" opacity="0.45"/>` + // left wisp
    `<path d="M 15 8 Q 22 -2 13 -7 Q 18 -18 9 -22 L 11 8 Z" fill="${warm}" opacity="0.45"/>` + // right wisp
    `<path d="M -7 6 Q -12 -8 -5 -16 L -4 6 Z" fill="${warm}" opacity="0.6"/><path d="M 7 6 Q 12 -8 5 -16 L 4 6 Z" fill="${warm}" opacity="0.6"/>` + // inner tongues
    `<path d="M 0 -40 C 13 -19 15 -2 7 10 C 4 16 -4 16 -7 10 C -15 -2 -13 -19 0 -40 Z" fill="${deep}" filter="${u('bl', uid)}"/>` + // outer
    `<path d="M 0 -31 C 9 -14 10 -2 4 8 C 2 12 -2 12 -4 8 C -10 -2 -9 -14 0 -31 Z" fill="${warm}"/>` + // mid
    `<path d="M 0 -20 C 5 -9 5 0 2 7 C 0 10 -2 9 -3 6 C -6 -1 -5 -11 0 -20 Z" fill="${p.core[0]}"/>` + // hot
    `<path d="M 0 -14 C 2.5 -7 2 -1 1 4 C 0 6 -1 5 -1.5 3 C -3 -2 -2 -8 0 -14 Z" fill="#ffffff"/>` + // white crown
    `<path d="M -4 12 C -2 6 2 6 4 12 C 2 16 -2 16 -4 12 Z" fill="${blue}" opacity="0.85"/>` + // blue base
    `<circle cx="0" cy="3" r="2.4" fill="#ffffff">${twinkle(a, 2.4, 0.7, 1)}</circle></g></g>`;

  // rising embers + drifting ash
  const ember = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="-4" r="${r}" opacity="0"><animate attributeName="cy" values="0;-50" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.2;0.8;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="cx" values="${cx};${cx + (cx < 0 ? -5 : 5)}" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-28" r="${r}" opacity="0.55"/>`;
  const ash = (cx: number, dur: number, begin: string) =>
    a ? `<circle cx="${cx}" cy="-40" r="0.7" fill="${tone(accent, 0.3, 0.5)}" opacity="0"><animate attributeName="cy" values="-44;30" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.5;0" keyTimes="0;0.4;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>` : '';
  const embers = `<g fill="${warm}" filter="${u('blS', uid)}">${ember(-6, 1, 4.6, '0s')}${ember(7, 0.8, 6, '1.6s')}${ember(2, 1, 5.2, '3s')}${ember(-3, 0.7, 5.6, '2.2s')}</g><g>${ash(-14, 7, '0s')}${ash(16, 8, '3s')}</g>`;

  return (
    coreGlow(ctx, { r: 52, op: 0.16, lo: 0.12, hi: 0.28, dur: 4.4 }) +
    sunburst + halo + pillars + wreath + embers + brazier + flame
  );
}
