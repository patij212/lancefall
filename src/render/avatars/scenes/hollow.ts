// THE HOLLOW — implode. Ported from the locked prototype: a broken ring over a
// void, rings collapsing inward, particles spiralling in, and the lost key-glyph
// flickering for one instant per cycle. "There was nothing left in me to hold."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe } from '../motion';
import { coreGlow } from './_common';

export function scene(ctx: SceneCtx): string {
  const { accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const deep = tone(accent, 0.8, 0.4);
  const light = tone(accent, 0.5, 0.82);
  const voidDark = tone(accent, 0.8, 0.04);

  // collapsing concentric rings (sonar inward)
  const ring = (begin: number, staticR: number) =>
    a
      ? `<circle fill="none" stroke="${accent}" opacity="0"><animate attributeName="r" values="58;2" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="stroke-width" values="2.4;0.4" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle r="${staticR}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.4"/>`;
  const rings = ring(0, 40) + ring(0.8, 26) + ring(1.6, 13);

  // the broken ring (a near-full arc with a gap)
  const arcPath = 'M 0 -48 A 48 48 0 1 1 -33.9 -33.9';
  const brokenRing =
    `<path d="${arcPath}" fill="none" stroke="${deep}" stroke-width="3.5" opacity="0.85"/>` +
    `<path d="${arcPath}" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.7" stroke-dasharray="2 8">${a ? '<animate attributeName="stroke-dashoffset" from="0" to="60" dur="6s" repeatCount="indefinite"/>' : ''}</path>` +
    `<g fill="${light}"><circle cx="0" cy="-48" r="2.4"/><circle cx="-33.9" cy="-33.9" r="2.2"/></g>`;

  // spiralling particles — inward when animated, frozen mid-spiral when static
  const N = 9;
  const particles = Array.from({ length: N }, (_, i) => {
    const ang = (i * (360 / N) * Math.PI) / 180;
    const ox = (Math.cos(ang) * 58).toFixed(1);
    const oy = (Math.sin(ang) * 58).toFixed(1);
    const r = [1.6, 1.4, 1.5, 1.3, 1.6, 1.4, 1.5, 1.3, 1.5][i];
    const begin = (i * 0.27).toFixed(2);
    return a
      ? `<circle r="${r}" opacity="0"><animateTransform attributeName="transform" type="translate" values="${ox} ${oy};0 0" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.15;0.7;1" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${(Math.cos(ang) * 29).toFixed(1)}" cy="${(Math.sin(ang) * 29).toFixed(1)}" r="${r}" opacity="0.5"/>`;
  }).join('');
  const spiral = `<g fill="${light}"><g>${spin(a, 14, 0, -360)}${particles}</g></g>`;

  // void core + breathing key-light
  const voidCore =
    `<circle r="16" fill="${voidDark}"/>` +
    `<circle r="16" fill="none" stroke="${deep}" stroke-width="1">${a ? '<animate attributeName="r" values="14;18;14" dur="3.6s" repeatCount="indefinite"/>' : ''}</circle>` +
    `<circle r="11" fill="${p.bg}"/>` +
    `<circle r="3" fill="${accent}" opacity="0.8">${breathe(a, 0.3, 0.9, 2)}${a ? '<animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite"/>' : ''}</circle>`;

  // the lost key-glyph — flickers in for one instant per cycle
  const keyGlyph =
    `<g stroke="${light}" stroke-width="1.1" fill="none" opacity="${a ? 0 : 0.45}">` +
    (a ? '<animate attributeName="opacity" values="0;0;0.85;0.85;0;0" keyTimes="0;0.42;0.47;0.55;0.62;1" dur="5s" repeatCount="indefinite"/>' : '') +
    `<circle cx="0" cy="-3" r="4"/><line x1="0" y1="1" x2="0" y2="10"/><line x1="0" y1="6" x2="4" y2="6"/><line x1="0" y1="10" x2="3" y2="10"/></g>`;

  return (
    coreGlow(ctx, { r: 60, op: 0.16, lo: 0.05, hi: 0.2, dur: 3.6 }) +
    rings + brokenRing + spiral + voidCore + keyGlyph
  );
}
