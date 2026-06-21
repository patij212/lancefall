// THE WEAVER'S KNOT — weave. A woven mandala: a dense eight-strand interlace over
// a working loom — warp threads and a weft shuttling across — bound by a
// twist-cord border with corner bobbins, cipher-glyphs flowing along the threads.
// "I enciphered every thread that held you."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, drift, tweenT, when } from '../motion';
import { coreGlow } from './_common';

const GLYPHS = ['§', '¶', 'Ѯ', 'Ω', '⋔', 'Ψ', 'Æ', 'þ'];

export function scene(ctx: SceneCtx): string {
  const { accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const under = tone(accent, 0.8, 0.2);
  const hi = tone(accent, 0.6, 0.85);

  // loom — warp threads behind + a weft line shuttling up and down
  let warp = '';
  for (let i = -3; i <= 3; i++) warp += `<line x1="${i * 16}" y1="-56" x2="${i * 16}" y2="56" stroke="${tone(accent, 0.6, 0.28)}" stroke-width="0.5" opacity="0.22"/>`;
  const weft = a
    ? `<g><animateTransform attributeName="transform" type="translate" values="0 -40;0 40;0 -40" dur="6s" repeatCount="indefinite"/>` +
      `<line x1="-50" y1="0" x2="50" y2="0" stroke="${accent}" stroke-width="0.8" opacity="0.4"/>` +
      `<polygon points="50,0 44,-3 44,3" fill="${hi}"/><polygon points="-50,0 -44,-3 -44,3" fill="${hi}"/></g>`
    : `<line x1="-50" y1="-18" x2="50" y2="-18" stroke="${accent}" stroke-width="0.8" opacity="0.4"/>`;
  const loom = `<g>${warp}${weft}</g>`;

  // the interlace — 8 looped strands (outer 4 + inner 4), under-shadow → bright → highlight
  const OUT = [0, 45, 90, 135];
  const IN = [22.5, 67.5, 112.5, 157.5];
  const ell = (rx: number, ry: number, rot: number, stroke: string, sw: number, dash: string, child = '') =>
    `<ellipse rx="${rx}" ry="${ry}" transform="rotate(${rot})" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}>${child}</ellipse>`;
  const flow = when(a, '<animate attributeName="stroke-dashoffset" from="0" to="-32" dur="3.4s" repeatCount="indefinite"/>');
  const band = (rots: number[], rx: number, ry: number) =>
    `<g opacity="0.85">${rots.map((r) => ell(rx, ry, r, under, 5, '')).join('')}</g>` +
    `<g opacity="0.95">${rots.map((r) => ell(rx, ry, r, accent, 2.4, '11 6', flow)).join('')}</g>` +
    `<g opacity="0.6">${rots.map((r) => ell(rx, ry, r, hi, 0.8, '2 28')).join('')}</g>`;
  const knot = `<g>${spin(a, 60)}${band(OUT, 38, 15)}${band(IN, 24, 10)}</g>`;

  // twist-cord border (two dashed rings drifting opposite → a twisting rope)
  const border =
    `<circle r="54" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="7 7" opacity="0.5">${drift(a, 84, 5)}</circle>` +
    `<circle r="51" fill="none" stroke="${under}" stroke-width="2" stroke-dasharray="7 7" stroke-dashoffset="7" opacity="0.5">${drift(a, -84, 5)}</circle>`;

  // corner bobbins (spools of wound thread)
  const bobbin = (cx: number, cy: number, rot: number) =>
    `<g transform="translate(${cx},${cy}) rotate(${rot})"><rect x="-2" y="-7" width="4" height="14" rx="1" fill="${tone(accent, 0.7, 0.2)}"/>` +
    `<line x1="-4.5" y1="-7" x2="4.5" y2="-7" stroke="${hi}" stroke-width="1.4"/><line x1="-4.5" y1="7" x2="4.5" y2="7" stroke="${hi}" stroke-width="1.4"/>` +
    `<g stroke="${accent}" stroke-width="1" opacity="0.8"><line x1="-2" y1="-4" x2="2" y2="-2"/><line x1="-2" y1="0" x2="2" y2="2"/><line x1="-2" y1="4" x2="2" y2="6"/></g></g>`;
  const bobbins = `<g>${bobbin(0, -56, 0)}${bobbin(56, 0, 90)}${bobbin(0, 56, 0)}${bobbin(-56, 0, 90)}</g>`;

  // nexus gem
  const nexus =
    `<g>${tweenT(a, 'scale', '0.9;1.08;0.9', 3.6)}<polygon points="0,-9 6,0 0,9 -6,0" fill="${tone(accent, 1, 0.5)}"/>` +
    `<polygon points="0,-5 3.4,0 0,5 -3.4,0" fill="${p.core[0]}"/></g><circle r="1.6" fill="#fff"/>`;

  // cipher-glyphs drifting along the threads
  const glyph = (cx: number, cy: number, g: string, dur: number) =>
    `<text x="${cx}" y="${cy}" font-family="ui-monospace,monospace" font-size="8.5" fill="${hi}" text-anchor="middle" opacity="${a ? 0.4 : 0.6}">${g}${a ? `<animate attributeName="opacity" values="0.2;0.85;0.2" dur="${dur}s" repeatCount="indefinite"/>` : ''}</text>`;
  const glyphs = `<g>${GLYPHS.map((g, i) => { const ang = (i * 45 - 90) * Math.PI / 180; return glyph(Math.cos(ang) * 44, Math.sin(ang) * 44 + 3, g, 2.4 + (i % 4) * 0.4); }).join('')}</g>`;

  return (
    coreGlow(ctx, { op: 0.16, lo: 0.1, hi: 0.24, dur: 4.2 }) +
    loom + border + bobbins + knot + glyphs + nexus
  );
}
