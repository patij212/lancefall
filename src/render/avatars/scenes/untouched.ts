// UNTOUCHED — shield. A pristine, unbroken hex aegis: a clean double ring, an
// immaculate central sigil, a single sweeping shine and a calm deflection pulse.
// Not a scratch on it — a flawless clear.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { breathe, glint, tweenT } from '../motion';
import { coreGlow, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a hex shield (pointy-top, smaller than the window) — pristine double outline
  const hexAt = (r: number) =>
    [-90, -30, 30, 90, 150, 210].map((d) => {
      const ang = (d * Math.PI) / 180;
      return `${(Math.cos(ang) * r).toFixed(1)},${(Math.sin(ang) * r).toFixed(1)}`;
    }).join(' ');
  const shield =
    `<polygon points="${hexAt(50)}" fill="${tone(accent, 0.7, 0.1)}" fill-opacity="0.5" stroke="${accent}" stroke-width="2.4"/>` +
    `<polygon points="${hexAt(43)}" fill="none" stroke="${p.light}" stroke-width="0.8" opacity="0.6"/>` +
    `<polygon points="${hexAt(50)}" fill="${u('core', uid)}" opacity="0.18"/>`;

  // calm deflection pulse — the shield holding, gentle
  const pulse = a
    ? `<polygon points="${hexAt(50)}" fill="none" stroke="${p.hilite}" stroke-width="1.4" opacity="0">${'<animate attributeName="opacity" values="0;0.6;0" dur="3.6s" repeatCount="indefinite"/>'}<animateTransform attributeName="transform" type="scale" values="0.96;1.06;0.96" dur="3.6s" repeatCount="indefinite"/></polygon>`
    : `<polygon points="${hexAt(53)}" fill="none" stroke="${p.hilite}" stroke-width="1.2" opacity="0.3"/>`;

  // central sigil — a clean shield-within with a star, breathing softly
  const sigil =
    `<g>${tweenT(a, 'scale', '0.96;1.05;0.96', 4)}` +
    `<path d="M 0 -20 L 16 -12 L 16 6 Q 16 20 0 26 Q -16 20 -16 6 L -16 -12 Z" fill="${tone(accent, 0.8, 0.16)}" stroke="${accent}" stroke-width="1.4"/>` +
    `<path d="M 0 -8 L 3 -1 L 10 -1 L 4.5 3.5 L 6.5 11 L 0 6.5 L -6.5 11 L -4.5 3.5 L -10 -1 L -3 -1 Z" fill="${p.core[0]}"/></g>`;

  // immaculate light-sweep across the shield (reuse the rim-glint recipe inside)
  const sheen = `<g opacity="0.5">${glint({ uid, r: 50, sw: 2.4, lead: 10, stroke: p.core[0], opacity: 0.7, dur: 5, animated: a })}</g>`;

  // four corner sparkle studs (pristine)
  const sparkles =
    `<g fill="${p.core[0]}">` +
    [[-50, -8], [50, -8], [-50, 8], [50, 8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" opacity="${a ? 0.4 : 0.7}">${breathe(a, 0.3, 0.9, 2.6)}</circle>`).join('') +
    `</g>`;

  return (
    coreGlow(ctx, { op: 0.16, lo: 0.12, hi: 0.24, dur: 4.4 }) +
    shield + pulse + sheen + sigil + sparkles
  );
}
