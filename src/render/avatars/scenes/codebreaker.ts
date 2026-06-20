// THE CODEBREAKER — rotate. A stack of counter-rotating cipher rotors with a
// glyph ring, and a decrypt window where an enciphered glyph flips to plaintext.
// Bringing the city's record back, one wheel at a time.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a rotor disk: ring + tick marks + glyph hints, rotating
  const rotor = (r: number, dur: number, dir: 1 | -1, sw: number, op: number) => {
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const ang = (i * 30 * Math.PI) / 180;
      const x1 = (Math.cos(ang) * (r - 4)).toFixed(1);
      const y1 = (Math.sin(ang) * (r - 4)).toFixed(1);
      const x2 = (Math.cos(ang) * r).toFixed(1);
      const y2 = (Math.sin(ang) * r).toFixed(1);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }).join('');
    return (
      `<g opacity="${op}">${spin(a, dur, dir === 1 ? 0 : 360, dir === 1 ? 360 : 0)}` +
      `<circle r="${r}" fill="none" stroke="${accent}" stroke-width="${sw}"/>` +
      `<g stroke="${p.light}" stroke-width="1" opacity="0.8">${ticks}</g></g>`
    );
  };

  // glyph ring (enciphered marks orbiting)
  const glyphRing = `<g opacity="0.6">${spin(a, 30)}${
    ['§', 'Ѯ', '¶', 'Ω', '⋔', 'Ψ', 'Æ', 'þ'].map((g, i) => {
      const ang = (i * 45 - 90) * (Math.PI / 180);
      const x = (Math.cos(ang) * 56).toFixed(1);
      const y = (Math.sin(ang) * 56 + 3).toFixed(1);
      return `<text x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="8" fill="${p.light}" text-anchor="middle">${g}</text>`;
    }).join('')
  }</g>`;

  // the decrypt window — a cipher glyph flips to a plaintext letter
  const flip = a
    ? `<g><text x="0" y="5" font-family="ui-monospace,monospace" font-size="16" fill="${p.deep}" text-anchor="middle">Ѯ<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.45;0.5;0.95;1" dur="3s" repeatCount="indefinite"/></text>` +
      `<text x="0" y="5" font-family="ui-monospace,monospace" font-size="16" font-weight="bold" fill="${p.core[0]}" text-anchor="middle" opacity="0">A<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.45;0.55;0.95;1" dur="3s" repeatCount="indefinite"/></text></g>`
    : `<text x="0" y="5" font-family="ui-monospace,monospace" font-size="16" font-weight="bold" fill="${p.core[0]}" text-anchor="middle">A</text>`;
  const windowFrame =
    `<rect x="-13" y="-13" width="26" height="26" rx="3" fill="${tone(accent, 0.8, 0.08)}" stroke="${accent}" stroke-width="1.2"/>` +
    `<rect x="-13" y="-13" width="26" height="26" rx="3" fill="${u('core', uid)}" opacity="0.25"/>`;

  return (
    coreGlow(ctx, { op: 0.15, lo: 0.1, hi: 0.22, dur: 4 }) +
    rotor(56, 60, 1, 0.7, 0.45) +
    glyphRing +
    rotor(44, 26, -1, 1, 0.6) +
    rotor(32, 18, 1, 1.2, 0.75) +
    windowFrame + flip
  );
}
