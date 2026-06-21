// LANCEFALL — fall. The night the light came down. A faceted falling star with a
// long luminous tail descends over the city through a nebula-washed sky — aurora
// ribbons drifting, a cracked moon haloed and cold, constellations strung
// overhead, light-rain streaking the dark — shedding a spark-shower into a
// bloom-pool that blossoms where it lands. The title sigil — grand and elegiac.

import type { SceneCtx } from '../registry';
import { tone } from '../primitives';
import { drift, breathe, twinkle } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const id = (n: string) => `${n}-${uid}`;
  const light = tone(accent, 0.7, 0.78);
  const faint = tone(accent, 0.6, 0.4);

  const defs =
    `<defs>` +
    `<linearGradient id="${id('tail')}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${accent}" stop-opacity="0"/><stop offset="55%" stop-color="${light}" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>` +
    `<radialGradient id="${id('moon')}" cx="38%" cy="36%" r="68%">` +
    `<stop offset="0%" stop-color="#eaeeff"/><stop offset="60%" stop-color="${tone(accent, 0.5, 0.66)}"/><stop offset="100%" stop-color="${tone(accent, 0.6, 0.3)}"/></radialGradient>` +
    `<radialGradient id="${id('pool')}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="40%" stop-color="${light}" stop-opacity="0.5"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id('neb')}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="${light}" stop-opacity="0.18"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `</defs>`;

  // nebula wash for depth
  const nebula =
    `<ellipse cx="28" cy="-26" rx="44" ry="30" fill="${u('neb', uid)}">${breathe(a, 0.5, 0.9, 9)}</ellipse>` +
    `<ellipse cx="-34" cy="6" rx="34" ry="24" fill="${u('neb', uid)}" opacity="0.7">${breathe(a, 0.4, 0.8, 11)}</ellipse>`;

  // starfield + constellation lines
  const starDots: [number, number, number, number, number][] = [
    [-50, -30, 1.2, 2.6, 0.3], [-32, -52, 1, 3.1, 0.6], [-8, -42, 0.8, 2.2, 0.4], [40, -48, 1.1, 3.6, 0.5],
    [54, -28, 0.8, 2.9, 0.3], [22, -56, 0.8, 3.3, 0.6], [-46, -6, 0.9, 2.4, 0.4], [48, -8, 1, 3.0, 0.5],
    [10, -34, 0.7, 2.7, 0.4], [-20, -20, 0.7, 3.4, 0.5],
  ];
  const constellation =
    `<g stroke="${faint}" stroke-width="0.4" opacity="0.3"><line x1="-50" y1="-30" x2="-32" y2="-52"/><line x1="-32" y1="-52" x2="-8" y2="-42"/><line x1="40" y1="-48" x2="54" y2="-28"/><line x1="54" y1="-28" x2="48" y2="-8"/></g>`;
  const starfield = constellation + `<g fill="${tone(accent, 0.5, 0.85)}">${starDots
    .map(([cx, cy, r, dur, lo]) => `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${a ? lo : 0.7}">${twinkle(a, dur, lo, 1)}</circle>`)
    .join('')}</g>`;

  // aurora ribbons (three, drifting)
  const aurora = (d1: string, d2: string, sw: number, op: number, dur: number) =>
    `<path d="${d1}" fill="none" stroke="${light}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}" filter="${u('bl', uid)}">` +
    (a ? `<animate attributeName="d" values="${d1};${d2};${d1}" dur="${dur}s" repeatCount="indefinite"/>` : '') +
    `</path>`;
  const auroras =
    aurora('M -64 -36 Q -20 -48 8 -34 Q 36 -22 64 -36', 'M -64 -32 Q -20 -38 8 -40 Q 36 -30 64 -32', 5, 0.16, 9) +
    aurora('M -64 -20 Q -18 -32 12 -18 Q 40 -8 64 -22', 'M -64 -24 Q -18 -16 12 -24 Q 40 -16 64 -18', 3.5, 0.12, 11) +
    aurora('M -64 -6 Q -10 -18 16 -4 Q 42 6 64 -8', 'M -64 -10 Q -10 -2 16 -10 Q 42 -2 64 -4', 2.5, 0.09, 13);

  // cracked, cold moon — haloed + glowing
  const moon =
    `<g transform="translate(-36,-44)">` +
    `<circle r="22" fill="${u('pool', uid)}" opacity="0.18"/>` +
    `<circle r="15" fill="${u('moon', uid)}"/>` +
    `<circle r="15" fill="none" stroke="${light}" stroke-width="0.6" opacity="0.5"/>` +
    `<circle r="18.5" fill="none" stroke="${light}" stroke-width="0.5" stroke-dasharray="2 6" opacity="0.35">${a ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="60s" repeatCount="indefinite"/>' : ''}</circle>` +
    `<g fill="${tone(accent, 0.5, 0.5)}" opacity="0.4"><circle cx="-5" cy="-3" r="2.6"/><circle cx="4" cy="4" r="1.8"/><circle cx="6" cy="-5" r="1.3"/><circle cx="-7" cy="6" r="1.5"/></g>` +
    `<path d="M 2 -14 L -2 -4 L 3 2 L -3 10 L 1 14" fill="none" stroke="${tone(accent, 0.6, 0.28)}" stroke-width="0.8" opacity="0.7"/></g>`;

  // slow celestial arcs
  const arcs =
    `<g fill="none" opacity="0.4">` +
    `<circle r="62" stroke="${tone(accent, 0.6, 0.34)}" stroke-width="0.6" stroke-dasharray="2 10">${a ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="90s" repeatCount="indefinite"/>' : ''}</circle>` +
    `<circle r="50" stroke="${tone(accent, 0.6, 0.4)}" stroke-width="0.5" stroke-dasharray="1 9"/></g>`;

  // light-rain — fine streaks falling through the dark
  const rain = (x: number, len: number, sw: number, d: number, op: number) =>
    `<line x1="${x}" y1="-66" x2="${x - 3}" y2="${-66 + len}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${Math.round(len * 0.5)} ${Math.round(len)}" stroke-linecap="round" opacity="${op}">${drift(a, 150, d)}</line>`;
  const lightRain =
    `<g>${rain(-52, 120, 0.7, 5.2, 0.16)}${rain(-38, 130, 0.6, 6.4, 0.13)}${rain(-22, 120, 0.7, 4.6, 0.15)}${rain(-6, 130, 0.6, 7, 0.12)}` +
    `${rain(14, 120, 0.7, 5.6, 0.15)}${rain(30, 130, 0.6, 6.2, 0.12)}${rain(46, 120, 0.8, 5.0, 0.16)}${rain(58, 120, 0.5, 6.8, 0.11)}</g>`;

  // delicate fallen skyline + flickering windows
  const win = (x: number, y: number, dur: number) =>
    a ? `<rect x="${x}" y="${y}" width="1.6" height="2" fill="${light}" opacity="0.3"><animate attributeName="opacity" values="0.2;0.9;0.2" dur="${dur}s" repeatCount="indefinite"/></rect>`
      : `<rect x="${x}" y="${y}" width="1.6" height="2" fill="${light}" opacity="0.7"/>`;
  const skyline =
    `<g fill="${tone(accent, 0.7, 0.13)}" opacity="0.92">` +
    `<rect x="-60" y="40" width="9" height="14"/><rect x="-48" y="30" width="7" height="24"/><rect x="-38" y="42" width="9" height="12"/>` +
    `<rect x="-25" y="34" width="6" height="20"/><rect x="-16" y="44" width="8" height="10"/><rect x="28" y="42" width="7" height="12"/>` +
    `<rect x="37" y="32" width="8" height="22"/><rect x="48" y="40" width="6" height="14"/><rect x="56" y="44" width="7" height="10"/>` +
    `<polygon points="-31,34 -28,28 -25,34"/><polygon points="40,32 41,26 42,32"/></g>` +
    `<g>${win(-46, 34, 2.4)}${win(-46, 40, 3.1)}${win(-23, 38, 2.7)}${win(39, 36, 2.2)}${win(39, 42, 3.4)}${win(50, 44, 2.9)}</g>` +
    `<line x1="-62" y1="50" x2="62" y2="50" stroke="${light}" stroke-width="0.7" opacity="0.4"/>`;

  // the impact bloom-pool where the star lands
  const pool =
    `<ellipse cx="10" cy="49" rx="26" ry="9" fill="${u('pool', uid)}" opacity="${a ? 0.4 : 0.5}">${breathe(a, 0.25, 0.6, 2.6)}</ellipse>` +
    (a
      ? `<ellipse cx="10" cy="49" rx="8" ry="3" fill="none" stroke="${light}" stroke-width="1" opacity="0"><animate attributeName="rx" values="8;34" dur="3.6s" repeatCount="indefinite"/><animate attributeName="ry" values="3;11" dur="3.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="3.6s" repeatCount="indefinite"/></ellipse>`
      : `<ellipse cx="10" cy="49" rx="20" ry="7" fill="none" stroke="${light}" stroke-width="1" opacity="0.3"/>`);

  // the faceted falling star + luminous tail + sparkle-trail
  const sparkleTrail = `<g fill="#ffffff">` +
    [[-1, -16, 0.9], [1, -22, 0.7], [-1.5, -28, 0.6], [1, -34, 0.5]].map(([sx, sy, sr], i) =>
      `<circle cx="${sx}" cy="${sy}" r="${sr}" opacity="${a ? 0.3 : 0.6}">${twinkle(a, 1.4 + i * 0.3, 0.2, 0.9)}</circle>`).join('') + `</g>`;
  const head =
    `<circle r="13" fill="${u('pool', uid)}" opacity="0.85"/>` +
    `<polygon points="0,-11 3,-3 11,0 3,3 0,11 -3,3 -11,0 -3,-3" fill="${light}"/>` +
    `<polygon points="0,-6 1.8,0 0,6 -1.8,0" fill="#ffffff"/>` +
    `<g stroke="#ffffff" stroke-width="0.8" opacity="0.85"><line x1="-16" y1="0" x2="16" y2="0"/><line x1="0" y1="-16" x2="0" y2="16"/><line x1="-9" y1="-9" x2="9" y2="9"/><line x1="9" y1="-9" x2="-9" y2="9"/></g>` +
    `<circle r="2.4" fill="#ffffff"/>`;
  const starInner =
    `<path d="M -7 2 L -2 -42 L 2 -42 L 7 2 Z" fill="${accent}" opacity="0.4" filter="${u('bl', uid)}"/>` +
    `<path d="M -5 0 L -1.6 -40 L 1.6 -40 L 5 0 Z" fill="url(#${id('tail')})"/>` +
    `<line x1="0" y1="-38" x2="0" y2="0" stroke="#ffffff" stroke-width="1" opacity="0.8"/>` +
    sparkleTrail + head;
  const star = a
    ? `<g transform="translate(-6,-56)"><animateTransform attributeName="transform" type="translate" values="-6 -56;10 28;10 28" keyTimes="0;0.7;1" dur="3.6s" repeatCount="indefinite"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.1;0.6;0.72;1" dur="3.6s" repeatCount="indefinite"/>${starInner}</g></g>`
    : `<g transform="translate(4,-8)">${starInner}</g>`;

  // a second, smaller falling streak (depth)
  const minor = a
    ? `<g><animateTransform attributeName="transform" type="translate" values="34 -60;48 -10;48 -10" keyTimes="0;0.6;1" dur="4.4s" begin="1.2s" repeatCount="indefinite"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;0.8;0.8;0;0" keyTimes="0;0.1;0.55;0.66;1" dur="4.4s" begin="1.2s" repeatCount="indefinite"/>` +
      `<path d="M -2 0 L 0 -16 L 2 0 Z" fill="url(#${id('tail')})"/><circle r="2" fill="#fff"/></g></g>`
    : `<g transform="translate(44,-30)"><path d="M -2 0 L 0 -16 L 2 0 Z" fill="url(#${id('tail')})"/><circle r="2" fill="#fff"/></g>`;

  // shower of fragments splitting off mid-descent, raining down
  const frag = (sx: number, sy: number, dx: number, dy: number, r: number, begin: number) =>
    a
      ? `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${light}" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;0.35;0.45;1" dur="3.6s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" keyTimes="0;1" dur="3.6s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${(sx + dx * 0.5).toFixed(1)}" cy="${(sy + dy * 0.5).toFixed(1)}" r="${r}" fill="${light}" opacity="0.6"/>`;
  const shower = `<g>${frag(-2, -14, -14, 30, 1.1, 0)}${frag(2, -10, 10, 34, 0.9, 0.4)}${frag(0, -18, 20, 26, 1, 0.8)}${frag(-4, -8, -6, 36, 0.8, 1.2)}${frag(4, -16, 24, 32, 0.9, 1.6)}${frag(-1, -12, -20, 28, 0.7, 2)}${frag(3, -20, 16, 22, 0.8, 2.4)}</g>`;

  return (
    defs +
    coreGlow(ctx, { r: 58, op: 0.12, lo: 0.08, hi: 0.18, dur: 5 }) +
    nebula + starfield + auroras + moon + arcs + lightRain + skyline + pool + shower + minor + star
  );
}
