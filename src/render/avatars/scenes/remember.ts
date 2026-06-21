// REMEMBER EVERYTHING — rise. The 100%-decryption reward: the city relit at dawn.
// A sunrise bloom with rising rays behind a fully-lit skyline, every window
// igniting in a wave, a relit beacon, converging data-light streams returning,
// memory-motes rising into a constellation, mirrored in the harbor. All at once.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, twinkle, drift } from '../motion';
import { coreGlow, u } from './_common';

const GOLD = '#ffd76b';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const wave = 3.4;

  const defs =
    `<defs><radialGradient id="${`dawn-${uid}`}" cx="50%" cy="100%" r="80%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="30%" stop-color="${GOLD}" stop-opacity="0.5"/><stop offset="70%" stop-color="${accent}" stop-opacity="0.18"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`;

  // dawn sunrise — rising rays + bloom behind the city
  let rays = '';
  for (let i = 0; i < 13; i++) {
    const ang = (-90 + (i - 6) * 13) * (Math.PI / 180);
    rays += `<line x1="0" y1="40" x2="${(Math.cos(ang) * 70).toFixed(1)}" y2="${(40 + Math.sin(ang) * 70).toFixed(1)}" stroke="${GOLD}" stroke-width="${i % 2 ? 1 : 0.6}"/>`;
  }
  const dawn =
    `<g stroke-linecap="round" opacity="0.16">${a ? `<animateTransform attributeName="transform" type="rotate" values="-3 0 40;3 0 40;-3 0 40" dur="12s" repeatCount="indefinite"/>` : ''}${rays}</g>` +
    `<ellipse cx="0" cy="42" rx="58" ry="34" fill="${`url(#dawn-${uid})`}">${a ? `<animate attributeName="opacity" values="0.7;1;0.7" dur="${wave}s" repeatCount="indefinite"/>` : ''}</ellipse>`;

  const horizon = `<line x1="-62" y1="40" x2="62" y2="40" stroke="${p.hilite}" stroke-width="0.9" opacity="0.8"/>`;

  // converging data-light streams returning into the city
  const stream = (x1: number, y1: number, d: number) =>
    `<line x1="${x1}" y1="${y1}" x2="8" y2="-16" stroke="${p.core[0]}" stroke-width="0.8" stroke-dasharray="2 8" opacity="0.4" stroke-linecap="round">${drift(a, -40, d)}</line>`;
  const streams = `<g>${stream(-60, -40, 3)}${stream(60, -44, 3.6)}${stream(-58, 30, 4)}${stream(58, 24, 3.3)}</g>`;

  // restored towers (fully present)
  const towers =
    `<g fill="${tone(accent, 0.7, 0.15)}">` +
    `<rect x="-56" y="14" width="15" height="28"/><rect x="-38" y="2" width="13" height="40"/><polygon points="-38,2 -31.5,-8 -25,2"/>` +
    `<rect x="-22" y="18" width="11" height="24"/><rect x="2" y="-16" width="13" height="58"/><rect x="6" y="-26" width="5" height="10"/>` +
    `<rect x="22" y="8" width="14" height="34"/><path d="M 22 8 Q 29 0 36 8 Z"/><rect x="42" y="-2" width="12" height="44"/></g>`;

  // igniting windows wave (lower → earlier)
  const win = (x: number, y: number, col: string) => {
    const begin = a ? (((42 - y) / 64) * wave).toFixed(2) : '0';
    return a
      ? `<rect x="${x}" y="${y}" width="1.8" height="2.4" fill="${col}" opacity="0.15"><animate attributeName="opacity" values="0.15;1;0.85" keyTimes="0;0.12;1" dur="${wave}s" begin="${begin}s" repeatCount="indefinite"/></rect>`
      : `<rect x="${x}" y="${y}" width="1.8" height="2.4" fill="${col}" opacity="0.95"/>`;
  };
  const cols: [number, number[], string][] = [
    [-53, [18, 24, 30, 36], p.core[0]], [-48, [22, 30, 36], p.core[0]],
    [-35, [4, 10, 16, 22, 28, 34], p.core[0]], [-29, [6, 18, 30], GOLD],
    [-19, [22, 28, 34], p.core[0]],
    [4, [-12, -4, 4, 12, 20, 28, 36], p.core[0]], [9, [-8, 4, 16, 28, 36], GOLD],
    [25, [12, 18, 24, 30, 36], p.core[0]], [31, [12, 24, 36], p.core[0]],
    [45, [2, 10, 18, 26, 34], p.core[0]], [50, [6, 22, 34], GOLD],
  ];
  const windows = `<g>${cols.map(([x, ys, col]) => ys.map((y) => win(x, y, col)).join('')).join('')}</g>`;

  // relit beacon atop the tallest tower
  const beacon =
    `<g transform="translate(8.5,-26)">` +
    `<circle r="12" fill="${u('core', uid)}" opacity="0.5">${a ? `<animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>` : ''}</circle>` +
    `<g stroke="${p.core[0]}" stroke-width="0.7" opacity="0.6">${spin(a, 8)}<line x1="0" y1="-14" x2="0" y2="-9"/><line x1="14" y1="0" x2="9" y2="0"/><line x1="-14" y1="0" x2="-9" y2="0"/><line x1="10" y1="-10" x2="6" y2="-6"/><line x1="-10" y1="-10" x2="-6" y2="-6"/></g>` +
    `<circle r="3" fill="#fff"/></g>`;

  // memory-motes rising into a constellation
  const constPts: [number, number][] = [[-30, -38], [-12, -46], [6, -40], [24, -48], [40, -34]];
  const constellation =
    `<g stroke="${GOLD}" stroke-width="0.4" opacity="0.3"><line x1="-30" y1="-38" x2="-12" y2="-46"/><line x1="-12" y1="-46" x2="6" y2="-40"/><line x1="6" y1="-40" x2="24" y2="-48"/><line x1="24" y1="-48" x2="40" y2="-34"/></g>` +
    `<g fill="${GOLD}">${constPts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.4">${twinkle(a, 2.4 + i * 0.4, 0.4, 1)}</circle>`).join('')}</g>`;
  const mote = (cx: number, r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="${cx}" cy="40" r="${r}" fill="${GOLD}" opacity="0"><animate attributeName="cy" values="42;-50" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.15;0.8;1" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${cx}" cy="-4" r="${r}" fill="${GOLD}" opacity="0.6"/>`;
  const motes = `<g>${mote(-30, 1, 6, '0s')}${mote(8, 0.9, 7.5, '1.2s')}${mote(34, 1, 6.8, '2.6s')}${mote(-12, 0.8, 8, '3.4s')}</g>`;

  // harbor reflection
  const refl = (x: number, col: string, d: number) =>
    `<line x1="${x}" y1="44" x2="${x}" y2="58" stroke="${col}" stroke-width="1" stroke-dasharray="2 3" opacity="0.35">${drift(a, 8, d)}</line>`;
  const harbor =
    `<rect x="-66" y="42" width="132" height="20" fill="${tone(accent, 0.7, 0.08)}" opacity="0.55"/>` +
    `<g>${refl(-35, p.core[0], 2.4)}${refl(8, GOLD, 3)}${refl(28, p.core[0], 2.7)}${refl(48, GOLD, 3.3)}</g>`;

  return (
    defs +
    coreGlow(ctx, { r: 58, op: 0.16, lo: 0.12, hi: 0.26, dur: wave }) +
    dawn + streams + horizon + towers + harbor + windows + beacon + constellation + motes
  );
}
