// THE DROWNED BELL — toll. A great bronze bell sunk on the seabed, still tolling:
// sound-rings ripple outward from its mouth, god-ray light-shafts filter down
// through the water, bubbles drift up, kelp sways and a drowned-city skyline sits
// behind. A recovered "FROM THE DEEP" secret (born as the lancefall-avatars
// skill's validation sample, promoted into the roster).

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, drift, when } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;
  const bronze = tone(accent, 1, 0.55);
  const dur = 3; // one toll

  // scene-local gradients
  const defs =
    `<defs>` +
    `<linearGradient id="${id('water')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${tone(accent, 0.7, 0.3)}" stop-opacity="0.5"/><stop offset="55%" stop-color="${tone(accent, 0.8, 0.12)}" stop-opacity="0.3"/><stop offset="100%" stop-color="${p.bg}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id('shaft')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.core[0]}" stop-opacity="0.45"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id('bell')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${tone(accent, 0.8, 0.22)}"/><stop offset="40%" stop-color="${bronze}"/><stop offset="55%" stop-color="${tone(accent, 0.5, 0.88)}"/><stop offset="70%" stop-color="${bronze}"/><stop offset="100%" stop-color="${tone(accent, 0.9, 0.2)}"/></linearGradient>` +
    `</defs>`;

  // atmosphere — deep-water wash + plankton + surface shimmer
  const water = `<rect x="-66" y="-72" width="132" height="144" fill="${u('water', uid)}"/>`;
  const surface = `<path d="M -60 -58 q 8 -3 16 0 t 16 0 t 16 0 t 16 0 t 16 0" fill="none" stroke="${p.light}" stroke-width="0.8" opacity="0.35">${drift(a, -32, 4)}</path>`;

  // god-ray light-shafts (swaying)
  const shaft = (x: number, w: number, deg: number, dur2: number) =>
    `<g transform="translate(${x},-60)"><g>${when(a, `<animateTransform attributeName="transform" type="rotate" values="${deg - 3};${deg + 3};${deg - 3}" dur="${dur2}s" repeatCount="indefinite"/>`)}<path d="M ${-w} 0 L ${-w * 2.4} 110 L ${w * 2.4} 110 L ${w} 0 Z" fill="${u('shaft', uid)}" opacity="0.5"/></g></g>`;
  const shafts = shaft(-24, 5, 6, 9) + shaft(8, 6, -4, 11) + shaft(34, 4, 10, 10);

  // murk swirl + drowned-city skyline behind
  const murk = `<circle r="50" fill="none" stroke="${tone(accent, 0.6, 0.3)}" stroke-width="0.6" stroke-dasharray="2 12" opacity="0.3">${spin(a, 60)}</circle>`;
  const win = (x: number, y: number, durw: number) =>
    a ? `<rect x="${x}" y="${y}" width="1.6" height="2" fill="${p.light}" opacity="0.3"><animate attributeName="opacity" values="0.15;0.7;0.15" dur="${durw}s" repeatCount="indefinite"/></rect>` : `<rect x="${x}" y="${y}" width="1.6" height="2" fill="${p.light}" opacity="0.5"/>`;
  const skyline =
    `<g fill="${tone(accent, 0.7, 0.1)}" opacity="0.85"><rect x="-58" y="34" width="9" height="20"/><rect x="-46" y="40" width="7" height="14"/><rect x="-36" y="30" width="8" height="24"/>` +
    `<rect x="40" y="32" width="8" height="22"/><rect x="50" y="38" width="7" height="16"/><rect x="-24" y="42" width="6" height="12"/></g>` +
    `<g>${win(-55, 38, 3.2)}${win(-33, 36, 4)}${win(43, 38, 2.6)}</g>`;

  // kelp (swaying) + seabed
  const kelp = (x: number, h: number, deg: number, durk: number) =>
    `<g transform="translate(${x},54)"><g>${when(a, `<animateTransform attributeName="transform" type="rotate" values="${deg - 5} 0 0;${deg + 5} 0 0;${deg - 5} 0 0" dur="${durk}s" repeatCount="indefinite"/>`)}` +
    `<path d="M 0 0 Q ${deg} ${-h * 0.5} 2 ${-h}" fill="none" stroke="${tone(accent, 0.7, 0.22)}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M 0 0 Q ${deg} ${-h * 0.5} 2 ${-h}" fill="none" stroke="${tone(accent, 0.5, 0.5)}" stroke-width="0.6" stroke-linecap="round" opacity="0.6"/></g></g>`;
  const seabed =
    `<path d="M -64 60 Q -30 48 0 52 Q 34 56 64 50 L 64 64 L -64 64 Z" fill="${tone(accent, 0.7, 0.09)}" stroke="${tone(accent, 0.6, 0.2)}" stroke-width="0.6"/>` +
    kelp(-44, 26, -8, 7) + kelp(-30, 18, 6, 8.5) + kelp(40, 24, 8, 6.5) + kelp(52, 16, -6, 9);

  // sound-rings rippling from the bell mouth (toll)
  const tollRing = (begin: number) =>
    a
      ? `<ellipse cx="0" cy="34" fill="none" stroke="${p.core[0]}" stroke-width="1.6" opacity="0"><animate attributeName="rx" values="8;56" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="ry" values="3;20" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></ellipse>`
      : `<ellipse cx="0" cy="34" rx="${22 + begin * 12}" ry="${8 + begin * 5}" fill="none" stroke="${p.core[0]}" stroke-width="1.3" opacity="${0.4 - begin * 0.3}"/>`;
  const tollRings = tollRing(0) + tollRing(dur / 3) + tollRing((dur * 2) / 3);

  // the bell — rocks on the toll, clapper strikes
  const rock = when(a, `<animateTransform attributeName="transform" type="rotate" values="0 0 -20;5 0 -20;-4 0 -20;2 0 -20;0 0 -20" keyTimes="0;0.08;0.2;0.34;1" dur="${dur}s" repeatCount="indefinite"/>`);
  const strike = a
    ? `<circle cx="0" cy="30" r="3" fill="#ffffff" opacity="0"><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.05;0.18;1" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="r" values="2;6;2;2" keyTimes="0;0.06;0.2;1" dur="${dur}s" repeatCount="indefinite"/></circle>`
    : '';
  const clapper = `<g>${when(a, `<animateTransform attributeName="transform" type="rotate" values="-6 0 -16;6 0 -16;-6 0 -16" dur="${dur}s" repeatCount="indefinite"/>`)}<line x1="0" y1="-12" x2="0" y2="24" stroke="${tone(accent, 0.8, 0.3)}" stroke-width="1.2"/><circle cx="0" cy="26" r="3.4" fill="${bronze}" stroke="${tone(accent, 0.5, 0.85)}" stroke-width="0.5"/></g>`;
  const bell =
    `<g>${rock}` +
    // canon / mounting loop
    `<path d="M -3 -22 Q 0 -30 3 -22" fill="none" stroke="${bronze}" stroke-width="2.2"/><rect x="-3" y="-22" width="6" height="4" rx="1" fill="${bronze}"/>` +
    // body
    `<path d="M -20 30 Q -22 -2 -12 -18 Q 0 -22 12 -18 Q 22 -2 20 30 Z" fill="url(#${id('bell')})" stroke="${tone(accent, 0.8, 0.3)}" stroke-width="1"/>` +
    // raised bands
    `<g stroke="${tone(accent, 0.8, 0.3)}" stroke-width="0.8" opacity="0.7" fill="none"><path d="M -16 6 Q 0 10 16 6"/><path d="M -19 22 Q 0 27 19 22"/></g>` +
    // sound-bow lip
    `<path d="M -20 30 Q 0 38 20 30 L 18 33 Q 0 41 -18 33 Z" fill="${tone(accent, 0.9, 0.28)}" stroke="${bronze}" stroke-width="1"/>` +
    // engraved glyph band
    `<g fill="${tone(accent, 0.5, 0.7)}" opacity="0.7"><circle cx="-9" cy="14" r="1"/><circle cx="0" cy="15" r="1"/><circle cx="9" cy="14" r="1"/></g>` +
    // left sheen
    `<path d="M -13 -14 Q -18 0 -15 26" fill="none" stroke="${tone(accent, 0.4, 0.92)}" stroke-width="1.4" opacity="0.6"/>` +
    clapper + strike +
    `</g>`;

  // rising bubbles
  const bubble = (x: number, r: number, durb: number, begin: string) =>
    a
      ? `<circle cx="${x}" cy="32" r="${r}" fill="none" stroke="${p.light}" stroke-width="0.6" opacity="0"><animate attributeName="cy" values="32;-58" dur="${durb}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0.6;0" keyTimes="0;0.1;0.85;1" dur="${durb}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="cx" values="${x};${x + 4};${x - 2}" dur="${durb}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : `<circle cx="${x}" cy="-6" r="${r}" fill="none" stroke="${p.light}" stroke-width="0.6" opacity="0.5"/>`;
  const bubbles = `<g>${bubble(-8, 1.4, 6, '0s')}${bubble(6, 1, 7.5, '1.5s')}${bubble(0, 1.8, 6.8, '3s')}${bubble(10, 0.9, 8, '2.2s')}</g>`;

  return (
    defs +
    coreGlow(ctx, { r: 60, op: 0.12, lo: 0.08, hi: 0.18, dur: 5 }) +
    water +
    starfield(ctx, [[-46, -40, 0.8, 2.6, 0.3], [40, -44, 0.7, 3.1, 0.5], [50, -20, 0.8, 2.2, 0.3], [-50, -16, 0.7, 3.6, 0.4], [10, -48, 0.6, 2.9, 0.4]]) +
    shafts + surface + murk + skyline + seabed + tollRings + bell + bubbles +
    `<circle r="14" cx="0" cy="8" fill="${u('core', uid)}" opacity="0.18">${breathe(a, 0.1, 0.26, dur)}</circle>`
  );
}
