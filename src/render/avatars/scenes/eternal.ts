// ETERNAL — eternal (tier III). An ouroboros-lance: a spear curved into a ring,
// its head biting its tail, energy flowing endlessly around an ∞ core — ringed
// by the six fallen, each marked in its own colour. Begin again.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, drift, twinkle } from '../motion';
import { coreGlow, u } from './_common';

// the six who let it fall, in their canonical accents (bestiary.ts)
const SIX = ['#ff3b6b', '#a855f7', '#38bdf8', '#ef4444', '#6ee7b7', '#fde047'];

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const gold = tone(accent, 1, 0.62);
  const R = 40;

  // the six fallen — dimmed crest-dots at the hex vertices
  const fallen = `<g>${SIX.map((c, i) => {
    const ang = (i * 60 - 90) * (Math.PI / 180);
    const x = (Math.cos(ang) * 56).toFixed(1);
    const y = (Math.sin(ang) * 56).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${c}" opacity="${a ? 0.4 : 0.55}">${twinkle(a, 3 + i * 0.4, 0.25, 0.7)}</circle><circle cx="${x}" cy="${y}" r="5.5" fill="none" stroke="${c}" stroke-width="0.6" opacity="0.3"/>`;
  }).join('')}</g>`;

  // the ouroboros-lance ring — shaft + flowing energy + head biting tail
  const headAng = -64;
  const hx = Math.cos((headAng * Math.PI) / 180) * R;
  const hy = Math.sin((headAng * Math.PI) / 180) * R;
  const ring =
    `<circle r="${R}" fill="none" stroke="${tone(accent, 0.7, 0.28)}" stroke-width="5.5" opacity="0.85"/>` +
    `<circle r="${R}" fill="none" stroke="${gold}" stroke-width="2.4" stroke-dasharray="3 5" opacity="0.5"/>` +
    `<circle r="${R}" fill="none" stroke="${p.core[0]}" stroke-width="1.4" stroke-dasharray="6 60" opacity="0.9">${drift(a, -184, 4)}</circle>`;
  // spearhead at the head angle, tangent (pointing clockwise into the tail), + a bitten tail
  const head =
    `<g transform="translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${headAng + 90 + 20})">` +
    `<path d="M -4 0 Q 4 -7 14 -4 L 22 0 L 14 4 Q 4 7 -4 0 Z" fill="${gold}" filter="${u('blS', uid)}"/>` +
    `<line x1="-2" y1="0" x2="20" y2="0" stroke="${p.bg}" stroke-width="0.6" opacity="0.6"/></g>` +
    `<polygon points="${(hx + 6).toFixed(1)},${(hy - 8).toFixed(1)} ${(hx + 12).toFixed(1)},${(hy - 4).toFixed(1)} ${(hx + 7).toFixed(1)},${(hy + 1).toFixed(1)}" fill="${tone(accent, 0.6, 0.85)}"/>`;

  // a faint counter-rotating guide ring
  const guide = `<circle r="52" fill="none" stroke="${gold}" stroke-width="0.7" stroke-dasharray="1 7" opacity="0.4">${spin(a, 50, 360, 0)}</circle>`;

  // ∞ core — a lemniscate that glows
  const inf =
    `<g>${breathe(a, 0.8, 1, 4)}` +
    `<path d="M -13 0 C -13 -9 -3 -9 0 0 C 3 9 13 9 13 0 C 13 -9 3 -9 0 0 C -3 9 -13 9 -13 0 Z" fill="none" stroke="${gold}" stroke-width="3.4" filter="${u('bl', uid)}"/>` +
    `<path d="M -13 0 C -13 -9 -3 -9 0 0 C 3 9 13 9 13 0 C 13 -9 3 -9 0 0 C -3 9 -13 9 -13 0 Z" fill="none" stroke="${p.core[0]}" stroke-width="1.2"/></g>` +
    `<circle r="2.2" fill="${p.core[0]}"/>`;

  return (
    coreGlow(ctx, { op: 0.18, lo: 0.12, hi: 0.3, dur: 4.6 }) +
    guide + fallen +
    `<g>${spin(a, 26)}${ring}${head}</g>` +
    inf
  );
}
