// DAYBREAK — flare. A sun cresting the horizon with rays bursting outward, the
// whole disc flaring on a beat. OVERDRIVE made into dawn: the moment the meter
// fills and the light breaks.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, tween } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const warm = tone(accent, 1, 0.6);

  // the horizon the sun rises over
  const horizon =
    `<rect x="-66" y="40" width="132" height="22" fill="${tone(accent, 0.6, 0.14)}" opacity="0.55"/>` +
    `<line x1="-62" y1="40" x2="62" y2="40" stroke="${p.core[0]}" stroke-width="1" opacity="0.7"/>`;

  // rays bursting from the sun (centre lifted toward the horizon at y≈24)
  const cy = 24;
  const rays = (n: number, r1: number, r2: number, sw: number, op: number, dur: number, dir: 1 | -1) => {
    const lines = Array.from({ length: n }, (_, i) => {
      const ang = ((i * (360 / n)) * Math.PI) / 180;
      return `<line x1="${(Math.cos(ang) * r1).toFixed(1)}" y1="${(Math.sin(ang) * r1).toFixed(1)}" x2="${(Math.cos(ang) * r2).toFixed(1)}" y2="${(Math.sin(ang) * r2).toFixed(1)}"/>`;
    }).join('');
    return `<g transform="translate(0,${cy})" stroke="${warm}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"><g>${spin(a, dur, 0, dir * 360)}${lines}</g></g>`;
  };

  // flare burst — rays pulse out on the beat
  const flareRays = a
    ? `<g transform="translate(0,${cy})" stroke="${p.core[0]}" stroke-width="1.6" stroke-linecap="round" opacity="0">${tween(a, 'opacity', '0;0.8;0;0', 3, { keyTimes: '0;0.12;0.4;1' })}` +
      Array.from({ length: 12 }, (_, i) => {
        const ang = ((i * 30) * Math.PI) / 180;
        return `<line x1="${(Math.cos(ang) * 18).toFixed(1)}" y1="${(Math.sin(ang) * 18).toFixed(1)}" x2="${(Math.cos(ang) * 40).toFixed(1)}" y2="${(Math.sin(ang) * 40).toFixed(1)}"/>`;
      }).join('') +
      `</g>`
    : '';

  // the sun disc
  const sun =
    `<g transform="translate(0,${cy})">` +
    `<circle r="22" fill="${u('core', uid)}" opacity="0.9"/>` +
    `<circle r="16" fill="${warm}"/>` +
    `<circle r="16" fill="none" stroke="${p.core[0]}" stroke-width="1" opacity="0.6">${breathe(a, 0.4, 0.9, 3)}</circle>` +
    `<circle r="8" fill="${p.core[0]}"/></g>`;

  return (
    coreGlow(ctx, { r: 56, op: 0.18, lo: 0.12, hi: 0.3, dur: 3 }) +
    rays(16, 26, 50, 1.4, 0.45, 60, 1) +
    rays(12, 30, 44, 0.8, 0.3, 44, -1) +
    horizon + flareRays + sun
  );
}
