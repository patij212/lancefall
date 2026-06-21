// THE CITY — flicker. The neon skyline of Lancefall in depth: three parallax
// layers of towers (spires, domes, stepped crowns), neon signs, rooftop
// searchlights sweeping the sky, a blinking flight light, dense flickering
// windows over a shimmering harbor. The city the whole game is trying to bring back.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tweenT, twinkle, drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

const MAGENTA = '#ff6fae', GOLD = '#ffd76b';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const far = tone(accent, 0.55, 0.26);
  const mid = tone(accent, 0.6, 0.18);
  const front = tone(accent, 0.7, 0.11);

  const win = (x: number, y: number, dur: number, lo: number, fill: string) =>
    a
      ? `<rect x="${x}" y="${y}" width="1.8" height="2.2" fill="${fill}" opacity="${lo}"><animate attributeName="opacity" values="${lo};1;${lo}" dur="${dur}s" repeatCount="indefinite"/></rect>`
      : `<rect x="${x}" y="${y}" width="1.8" height="2.2" fill="${fill}" opacity="0.7"/>`;

  // neon glow wash + moon
  const wash = `<ellipse cx="0" cy="36" rx="62" ry="26" fill="${u('core', uid)}" opacity="0.16">${a ? '<animate attributeName="opacity" values="0.1;0.22;0.1" dur="6s" repeatCount="indefinite"/>' : ''}</ellipse>`;
  const moon = `<circle cx="40" cy="-46" r="9" fill="${tone(accent, 0.4, 0.7)}" opacity="0.5"/><circle cx="40" cy="-46" r="9" fill="none" stroke="${p.light}" stroke-width="0.5" opacity="0.4"/>`;

  // far parallax layer
  const farLayer =
    `<g fill="${far}" opacity="0.55">${tweenT(a, 'translate', '-2 0;2 0;-2 0', 16)}` +
    `<rect x="-58" y="14" width="8" height="30"/><rect x="-46" y="8" width="6" height="36"/><rect x="-30" y="16" width="9" height="28"/>` +
    `<rect x="-12" y="6" width="7" height="38"/><rect x="6" y="12" width="8" height="32"/><rect x="20" y="2" width="6" height="42"/>` +
    `<rect x="34" y="14" width="9" height="30"/><rect x="50" y="10" width="7" height="34"/></g>`;

  // rooftop searchlights sweeping the sky
  const searchlight = (cx: number, cy: number, swing: string, dur: number) =>
    `<g transform="translate(${cx},${cy})"><g>${tweenT(a, 'rotate', swing, dur)}` +
    `<path d="M 0 0 L 6 -54 L -6 -54 Z" fill="${u('core', uid)}" opacity="0.18"/><line x1="0" y1="0" x2="0" y2="-52" stroke="${p.core[0]}" stroke-width="0.7" opacity="0.4"/></g>` +
    `<circle r="2" fill="${p.core[0]}"/></g>`;
  const searchlights = searchlight(-26, 2, '-26;14;-26', 7) + searchlight(30, 8, '20;-18;20', 8.5);

  // mid parallax layer with stepped/domed crowns
  const midLayer =
    `<g fill="${mid}">${tweenT(a, 'translate', '1 0;-1 0;1 0', 11)}` +
    `<rect x="-52" y="18" width="12" height="26"/><path d="M -52 18 L -52 12 L -40 12 L -40 18 Z"/>` + // stepped
    `<rect x="-34" y="8" width="10" height="36"/><path d="M -34 8 Q -29 0 -24 8 Z"/>` + // dome
    `<rect x="-12" y="14" width="11" height="30"/>` +
    `<rect x="8" y="4" width="12" height="40"/><rect x="11" y="-6" width="6" height="10"/>` + // antenna base
    `<rect x="28" y="16" width="10" height="28"/><rect x="44" y="10" width="11" height="34"/><path d="M 44 10 L 49.5 2 L 55 10 Z"/></g>`;

  // near silhouette — the tallest tower (the beacon) + spires
  const beacon = a
    ? `<circle cx="14" cy="-22" r="2.2" fill="${MAGENTA}"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite"/></circle>`
    : `<circle cx="14" cy="-22" r="2.2" fill="${MAGENTA}"/>`;
  const nearLayer =
    `<g fill="${front}">` +
    `<rect x="-56" y="22" width="15" height="22"/>` +
    `<rect x="-38" y="6" width="14" height="38"/><polygon points="-38,6 -31,-4 -24,6"/>` + // spire
    `<rect x="-20" y="24" width="11" height="20"/>` +
    `<rect x="8" y="-18" width="13" height="62"/><rect x="12.5" y="-30" width="4" height="12"/>` + // tallest + mast
    `<rect x="26" y="14" width="14" height="30"/><polygon points="26,14 33,4 40,14"/>` +
    `<rect x="44" y="20" width="12" height="24"/></g>` + beacon +
    `<line x1="14" y1="-30" x2="14" y2="-22" stroke="${MAGENTA}" stroke-width="0.8" opacity="0.6"/>`;

  // neon signs
  const sign = (x: number, y: number, w: number, col: string, dur: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="2.4" rx="1" fill="${col}" opacity="${a ? 0.6 : 0.8}">${twinkle(a, dur, 0.4, 1)}</rect>`;
  const signs = `<g>${sign(-36, 20, 8, MAGENTA, 2.3)}${sign(28, 26, 9, GOLD, 3.1)}${sign(-54, 30, 6, p.core[0], 2.6)}${sign(45, 28, 7, MAGENTA, 2.9)}${sign(10, 8, 8, GOLD, 2.2)}</g>`;

  // dense windows
  const winRows: [number, number[], string][] = [
    [-54, [26, 32, 38], p.light], [-36, [12, 18, 24, 30, 36], p.light], [-19, [28, 34, 40], p.light],
    [9, [-12, -4, 4, 12, 20, 28, 36], p.light], [14, [-8, 0, 8, 16, 24, 32], GOLD], [27, [18, 24, 30, 36], p.light], [45, [24, 30, 36], p.light],
  ];
  let windows = '';
  winRows.forEach(([x, ys, col], r) => ys.forEach((y, i) => { windows += win(x + (i % 2) * 4, y, 2 + ((r + i) % 5) * 0.3, 0.25 + ((i) % 3) * 0.05, col); }));

  // a blinking flight light crossing the sky
  const flight = a
    ? `<g><animateTransform attributeName="transform" type="translate" values="-66 -34;66 -42;66 -42" keyTimes="0;0.7;1" dur="9s" repeatCount="indefinite"/><circle r="1" fill="${MAGENTA}"><animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite"/></circle></g>`
    : `<circle cx="-10" cy="-38" r="1" fill="${MAGENTA}"/>`;

  // harbor waterline + shimmering reflection
  const refl = (x: number, col: string, d: number) =>
    `<line x1="${x}" y1="48" x2="${x}" y2="60" stroke="${col}" stroke-width="1" stroke-dasharray="2 3" opacity="0.3">${drift(a, 8, d)}</line>`;
  const harbor =
    `<rect x="-66" y="46" width="132" height="16" fill="${tone(accent, 0.7, 0.07)}" opacity="0.7"/>` +
    `<line x1="-62" y1="46" x2="62" y2="46" stroke="${p.light}" stroke-width="0.6" opacity="0.5"/>` +
    `<g>${refl(-36, MAGENTA, 2.4)}${refl(14, GOLD, 3)}${refl(-12, p.light, 2.7)}${refl(30, p.core[0], 2.2)}${refl(48, p.light, 3.3)}</g>`;

  return (
    coreGlow(ctx, { r: 58, op: 0.1, lo: 0.07, hi: 0.16, dur: 5 }) +
    starfield(ctx, [[-44, -44, 1, 2.6, 0.4], [-30, -52, 0.8, 3.1, 0.6], [50, -34, 0.8, 2.2, 0.3], [-52, -28, 0.7, 3.6, 0.5], [16, -50, 0.7, 2.9, 0.4]]) +
    moon + wash + farLayer + searchlights + midLayer + nearLayer + signs + windows + harbor + flight
  );
}
