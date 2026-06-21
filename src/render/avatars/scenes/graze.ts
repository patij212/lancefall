// GRAZE — skim. A danmaku rosette: six spiral arms of glowing enemy bullets,
// with a luminous graze-ribbon threading the gaps and spark-fans igniting at every
// near-miss, around a shielded player-core. The art of living at the bullet's edge.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, drift, twinkle } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const danger = '#ff5a7d';
  const dCore = tone(danger, 0.9, 0.7);

  // faint guide rings + soft aura
  const rings =
    `<g fill="none">` +
    `<circle r="58" stroke="${tone(accent, 0.6, 0.34)}" stroke-width="0.6" stroke-dasharray="2 9" opacity="0.4"/>` +
    `<circle r="40" stroke="${tone(accent, 0.6, 0.4)}" stroke-width="0.5" stroke-dasharray="1 7" opacity="0.4"/></g>`;

  // a single bullet — glow + body + hot dot
  const bullet = (x: string, y: string, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${(r + 1.6).toFixed(1)}" fill="${danger}" opacity="0.22" filter="${u('blS', uid)}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${dCore}"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.42).toFixed(1)}" fill="#fff"/>`;

  // six spiral arms of bullets
  let bullets = '';
  for (let arm = 0; arm < 6; arm++) {
    for (let k = 0; k < 5; k++) {
      const ang = ((arm * 60 + k * 16) * Math.PI) / 180;
      const rad = 18 + k * 9;
      bullets += bullet((Math.cos(ang) * rad).toFixed(1), (Math.sin(ang) * rad).toFixed(1), 3.1 - k * 0.32);
    }
  }

  // the graze-ribbon — an Archimedean spiral threading between the arms
  const N = 30;
  let path = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = (t * 1.75 * 360 + 30) * (Math.PI / 180);
    const rad = 13 + t * 47;
    path += `${i === 0 ? 'M' : 'L'} ${(Math.cos(ang) * rad).toFixed(1)} ${(Math.sin(ang) * rad).toFixed(1)} `;
  }
  const ribbon =
    `<path d="${path}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity="0.2" filter="${u('blS', uid)}"/>` +
    `<path d="${path}" fill="none" stroke="${p.core[0]}" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="10 7" opacity="0.85">${drift(a, -204, 4)}</path>`;

  // spark-fans at near-miss points along the ribbon
  let sparks = '';
  for (let s = 0; s < 5; s++) {
    const t = 0.18 + s * 0.17;
    const ang = (t * 1.75 * 360 + 30) * (Math.PI / 180);
    const rad = 13 + t * 47;
    const cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
    const fan = Array.from({ length: 5 }, (_, j) => {
      const fa = ang + (-0.5 + j * 0.25);
      return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + Math.cos(fa) * 8).toFixed(1)}" y2="${(cy + Math.sin(fa) * 8).toFixed(1)}" stroke="${p.hilite}" stroke-width="0.9" stroke-linecap="round"/>`;
    }).join('');
    sparks += `<g opacity="${a ? 0.5 : 0.7}">${twinkle(a, 1.6 + s * 0.3, 0.2, 1)}${fan}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.6" fill="#fff"/></g>`;
  }

  // the whole danmaku assembly rotates slowly so the threading stays aligned
  const assembly = `<g>${spin(a, 60)}${bullets}${ribbon}${sparks}</g>`;

  // shielded player-core at centre
  const core =
    `<circle r="13" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="3 4" opacity="0.7">${spin(a, 14, 360, 0)}</circle>` +
    `<circle r="9" fill="${accent}" opacity="0.2">${breathe(a, 0.12, 0.32, 2.4)}</circle>` +
    `<g>${breathe(a, 0.85, 1, 2.4)}<polygon points="0,-7 6,4.5 -6,4.5" fill="${u('core', uid)}"/><polygon points="0,-4 3.4,2.6 -3.4,2.6" fill="${p.core[0]}"/></g>` +
    `<circle r="1.6" fill="#fff"/>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.4 }) +
    rings + assembly + core
  );
}
