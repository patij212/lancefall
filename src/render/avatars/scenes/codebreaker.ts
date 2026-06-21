// THE CODEBREAKER — rotate. A cipher engine: counter-rotating gear-tooth rotors
// carrying glyph rings, plugboard cables arcing across with flowing signal, a
// lampboard ring where the resolved letter sweeps lit, and a bolted decrypt
// window flipping glyph→plaintext under a scanline. The city's record, rebuilt.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, drift, when } from '../motion';
import { coreGlow, u } from './_common';

const GLYPHS = ['§', 'Ѯ', '¶', 'Ω', '⋔', 'Ψ', 'Æ', 'þ', 'Ø', 'Ξ', 'ʮ', 'Ϟ'];

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a gear-tooth ring
  const gearRing = (r: number, teeth: number, dur: number, dir: 1 | -1, sw: number, op: number) => {
    let t = '';
    for (let i = 0; i < teeth; i++) {
      t += `<g transform="rotate(${(i * 360) / teeth})"><rect x="-1.5" y="${(-(r + 3.5)).toFixed(1)}" width="3" height="4.5" rx="0.6" fill="${accent}"/></g>`;
    }
    return `<g opacity="${op}">${spin(a, dur, dir === 1 ? 0 : 360, dir === 1 ? 360 : 0)}<circle r="${r}" fill="none" stroke="${accent}" stroke-width="${sw}"/>${t}</g>`;
  };

  // a glyph rotor ring
  const glyphRotor = (r: number, count: number, dur: number, dir: 1 | -1, size: number, op: number) => {
    let g = '';
    for (let i = 0; i < count; i++) {
      const ang = (i * (360 / count) - 90) * (Math.PI / 180);
      g += `<text x="${(Math.cos(ang) * r).toFixed(1)}" y="${(Math.sin(ang) * r + size * 0.35).toFixed(1)}" font-family="ui-monospace,monospace" font-size="${size}" fill="${p.light}" text-anchor="middle">${GLYPHS[i % GLYPHS.length]}</text>`;
    }
    return `<g opacity="${op}">${spin(a, dur, dir === 1 ? 0 : 360, dir === 1 ? 360 : 0)}${g}</g>`;
  };

  // plugboard cables arcing across, signal flowing
  const cable = (a1: number, a2: number, col: string, d: number) => {
    const r = 40;
    const x1 = Math.cos((a1 * Math.PI) / 180) * r, y1 = Math.sin((a1 * Math.PI) / 180) * r;
    const x2 = Math.cos((a2 * Math.PI) / 180) * r, y2 = Math.sin((a2 * Math.PI) / 180) * r;
    return (
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.6" opacity="0.25"/>` +
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="3 9" opacity="0.7">${drift(a, -48, d)}</path>` +
      `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="2" fill="${col}"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2" fill="${col}"/>`
    );
  };
  const plugboard = `<g>${cable(-150, -20, accent, 4)}${cable(150, 30, p.light, 5)}${cable(-60, 100, accent, 4.6)}</g>`;

  // lampboard ring — small lamps, the resolved one sweeping lit
  let lamps = '';
  const L = 16;
  for (let i = 0; i < L; i++) {
    const ang = (i * (360 / L) - 90) * (Math.PI / 180);
    const cx = (Math.cos(ang) * 30).toFixed(1), cy = (Math.sin(ang) * 30).toFixed(1);
    const lit = when(a, `<animate attributeName="opacity" values="0.25;0.25;1;0.25" keyTimes="0;${(i / L).toFixed(3)};${(i / L + 0.04).toFixed(3)};1" dur="3.2s" repeatCount="indefinite"/>`);
    lamps += `<circle cx="${cx}" cy="${cy}" r="1.6" fill="${p.core[0]}" opacity="${a ? 0.25 : 0.5}">${lit}</circle>`;
  }
  const lampboard = `<g>${lamps}<circle r="30" fill="none" stroke="${p.deep}" stroke-width="0.4" stroke-dasharray="1 6" opacity="0.4"/></g>`;

  // central decrypt window — bolted frame + glyph→letter flip + scanline
  const flip = a
    ? `<text x="0" y="5.5" font-family="ui-monospace,monospace" font-size="17" fill="${p.deep}" text-anchor="middle">Ѯ<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.45;0.5;0.95;1" dur="3s" repeatCount="indefinite"/></text>` +
      `<text x="0" y="5.5" font-family="ui-monospace,monospace" font-size="17" font-weight="bold" fill="${p.core[0]}" text-anchor="middle" opacity="0">A<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.45;0.55;0.95;1" dur="3s" repeatCount="indefinite"/></text>`
    : `<text x="0" y="5.5" font-family="ui-monospace,monospace" font-size="17" font-weight="bold" fill="${p.core[0]}" text-anchor="middle">A</text>`;
  const scan = a
    ? `<rect x="-12" y="-2" width="24" height="2" fill="${p.core[0]}" opacity="0.5"><animate attributeName="y" values="-13;11;-13" dur="2.4s" repeatCount="indefinite"/></rect>`
    : '';
  const windowFrame =
    `<rect x="-14" y="-14" width="28" height="28" rx="3" fill="${tone(accent, 0.8, 0.07)}" stroke="${accent}" stroke-width="1.4"/>` +
    `<rect x="-14" y="-14" width="28" height="28" rx="3" fill="${u('core', uid)}" opacity="0.22"/>` +
    `<g fill="${p.light}"><circle cx="-11" cy="-11" r="1.1"/><circle cx="11" cy="-11" r="1.1"/><circle cx="-11" cy="11" r="1.1"/><circle cx="11" cy="11" r="1.1"/></g>`;

  return (
    coreGlow(ctx, { op: 0.15, lo: 0.1, hi: 0.24, dur: 4 }) +
    gearRing(58, 36, 80, 1, 0.7, 0.4) +
    glyphRotor(52, 12, 60, 1, 8, 0.6) +
    gearRing(44, 24, 40, -1, 1, 0.55) +
    glyphRotor(40, 10, 34, -1, 7, 0.45) +
    plugboard +
    lampboard +
    windowFrame + `<g>${scan}${flip}</g>`
  );
}
