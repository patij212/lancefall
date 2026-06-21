// DASH — dash. A slipstream: a double-swoosh trail of after-image echoes flowing
// along an arc to a faceted ship at the lead, a light-pulse racing the path,
// phase-distortion rings warping in its wake, energy ribbons curling off, combo
// chevrons + a shockwave at the launch. The momentum-dash, at full commit.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift, when } from '../motion';
import { coreGlow, starfield, u } from './_common';

const P0 = [-46, 36], C = [-8, -20], P1 = [48, -32];
const bez = (t: number): [number, number] => {
  const u1 = 1 - t;
  return [u1 * u1 * P0[0] + 2 * u1 * t * C[0] + t * t * P1[0], u1 * u1 * P0[1] + 2 * u1 * t * C[1] + t * t * P1[1]];
};
const ang = (t: number): number => {
  const u1 = 1 - t;
  const dx = 2 * u1 * (C[0] - P0[0]) + 2 * t * (P1[0] - C[0]);
  const dy = 2 * u1 * (C[1] - P0[1]) + 2 * t * (P1[1] - C[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.4;
  const pathD = `M ${P0[0]} ${P0[1]} Q ${C[0]} ${C[1]} ${P1[0]} ${P1[1]}`;
  // a parallel offset swoosh path (for the double trail)
  const offD = `M ${P0[0] - 4} ${P0[1] + 9} Q ${C[0] - 4} ${C[1] + 9} ${P1[0] - 4} ${P1[1] + 9}`;

  const speed = (off: number, sw: number, dash: string, d: number) =>
    `<line x1="-66" y1="${off + 6}" x2="62" y2="${off - 10}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.12" stroke-linecap="round">${drift(a, -90, d)}</line>`;
  const field = `<g>${speed(-28, 0.8, '5 16', 2.6)}${speed(-6, 0.7, '4 20', 3.2)}${speed(18, 0.8, '5 14', 2.9)}${speed(36, 0.6, '4 18', 3.5)}</g>`;

  // double-swoosh underglow
  const underglow =
    `<path d="${pathD}" fill="none" stroke="${accent}" stroke-width="11" stroke-linecap="round" opacity="0.12" filter="${u('bl', uid)}"/>` +
    `<path d="${offD}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" opacity="0.1" filter="${u('bl', uid)}"/>` +
    `<path d="${pathD}" fill="none" stroke="${tone(accent, 1, 0.6)}" stroke-width="4" stroke-linecap="round" opacity="0.22"/>` +
    `<path d="${offD}" fill="none" stroke="${tone(accent, 1, 0.55)}" stroke-width="2" stroke-linecap="round" opacity="0.16"/>`;

  // energy ribbons curling off the trail
  const ribbon = (sgn: number, d: number) =>
    `<path d="M -30 ${22 * sgn + 4} Q 6 ${-8 * sgn} 40 ${-26 * sgn + 6}" fill="none" stroke="${p.light}" stroke-width="0.8" stroke-dasharray="4 10" opacity="0.3" stroke-linecap="round">${drift(a, -42, d)}</path>`;
  const ribbons = ribbon(1, 3.2) + ribbon(-1, 4);

  // after-image echo chain — 12 chevrons brightening toward the lead, a wave sweeping
  const ECH = 12;
  let echoes = '';
  for (let i = 0; i < ECH; i++) {
    const t = 0.05 + (i / (ECH - 1)) * 0.82;
    const [x, y] = bez(t);
    const s = 3 + t * 6.5;
    const base = 0.16 + t * 0.5;
    const sw = (0.8 + t * 1.5).toFixed(1);
    const flash = when(a, `<animate attributeName="opacity" values="${base};${base};1;${base}" keyTimes="0;${(0.05 + t * 0.5).toFixed(2)};${(0.11 + t * 0.5).toFixed(2)};1" dur="${dur}s" repeatCount="indefinite"/>`);
    echoes +=
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang(t).toFixed(1)})" opacity="${a ? base : base + 0.15}">${flash}` +
      `<path d="M ${(-s * 0.7).toFixed(1)} ${(-s).toFixed(1)} L ${(s * 0.5).toFixed(1)} 0 L ${(-s * 0.7).toFixed(1)} ${s.toFixed(1)}" fill="none" stroke="${i >= ECH - 3 ? p.core[0] : accent}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  // phase-distortion rings warping in the wake
  const warp = (t: number, begin: number) => {
    const [x, y] = bez(t);
    return a
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="none" stroke="${p.light}" stroke-width="0.8" opacity="0"><animate attributeName="r" values="2;14" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.55;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="none" stroke="${p.light}" stroke-width="0.7" opacity="0.25"/>`;
  };
  const warps = warp(0.35, 0) + warp(0.6, dur * 0.4) + warp(0.82, dur * 0.7);

  // the faceted ship at the lead
  const [lx, ly] = bez(0.92);
  const lead =
    `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${ang(0.92).toFixed(1)})">` +
    `<path d="M -8 0 L -12 -7 L -2 -4 Z" fill="${tone(accent, 0.8, 0.4)}"/><path d="M -8 0 L -12 7 L -2 4 Z" fill="${tone(accent, 0.8, 0.4)}"/>` + // wings
    `<polygon points="15,0 -8,7 -2,0 -8,-7" fill="${u('core', uid)}"/>` +
    `<polygon points="11,0 -4,4 0,0 -4,-4" fill="#ffffff"/>` +
    `<circle cx="2" cy="0" r="1.4" fill="${p.core[0]}"/>` +
    `<g stroke="#ffffff" stroke-width="0.7" opacity="0.8"><line x1="-12" y1="0" x2="18" y2="0"/></g>` +
    `<g fill="${p.core[0]}" opacity="0.7"><polygon points="-8,-3 -16,-1 -8,0"/><polygon points="-8,3 -16,1 -8,0"/></g></g>`; // thruster

  const pulse = a
    ? `<g><animateMotion path="${pathD}" dur="${dur}s" rotate="auto" repeatCount="indefinite"/><circle r="3.4" fill="#fff"/><circle r="7" fill="${accent}" opacity="0.4" filter="${u('blS', uid)}"/></g>`
    : '';

  const chevrons =
    `<g transform="translate(${P0[0]},${P0[1]}) rotate(${ang(0).toFixed(1)})" fill="none" stroke="${accent}" stroke-linecap="round">` +
    `<path d="M 4 -6 L -3 0 L 4 6" stroke-width="1.4" opacity="0.5"/><path d="M -3 -6 L -10 0 L -3 6" stroke-width="1.1" opacity="0.32"/><path d="M -10 -6 L -17 0 L -10 6" stroke-width="0.9" opacity="0.18"/><path d="M -17 -6 L -24 0 L -17 6" stroke-width="0.7" opacity="0.1"/></g>`;
  const shock = a
    ? `<circle cx="${P0[0]}" cy="${P0[1]}" r="6" fill="none" stroke="${p.hilite}" stroke-width="1.2" opacity="0"><animate attributeName="r" values="3;20" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="${dur}s" repeatCount="indefinite"/></circle>`
    : `<circle cx="${P0[0]}" cy="${P0[1]}" r="10" fill="none" stroke="${p.hilite}" stroke-width="1.1" opacity="0.3"/>`;

  const spark = (t: number, len: number, d: number) => {
    const [x, y] = bez(t);
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - len).toFixed(1)}" y2="${(y + len * 0.4).toFixed(1)}" stroke="${p.core[0]}" stroke-width="0.8" stroke-linecap="round" opacity="0.4" stroke-dasharray="3 8">${drift(a, -30, d)}</line>`;
  };
  const sparks = `<g>${spark(0.25, 14, 1.4)}${spark(0.45, 12, 1.1)}${spark(0.65, 12, 1.6)}${spark(0.8, 10, 1.3)}</g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.2 }) +
    starfield(ctx, [[-44, -34, 0.9, 2.6, 0.3], [42, 38, 0.8, 3.1, 0.5], [50, 14, 0.9, 2.2, 0.3], [-48, 20, 0.7, 3.6, 0.5]]) +
    field + ribbons + underglow + chevrons + shock + warps + echoes + sparks + lead + pulse
  );
}
