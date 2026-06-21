// DASH — dash. A slipstream swoosh: a chain of after-image echoes flowing along
// an arc toward a faceted arrowhead lead, a light-pulse racing the path, combo
// chevrons streaming off the launch and a phase-shockwave where the dash fired.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

// quadratic bezier control points (the swoosh arc)
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

  // background speed-lines
  const speed = (off: number, sw: number, dash: string, d: number) =>
    `<line x1="-66" y1="${off + 6}" x2="62" y2="${off - 10}" stroke="${accent}" stroke-width="${sw}" stroke-dasharray="${dash}" opacity="0.12" stroke-linecap="round">${drift(a, -90, d)}</line>`;
  const field = `<g>${speed(-22, 0.8, '5 16', 2.6)}${speed(2, 0.7, '4 20', 3.2)}${speed(26, 0.8, '5 14', 2.9)}</g>`;

  // soft swoosh underglow (the body of the dash)
  const underglow =
    `<path d="${pathD}" fill="none" stroke="${accent}" stroke-width="11" stroke-linecap="round" opacity="0.12" filter="${u('bl', uid)}"/>` +
    `<path d="${pathD}" fill="none" stroke="${tone(accent, 1, 0.6)}" stroke-width="4" stroke-linecap="round" opacity="0.2"/>`;

  // the after-image echo chain — chevrons growing/brightening toward the lead,
  // a bright pulse sweeping along them
  const ECH = 8;
  let echoes = '';
  for (let i = 0; i < ECH; i++) {
    const t = 0.06 + (i / (ECH - 1)) * 0.82;
    const [x, y] = bez(t);
    const s = 3 + t * 6;
    const base = 0.18 + t * 0.5;
    const sw = (0.9 + t * 1.4).toFixed(1);
    const flash = a
      ? `<animate attributeName="opacity" values="${base};${base};1;${base}" keyTimes="0;${(0.06 + t * 0.5).toFixed(2)};${(0.12 + t * 0.5).toFixed(2)};1" dur="${dur}s" repeatCount="indefinite"/>`
      : '';
    echoes +=
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang(t).toFixed(1)})" opacity="${a ? base : base + 0.15}">${flash}` +
      `<path d="M ${(-s * 0.7).toFixed(1)} ${(-s).toFixed(1)} L ${(s * 0.5).toFixed(1)} 0 L ${(-s * 0.7).toFixed(1)} ${s.toFixed(1)}" fill="none" stroke="${i >= ECH - 2 ? p.core[0] : accent}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  // faceted arrowhead lead
  const [lx, ly] = bez(0.92);
  const lead =
    `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${ang(0.92).toFixed(1)})">` +
    `<polygon points="13,0 -6,8 -1,0 -6,-8" fill="${p.core[0]}"/>` +
    `<polygon points="9,0 -3,4 0,0 -3,-4" fill="#ffffff"/>` +
    `<g stroke="#ffffff" stroke-width="0.7" opacity="0.8"><line x1="-10" y1="0" x2="16" y2="0"/></g></g>`;

  // a light-pulse racing the path
  const pulse = a
    ? `<g><animateMotion path="${pathD}" dur="${dur}s" rotate="auto" repeatCount="indefinite"/><circle r="3.2" fill="#fff"/><circle r="6" fill="${accent}" opacity="0.4" filter="${u('blS', uid)}"/></g>`
    : '';

  // combo chevrons + phase shockwave at the launch origin
  const chevrons =
    `<g transform="translate(${P0[0]},${P0[1]}) rotate(${ang(0).toFixed(1)})" fill="none" stroke="${accent}" stroke-linecap="round">` +
    `<path d="M 4 -6 L -3 0 L 4 6" stroke-width="1.4" opacity="0.5"/><path d="M -3 -6 L -10 0 L -3 6" stroke-width="1.1" opacity="0.32"/><path d="M -10 -6 L -17 0 L -10 6" stroke-width="0.9" opacity="0.18"/></g>`;
  const shock = a
    ? `<circle cx="${P0[0]}" cy="${P0[1]}" r="6" fill="none" stroke="${p.hilite}" stroke-width="1.2" opacity="0"><animate attributeName="r" values="3;18" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="${dur}s" repeatCount="indefinite"/></circle>`
    : `<circle cx="${P0[0]}" cy="${P0[1]}" r="10" fill="none" stroke="${p.hilite}" stroke-width="1.1" opacity="0.3"/>`;

  // speed sparks along the swoosh
  const spark = (t: number, len: number, d: number) => {
    const [x, y] = bez(t);
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - len).toFixed(1)}" y2="${(y + len * 0.4).toFixed(1)}" stroke="${p.core[0]}" stroke-width="0.8" stroke-linecap="round" opacity="0.4" stroke-dasharray="3 8">${drift(a, -30, d)}</line>`;
  };
  const sparks = `<g>${spark(0.3, 14, 1.4)}${spark(0.55, 12, 1.1)}${spark(0.75, 10, 1.6)}</g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.2 }) +
    starfield(ctx, [[-44, -34, 0.9, 2.6, 0.3], [42, 38, 0.8, 3.1, 0.5], [50, 14, 0.9, 2.2, 0.3], [-48, 20, 0.7, 3.6, 0.5]]) +
    field + underglow + chevrons + shock + echoes + sparks + lead + pulse
  );
}
