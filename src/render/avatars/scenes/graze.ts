// GRAZE — skim. A danmaku storm: an outer wall of bullets, six spiral arms within,
// twin luminous graze-ribbons threading the gaps and spark-fans igniting at every
// near-miss — all around a dart-ship cradled in a faceted shield-bubble. The art
// of living at the bullet's edge.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { spin, breathe, drift, twinkle, when } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const danger = '#ff5a7d';
  const dCore = tone(danger, 0.9, 0.7);

  const rings =
    `<g fill="none">` +
    `<circle r="58" stroke="${tone(accent, 0.6, 0.34)}" stroke-width="0.6" stroke-dasharray="2 9" opacity="0.4"/>` +
    `<circle r="40" stroke="${tone(accent, 0.6, 0.4)}" stroke-width="0.5" stroke-dasharray="1 7" opacity="0.4"/></g>`;

  const bullet = (x: string, y: string, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${(r + 1.6).toFixed(1)}" fill="${danger}" opacity="0.22" filter="${u('blS', uid)}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${dCore}"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.42).toFixed(1)}" fill="#fff"/>`;

  // outer wall of bullets with inward motion-trails
  let wall = '';
  for (let i = 0; i < 12; i++) {
    const ang = (i * 30 * Math.PI) / 180;
    const x = Math.cos(ang) * 56, y = Math.sin(ang) * 56;
    wall += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x * 1.12).toFixed(1)}" y2="${(y * 1.12).toFixed(1)}" stroke="${danger}" stroke-width="1" opacity="0.3" stroke-linecap="round"/>`;
    wall += bullet(x.toFixed(1), y.toFixed(1), 3.4);
  }

  // six spiral arms of bullets
  let bullets = '';
  for (let arm = 0; arm < 6; arm++) {
    for (let k = 0; k < 5; k++) {
      const ang = ((arm * 60 + k * 16) * Math.PI) / 180;
      const rad = 18 + k * 9;
      bullets += bullet((Math.cos(ang) * rad).toFixed(1), (Math.sin(ang) * rad).toFixed(1), 3.1 - k * 0.32);
    }
  }

  // twin graze-ribbons (Archimedean spirals threading the arms)
  const spiral = (phase: number) => {
    let path = '';
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const ang = (t * 1.75 * 360 + phase) * (Math.PI / 180);
      const rad = 13 + t * 47;
      path += `${i === 0 ? 'M' : 'L'} ${(Math.cos(ang) * rad).toFixed(1)} ${(Math.sin(ang) * rad).toFixed(1)} `;
    }
    return path;
  };
  const ribbon =
    `<path d="${spiral(30)}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity="0.2" filter="${u('blS', uid)}"/>` +
    `<path d="${spiral(210)}" fill="none" stroke="${p.light}" stroke-width="1" stroke-linecap="round" stroke-dasharray="6 9" opacity="0.5">${drift(a, 180, 5)}</path>` +
    `<path d="${spiral(30)}" fill="none" stroke="${p.core[0]}" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="10 7" opacity="0.85">${drift(a, -204, 4)}</path>`;

  // spark-fans at near-miss points
  let sparks = '';
  for (let s = 0; s < 7; s++) {
    const t = 0.12 + s * 0.12;
    const ang = (t * 1.75 * 360 + 30) * (Math.PI / 180);
    const rad = 13 + t * 47;
    const cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
    const fan = Array.from({ length: 5 }, (_, j) => {
      const fa = ang + (-0.5 + j * 0.25);
      return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + Math.cos(fa) * 8).toFixed(1)}" y2="${(cy + Math.sin(fa) * 8).toFixed(1)}" stroke="${p.hilite}" stroke-width="0.9" stroke-linecap="round"/>`;
    }).join('');
    sparks += `<g opacity="${a ? 0.5 : 0.7}">${twinkle(a, 1.5 + s * 0.25, 0.2, 1)}${fan}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5" fill="#fff"/></g>`;
  }

  const assembly = `<g>${spin(a, 60)}${wall}${bullets}${ribbon}${sparks}</g>`;

  // a hexagonal shield-bubble around the player
  const hexPts = [-90, -30, 30, 90, 150, 210].map((d) => { const r = (d * Math.PI) / 180; return `${(Math.cos(r) * 15).toFixed(1)},${(Math.sin(r) * 15).toFixed(1)}`; }).join(' ');
  const shield =
    `<polygon points="${hexPts}" fill="${accent}" opacity="0.12">${breathe(a, 0.08, 0.2, 2.4)}</polygon>` +
    `<polygon points="${hexPts}" fill="none" stroke="${accent}" stroke-width="1" opacity="0.6"/>` +
    `<g stroke="${tone(accent, 0.6, 0.5)}" stroke-width="0.4" opacity="0.4"><line x1="0" y1="0" x2="0" y2="-15"/><line x1="0" y1="0" x2="13" y2="7.5"/><line x1="0" y1="0" x2="-13" y2="7.5"/></g>` +
    `<circle r="16" fill="none" stroke="${p.core[0]}" stroke-width="1" stroke-linecap="round" stroke-dasharray="5 9999" opacity="0.8">${when(a, '<animate attributeName="stroke-dashoffset" values="0;-100" dur="3s" repeatCount="indefinite"/>')}</circle>`;

  // the dart-ship with thrusters
  const ship =
    `<g>${when(a, '<animateTransform attributeName="transform" type="rotate" values="-6;6;-6" dur="2.6s" repeatCount="indefinite"/>')}` +
    `<g fill="${tone(accent, 0.8, 0.4)}"><polygon points="0,-8 4,2 0,0 -4,2"/></g>` + // wings (dark base)
    `<polygon points="0,-8 6,4 0,1 -6,4" fill="${u('core', uid)}"/>` +
    `<polygon points="0,-6 3,2.5 0,0.5 -3,2.5" fill="${p.core[0]}"/>` +
    `<g fill="${danger}" opacity="0.8"><polygon points="-3,4 -1.5,9 0,4"/><polygon points="3,4 1.5,9 0,4"/></g>` + // thrusters
    `<circle cx="0" cy="-3" r="1.3" fill="#fff"/></g>`;
  const core = shield + ship;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.4 }) +
    rings + assembly + core
  );
}
