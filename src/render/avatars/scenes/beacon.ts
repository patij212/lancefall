// THE DARK BEACON — sweep. A failing lighthouse: a banded tower with a railed
// gallery and a lantern room housing a rich Fresnel lens-eye, a volumetric
// beam-cone sweeping the dark and flickering, light-scatter motes, waves with a
// beam-reflection below. "I let the signal go dark. I still hear it asking."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, tween, drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const id = (n: string) => `${n}-${uid}`;
  const dark = tone(accent, 0.7, 0.12);

  const defs =
    `<defs><linearGradient id="${id('beam')}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${p.core[0]}" stop-opacity="0.6"/><stop offset="60%" stop-color="${accent}" stop-opacity="0.18"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>`;

  // sea — wave lines + a vertical beam reflection shimmering on the water
  const wave = (y: number, op: number, d: number) =>
    `<path d="M -64 ${y} q 8 -3 16 0 t 16 0 t 16 0 t 16 0 t 16 0" fill="none" stroke="${tone(accent, 0.7, 0.4)}" stroke-width="0.8" opacity="${op}">${drift(a, -32, d)}</path>`;
  const sea =
    `<rect x="-66" y="40" width="132" height="22" fill="${tone(accent, 0.7, 0.1)}" opacity="0.55"/>` +
    `<path d="M -8 42 L 8 42 L 5 60 L -5 60 Z" fill="${u('core', uid)}" opacity="${a ? 0.3 : 0.4}">${breathe(a, 0.16, 0.42, 2.2)}</path>` +
    wave(45, 0.4, 3.4) + wave(51, 0.3, 4.2) + wave(57, 0.25, 3);

  // volumetric sweeping beam-cone (rotating full circle, flickering)
  const beamCone =
    `<g><path d="M 0 0 L 78 -20 L 78 20 Z" fill="url(#${id('beam')})"/>` +
    `<line x1="0" y1="0" x2="76" y2="0" stroke="${p.core[0]}" stroke-width="1.4" opacity="0.5"/>` +
    `<line x1="0" y1="0" x2="74" y2="-14" stroke="${accent}" stroke-width="0.7" opacity="0.3"/>` +
    `<line x1="0" y1="0" x2="74" y2="14" stroke="${accent}" stroke-width="0.7" opacity="0.3"/></g>`;
  const beam = a
    ? `<g opacity="0.9"><animate attributeName="opacity" values="0.2;0.85;0.35;0.7;0.2" dur="2.2s" repeatCount="indefinite"/><g>${spin(a, 7)}${beamCone}</g></g>`
    : `<g opacity="0.55"><g transform="rotate(-32)">${beamCone}</g></g>`;

  // light-scatter motes drifting out along the beam axis (subtle)
  const mote = (r: number, dur: number, begin: string) =>
    a
      ? `<circle cx="20" cy="0" r="${r}" fill="${p.light}" opacity="0"><animate attributeName="cx" values="14;60" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></circle>`
      : '';
  const motes = a ? `<g><g>${spin(a, 7)}${mote(1, 2.2, '0s')}${mote(0.8, 2.2, '0.9s')}${mote(0.9, 2.2, '1.5s')}</g></g>` : '';

  // the lighthouse — tower, gallery, lantern room (behind the lens)
  const tower =
    `<g>` +
    // rocky base
    `<path d="M -22 54 L -14 44 L -6 50 L 2 43 L 12 50 L 22 45 L 26 60 L -26 60 Z" fill="${dark}" stroke="${p.deep}" stroke-width="0.8"/>` +
    // tower body (tapered, banded)
    `<path d="M -13 44 L -9 6 L 9 6 L 13 44 Z" fill="${tone(accent, 0.7, 0.15)}" stroke="${p.deep}" stroke-width="1"/>` +
    `<g fill="${tone(accent, 0.6, 0.28)}" opacity="0.8"><path d="M -12 38 L 12 38 L 11.5 31 L -11.5 31 Z"/><path d="M -10.5 22 L 10.5 22 L 10 15 L -10 15 Z"/></g>` +
    // gallery platform + railing
    `<rect x="-15" y="2" width="30" height="4" rx="1" fill="${tone(accent, 0.7, 0.22)}" stroke="${p.deep}" stroke-width="0.6"/>` +
    `<g stroke="${p.light}" stroke-width="0.7" opacity="0.6"><line x1="-13" y1="-3" x2="-13" y2="2"/><line x1="-7" y1="-3" x2="-7" y2="2"/><line x1="7" y1="-3" x2="7" y2="2"/><line x1="13" y1="-3" x2="13" y2="2"/><line x1="-14" y1="-3" x2="14" y2="-3"/></g>` +
    // lantern-room housing + domed cap
    `<rect x="-12" y="-22" width="24" height="20" rx="2" fill="${tone(accent, 0.8, 0.09)}" stroke="${accent}" stroke-width="1"/>` +
    `<path d="M -13 -22 Q 0 -36 13 -22 Z" fill="${tone(accent, 0.7, 0.18)}" stroke="${p.deep}" stroke-width="0.8"/>` +
    `<line x1="0" y1="-34" x2="0" y2="-40" stroke="${p.light}" stroke-width="1" stroke-linecap="round"/><circle cx="0" cy="-41" r="1.6" fill="${p.core[0]}"/></g>`;

  // the Fresnel lens-eye in the lantern room (flickering)
  const flick = a ? `<animate attributeName="opacity" values="0.2;1;0.3;0.9;0.2" dur="2.2s" repeatCount="indefinite"/>` : '';
  const lens =
    `<g transform="translate(0,-12)">` +
    `<ellipse rx="10" ry="13" fill="${tone(accent, 0.8, 0.06)}" stroke="${p.deep}" stroke-width="1"/>` +
    `<g fill="none" stroke="${accent}" stroke-width="0.6" opacity="0.55"><ellipse rx="10" ry="4"/><ellipse rx="10" ry="8"/><ellipse rx="9" ry="11.5"/><line x1="-10" y1="0" x2="10" y2="0"/></g>` +
    `<ellipse rx="5" ry="9" fill="${u('core', uid)}" opacity="0.85">${flick.replace('values="0.2;1;0.3;0.9;0.2"', 'values="0.4;0.95;0.5;0.9;0.4"')}</ellipse>` +
    `<circle r="3.4" fill="${p.core[0]}">${flick}</circle></g>`;

  // distress bloom that tries and fails
  const distress = a
    ? `<circle r="34" fill="${u('core', uid)}" opacity="0">${tween(a, 'opacity', '0;0.36;0;0', 4.6, { keyTimes: '0;0.1;0.4;1' })}</circle>`
    : `<circle r="34" fill="${u('core', uid)}" opacity="0.1"/>`;

  // seabirds
  const bird = (cx: number, cy: number) => `<path d="M ${cx - 3} ${cy} Q ${cx} ${cy - 2.5} ${cx} ${cy} Q ${cx} ${cy - 2.5} ${cx + 3} ${cy}" fill="none" stroke="${p.light}" stroke-width="0.7" opacity="0.4"/>`;

  return (
    defs +
    coreGlow(ctx, { r: 56, op: 0.1, lo: 0.05, hi: 0.16, dur: 3.6 }) +
    starfield(ctx, [[-46, -44, 0.9, 2.6, 0.3], [42, -46, 0.8, 3.1, 0.5], [52, -26, 0.8, 2.2, 0.3], [-52, -24, 0.7, 3.6, 0.4]]) +
    `${bird(-40, -34)}${bird(38, -38)}` +
    sea + distress + beam + motes + tower + lens
  );
}
