// LANCEFALL — fall. The night the light came down. A faceted falling star with a
// long luminous tail descends over the city, shedding a shower of sparks, while
// aurora ribbons drift, a cracked moon hangs cold, light-rain streaks the dark and
// a bloom-pool blossoms where it lands. The title sigil — grand and elegiac.

import type { SceneCtx } from '../registry';
import { tone } from '../primitives';
import { drift, breathe, twinkle } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const id = (n: string) => `${n}-${uid}`;
  const light = tone(accent, 0.7, 0.78);

  const defs =
    `<defs>` +
    `<linearGradient id="${id('tail')}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${accent}" stop-opacity="0"/><stop offset="55%" stop-color="${light}" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>` +
    `<radialGradient id="${id('moon')}" cx="38%" cy="36%" r="68%">` +
    `<stop offset="0%" stop-color="#eaeeff"/><stop offset="60%" stop-color="${tone(accent, 0.5, 0.66)}"/><stop offset="100%" stop-color="${tone(accent, 0.6, 0.3)}"/></radialGradient>` +
    `<radialGradient id="${id('pool')}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="40%" stop-color="${light}" stop-opacity="0.5"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `</defs>`;

  // rich twinkling starfield
  const starDots: [number, number, number, number, number][] = [
    [-50, -30, 1.1, 2.6, 0.3], [-32, -52, 0.9, 3.1, 0.6], [-8, -40, 0.7, 2.2, 0.4], [40, -48, 1, 3.6, 0.5],
    [54, -28, 0.8, 2.9, 0.3], [22, -56, 0.7, 3.3, 0.6], [-46, -6, 0.8, 2.4, 0.4], [48, -8, 0.9, 3.0, 0.5],
  ];
  const starfield = `<g fill="${tone(accent, 0.5, 0.85)}">${starDots
    .map(([cx, cy, r, dur, lo]) => `<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${a ? lo : 0.7}">${twinkle(a, dur, lo, 1)}</circle>`)
    .join('')}</g>`;

  // aurora ribbons — soft undulating bands high in the field
  const aurora = (d1: string, d2: string, sw: number, op: number, dur: number) =>
    `<path d="${d1}" fill="none" stroke="${light}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}" filter="${u('bl', uid)}">` +
    (a ? `<animate attributeName="d" values="${d1};${d2};${d1}" dur="${dur}s" repeatCount="indefinite"/>` : '') +
    `</path>`;
  const auroras =
    aurora('M -64 -34 Q -20 -46 8 -32 Q 36 -20 64 -34', 'M -64 -30 Q -20 -36 8 -38 Q 36 -28 64 -30', 5, 0.16, 9) +
    aurora('M -64 -18 Q -18 -30 12 -16 Q 40 -6 64 -20', 'M -64 -22 Q -18 -14 12 -22 Q 40 -14 64 -16', 3.5, 0.12, 11);

  // cracked, cold moon
  const moon =
    `<g transform="translate(-34,-42)">` +
    `<circle r="15" fill="${u('moon', uid)}"/>` +
    `<circle r="15" fill="none" stroke="${light}" stroke-width="0.6" opacity="0.5"/>` +
    `<g fill="${tone(accent, 0.5, 0.5)}" opacity="0.4"><circle cx="-5" cy="-3" r="2.6"/><circle cx="4" cy="4" r="1.8"/><circle cx="6" cy="-5" r="1.3"/></g>` +
    `<path d="M 2 -14 L -2 -4 L 3 2 L -3 10 L 1 14" fill="none" stroke="${tone(accent, 0.6, 0.28)}" stroke-width="0.8" opacity="0.7"/></g>`;

  // slow celestial arcs
  const arcs =
    `<g fill="none" opacity="0.4">` +
    `<circle r="60" stroke="${tone(accent, 0.6, 0.34)}" stroke-width="0.6" stroke-dasharray="2 10">${a ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="90s" repeatCount="indefinite"/>' : ''}</circle>` +
    `<circle r="48" stroke="${tone(accent, 0.6, 0.4)}" stroke-width="0.5" stroke-dasharray="1 9"/></g>`;

  // light-rain — fine streaks falling through the dark
  const rain = (x: number, len: number, sw: number, d: number, op: number) =>
    `<line x1="${x}" y1="-66" x2="${x - 3}" y2="${-66 + len}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${Math.round(len * 0.5)} ${Math.round(len)}" stroke-linecap="round" opacity="${op}">${drift(a, 150, d)}</line>`;
  const lightRain =
    `<g>${rain(-46, 120, 0.8, 5.2, 0.18)}${rain(-24, 130, 0.6, 6.4, 0.14)}${rain(-2, 120, 0.7, 4.6, 0.16)}` +
    `${rain(18, 130, 0.6, 7, 0.12)}${rain(38, 120, 0.8, 5.6, 0.16)}${rain(56, 120, 0.5, 6.8, 0.12)}</g>`;

  // delicate fallen skyline
  const skyline =
    `<g fill="${tone(accent, 0.7, 0.13)}" opacity="0.92">` +
    `<rect x="-60" y="40" width="9" height="14"/><rect x="-48" y="32" width="7" height="22"/><rect x="-38" y="42" width="9" height="12"/>` +
    `<rect x="-25" y="36" width="6" height="18"/><rect x="-16" y="44" width="8" height="10"/><rect x="28" y="42" width="7" height="12"/>` +
    `<rect x="37" y="34" width="8" height="20"/><rect x="48" y="40" width="6" height="14"/><rect x="56" y="44" width="7" height="10"/></g>` +
    `<line x1="-62" y1="50" x2="62" y2="50" stroke="${light}" stroke-width="0.7" opacity="0.4"/>`;

  // the impact bloom-pool where the star lands
  const pool =
    `<ellipse cx="10" cy="49" rx="26" ry="9" fill="${u('pool', uid)}" opacity="${a ? 0.4 : 0.5}">${breathe(a, 0.25, 0.6, 2.6)}</ellipse>` +
    (a
      ? `<ellipse cx="10" cy="49" rx="8" ry="3" fill="none" stroke="${light}" stroke-width="1" opacity="0"><animate attributeName="rx" values="8;34" dur="3.6s" repeatCount="indefinite"/><animate attributeName="ry" values="3;11" dur="3.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="3.6s" repeatCount="indefinite"/></ellipse>`
      : `<ellipse cx="10" cy="49" rx="20" ry="7" fill="none" stroke="${light}" stroke-width="1" opacity="0.3"/>`);

  // the faceted falling star + luminous tail (descends, fades at the ends)
  const head =
    `<circle r="12" fill="${u('pool', uid)}" opacity="0.85"/>` +
    `<polygon points="0,-10 2.8,-2.8 10,0 2.8,2.8 0,10 -2.8,2.8 -10,0 -2.8,-2.8" fill="${light}"/>` +
    `<polygon points="0,-5.5 1.7,0 0,5.5 -1.7,0" fill="#ffffff"/>` +
    `<g stroke="#ffffff" stroke-width="0.8" opacity="0.85"><line x1="-15" y1="0" x2="15" y2="0"/><line x1="0" y1="-15" x2="0" y2="15"/></g>` +
    `<circle r="2.2" fill="#ffffff"/>`;
  const starInner =
    `<path d="M -7 2 L -2 -42 L 2 -42 L 7 2 Z" fill="${accent}" opacity="0.4" filter="${u('bl', uid)}"/>` +
    `<path d="M -5 0 L -1.6 -40 L 1.6 -40 L 5 0 Z" fill="url(#${id('tail')})"/>` +
    `<line x1="0" y1="-38" x2="0" y2="0" stroke="#ffffff" stroke-width="1" opacity="0.8"/>` +
    head;
  const star = a
    ? `<g transform="translate(-6,-56)"><animateTransform attributeName="transform" type="translate" values="-6 -56;10 28;10 28" keyTimes="0;0.7;1" dur="3.6s" repeatCount="indefinite"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.1;0.6;0.72;1" dur="3.6s" repeatCount="indefinite"/>${starInner}</g></g>`
    : `<g transform="translate(4,-8)">${starInner}</g>`;

  // shower of fragments splitting off mid-descent, raining down
  const frag = (sx: number, sy: number, dx: number, dy: number, r: number, begin: number) =>
    a
      ? `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${light}" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;0.35;0.45;1" dur="3.6s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" keyTimes="0;1" dur="3.6s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${(sx + dx * 0.5).toFixed(1)}" cy="${(sy + dy * 0.5).toFixed(1)}" r="${r}" fill="${light}" opacity="0.6"/>`;
  const shower = `<g>${frag(-2, -14, -14, 30, 1.1, 0)}${frag(2, -10, 10, 34, 0.9, 0.4)}${frag(0, -18, 20, 26, 1, 0.8)}${frag(-4, -8, -6, 36, 0.8, 1.2)}${frag(4, -16, 24, 32, 0.9, 1.6)}</g>`;

  return (
    defs +
    coreGlow(ctx, { r: 58, op: 0.12, lo: 0.08, hi: 0.18, dur: 5 }) +
    starfield + auroras + moon + arcs + lightRain + skyline + pool + shower + star
  );
}
