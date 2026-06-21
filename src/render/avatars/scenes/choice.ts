// THE CHOICE — balance. The Stillpoint's two readings, weighed: an ornate balance
// with chained pans — a radiant sun (release) on the gold side, a vigil-flame
// (hold) on the green — over a field split into a gold sunburst and calm green
// rings, a luminous Stillpoint gem at the pivot. The decision the game ends on.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tweenT, drift, breathe, spin, when } from '../motion';
import { coreGlow, u } from './_common';

const GREEN = '#6ee7b7';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx; // accent = gold #fde047
  const p = paletteFor(accent);
  const gold = tone(accent, 1, 0.55);
  const greenD = tone(GREEN, 0.8, 0.5);

  // split field — gold half | green half
  const field =
    `<path d="M 0 -62 L -62 -30 L -62 30 L 0 62 Z" fill="${tone(accent, 0.9, 0.12)}" opacity="0.45"/>` +
    `<path d="M 0 -62 L 62 -30 L 62 30 L 0 62 Z" fill="${tone(GREEN, 0.9, 0.12)}" opacity="0.45"/>`;

  // left: gold sunburst rays (slow)
  let sun = '';
  for (let i = 0; i < 14; i++) { const ang = (i * (360 / 14)) * Math.PI / 180; sun += `<line x1="${(Math.cos(ang) * 14).toFixed(1)}" y1="${(Math.sin(ang) * 14).toFixed(1)}" x2="${(Math.cos(ang) * (i % 2 ? 46 : 36)).toFixed(1)}" y2="${(Math.sin(ang) * (i % 2 ? 46 : 36)).toFixed(1)}"/>`; }
  const sunburst = `<g transform="translate(-30,0)" stroke="${gold}" stroke-width="0.6" opacity="0.3">${spin(a, 70)}${sun}</g>`;

  // right: calm green concentric rings
  const calm =
    `<g transform="translate(30,0)" fill="none" opacity="0.35">` +
    `<circle r="14" stroke="${GREEN}" stroke-width="0.6"/><circle r="24" stroke="${greenD}" stroke-width="0.5" stroke-dasharray="2 6">${drift(a, 60, 9)}</circle><circle r="34" stroke="${greenD}" stroke-width="0.4"/></g>`;

  // luminous seam + shimmer
  const seam =
    `<line x1="0" y1="-60" x2="0" y2="60" stroke="${p.core[0]}" stroke-width="4" opacity="0.16"/>` +
    `<line x1="0" y1="-60" x2="0" y2="60" stroke="${p.core[0]}" stroke-width="1.2" opacity="0.6"/>` +
    `<line x1="0" y1="-60" x2="0" y2="60" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="8 26" opacity="0.7">${drift(a, -68, 3)}</line>`;

  // drifting motes — gold rising left, green rising right
  const mote = (cx: number, col: string, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="30" r="0.9" fill="${col}" opacity="0"><animate attributeName="cy" values="34;-34" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0" keyTimes="0;0.3;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="0" r="0.9" fill="${col}" opacity="0.6"/>`;
  const motes = `<g>${mote(-34, gold, 5, '0s')}${mote(-22, gold, 6.2, '2s')}${mote(34, GREEN, 5.4, '1s')}${mote(22, GREEN, 6.6, '3s')}</g>`;

  // sun glyph (left pan) + vigil-flame glyph (right pan)
  const sunGlyph =
    `<g>${spin(a, 18)}<g stroke="${gold}" stroke-width="1" stroke-linecap="round">` +
    Array.from({ length: 8 }, (_, i) => { const ang = i * 45 * Math.PI / 180; return `<line x1="${(Math.cos(ang) * 4).toFixed(1)}" y1="${(Math.sin(ang) * 4).toFixed(1)}" x2="${(Math.cos(ang) * 7.5).toFixed(1)}" y2="${(Math.sin(ang) * 7.5).toFixed(1)}"/>`; }).join('') +
    `</g><circle r="3.4" fill="${u('core', uid)}"/><circle r="2" fill="#fff"/></g>`;
  const flameSway = when(a, '<animateTransform attributeName="transform" type="rotate" values="-3 0 3;3 0 3;-3 0 3" dur="2.6s" repeatCount="indefinite"/>');
  const flameGlyph =
    `<g>${flameSway}<path d="M 0 -8 C 4 -2 4 3 2 6 C 0 8 -2 8 -3 5 C -4 0 -3 -4 0 -8 Z" fill="${greenD}"/>` +
    `<path d="M 0 -4 C 2 0 2 3 1 5 C 0 6 -1 5 -1.5 3.5 C -2 1 -1 -1 0 -4 Z" fill="#fff"/></g>`;

  // a chained pan (chains + bowl + content)
  const pan = (sx: number, col: string, content: string) =>
    `<g transform="translate(${sx},0)">` +
    `<line x1="-6" y1="-2" x2="-4" y2="10" stroke="${col}" stroke-width="0.8" stroke-dasharray="1.5 1.5"/><line x1="6" y1="-2" x2="4" y2="10" stroke="${col}" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>` +
    `<path d="M -10 10 Q 0 22 10 10" fill="${tone(col, 0.8, 0.12)}" stroke="${col}" stroke-width="1.4"/>` +
    `<g transform="translate(0,9)">${content}</g></g>`;

  // ornate balance — decorated fulcrum pillar, tipping beam, two pans, Stillpoint
  const pivotY = -14;
  const balance =
    `<g transform="translate(0,8)">` +
    `<rect x="-9" y="34" width="18" height="5" rx="1.5" fill="${p.deep}"/>` +
    `<path d="M -5 34 L -3 ${pivotY + 4} L 3 ${pivotY + 4} L 5 34 Z" fill="${tone(accent, 0.7, 0.2)}" stroke="${gold}" stroke-width="0.8"/>` +
    `<polygon points="0,${pivotY - 4} -8,${pivotY + 5} 8,${pivotY + 5}" fill="${tone(accent, 0.7, 0.18)}" stroke="${gold}" stroke-width="0.8"/>` +
    `<g transform="translate(0,${pivotY})"><g>${tweenT(a, 'rotate', '-8;8;-8', 6)}` +
    `<rect x="-32" y="-2" width="64" height="3.2" rx="1.5" fill="${u('bz', uid)}"/>` +
    `<circle cx="-32" cy="0" r="1.6" fill="${gold}"/><circle cx="32" cy="0" r="1.6" fill="${GREEN}"/>` +
    pan(-32, gold, sunGlyph) + pan(32, GREEN, flameGlyph) +
    `</g></g>` +
    `<g transform="translate(0,${pivotY})">${breathe(a, 0.85, 1, 3)}<polygon points="0,-7 5,0 0,7 -5,0" fill="${u('core', uid)}"/><polygon points="0,-4 2.8,0 0,4 -2.8,0" fill="#fff"/></g>` +
    `</g>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.1, hi: 0.22, dur: 4 }) +
    field + sunburst + calm + motes + seam + balance
  );
}
