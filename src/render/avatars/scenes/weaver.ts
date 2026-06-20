// THE WEAVER'S KNOT — weave. An interlaced triquetra of cipher-thread, strands
// flowing as they weave over and under, with enciphered glyphs drifting along a
// loom lattice. "I enciphered every thread that held you."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, drift } from '../motion';
import { coreGlow } from './_common';

export function scene(ctx: SceneCtx): string {
  const { accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const thread = accent;
  const under = tone(accent, 0.8, 0.22);

  // loom lattice behind the knot
  const lattice =
    `<g stroke="${tone(accent, 0.6, 0.3)}" stroke-width="0.5" opacity="0.25">` +
    `<line x1="-58" y1="-30" x2="58" y2="-30"/><line x1="-58" y1="0" x2="58" y2="0"/><line x1="-58" y1="30" x2="58" y2="30"/>` +
    `<line x1="-30" y1="-58" x2="-30" y2="58"/><line x1="0" y1="-58" x2="0" y2="58"/><line x1="30" y1="-58" x2="30" y2="58"/></g>`;

  // the interlace — 3 ellipses at 0/60/120, drawn under-shadow then bright thread
  const ROTS = [0, 60, 120];
  const ell = (rot: number, stroke: string, sw: number, dash: string, child = '') =>
    `<ellipse rx="36" ry="15" transform="rotate(${rot})" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}>${child}</ellipse>`;
  const driftChild = a ? '<animate attributeName="stroke-dashoffset" from="0" to="-32" dur="3.2s" repeatCount="indefinite"/>' : '';
  const knot =
    `<g>${spin(a, 48)}` +
    `<g opacity="0.85">${ROTS.map((r) => ell(r, under, 5.5, '')).join('')}</g>` +
    `<g opacity="0.95">${ROTS.map((r) => ell(r, thread, 2.6, '10 6', driftChild)).join('')}</g>` +
    `<g opacity="0.6">${ROTS.map((r) => ell(r, p.hilite, 0.8, '2 30')).join('')}</g>` +
    `</g>`;

  // nexus
  const nexus = `<circle r="6" fill="${tone(accent, 1, 0.5)}" opacity="0.5"/><circle r="3" fill="${p.core[0]}"/>`;

  // drifting cipher glyphs along the lattice
  const glyph = (x: number, y: number, g: string, dur: number) =>
    `<text x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="9" fill="${p.light}" text-anchor="middle" opacity="${a ? 0.4 : 0.6}">${g}${a ? `<animate attributeName="opacity" values="0.2;0.85;0.2" dur="${dur}s" repeatCount="indefinite"/>` : ''}</text>`;
  const glyphs = `${glyph(-46, -38, '§', 2.6)}${glyph(44, -34, '¶', 3.2)}${glyph(48, 34, 'Ѯ', 2.2)}${glyph(-44, 40, 'Ω', 3.6)}${glyph(0, -50, '⋔', 2.9)}`;

  // a faint outer weaving ring
  const outer = `<circle r="54" fill="none" stroke="${thread}" stroke-width="1" stroke-dasharray="5 11" opacity="0.5">${drift(a, 96, 6)}</circle>`;

  return coreGlow(ctx, { op: 0.16, lo: 0.1, hi: 0.24, dur: 4.2 }) + lattice + outer + knot + nexus + glyphs;
}
