// THE MIRRORBLADE — mirror. Your doubt made flesh: a lance and its reflection
// across a mirror seam, lunging in sync — one in the boss's red, one in the
// player's own cyan. "Tell me which of us is real."

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { tween, tweenT, drift } from '../motion';
import { coreGlow, starfield, u } from './_common';

const PLAYER_CYAN = '#7df9ff';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);

  // a compact lance pointing +x (tip near x=26)
  const lanceGlyph = (color: string, ghost: boolean) => {
    const op = ghost ? 0.6 : 1;
    return (
      `<g opacity="${op}">` +
      `<polygon points="-30,0 -25,-3 -22,0 -25,3" fill="${color}"/>` +
      `<rect x="-24" y="-1.5" width="40" height="3" rx="1.4" fill="${color}"/>` +
      `<line x1="-24" y1="-1" x2="14" y2="-1" stroke="#ffffff" stroke-width="0.5" opacity="0.7"/>` +
      `<rect x="13" y="-2.4" width="4" height="4.8" rx="1" fill="${tone(color, 0.9, 0.45)}"/>` +
      `<path d="M 16 0 Q 24 -5 33 -2.5 L 42 0 L 33 2.5 Q 24 5 16 0 Z" fill="${color}"/>` +
      `<line x1="18" y1="0" x2="40" y2="0" stroke="${ghost ? '#0a2230' : p.bg}" stroke-width="0.6" opacity="0.6"/>` +
      `<polygon points="38,-0.8 42,0 38,0.8" fill="#ffffff"/>` +
      `</g>`
    );
  };

  // the mirror seam — a faint plane + a shimmer travelling down it
  const seam =
    `<rect x="-3" y="-58" width="6" height="116" fill="${u('core', uid)}" opacity="0.18"/>` +
    `<line x1="0" y1="-56" x2="0" y2="56" stroke="${p.hilite}" stroke-width="1" stroke-dasharray="3 6" opacity="0.5">${drift(a, -54, 3)}</line>`;

  // clash spark where the tips meet at the seam
  const clash = a
    ? `<g><circle r="4" fill="${p.core[0]}" opacity="0">${tween(a, 'opacity', '0;0;1;0;0', 2.4, { keyTimes: '0;0.26;0.32;0.46;1' })}<animate attributeName="r" values="2;2;10;2;2" keyTimes="0;0.26;0.34;0.46;1" dur="2.4s" repeatCount="indefinite"/></circle>` +
      Array.from({ length: 6 }, (_, i) => {
        const ang = (i * 60) * (Math.PI / 180);
        const dx = (Math.cos(ang) * 16).toFixed(1);
        const dy = (Math.sin(ang) * 16).toFixed(1);
        return `<line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.28;0.34;0.5;1" dur="2.4s" repeatCount="indefinite"/></line>`;
      }).join('') +
      `</g>`
    : `<circle r="5" fill="${p.core[0]}" opacity="0.5"/>`;

  // each lance lunges toward the seam; the reflection mirrors via scale(-1,1)
  const lunge = (extra: string) =>
    `<g transform="${extra}"><g>${tweenT(a, 'translate', '0 0;12 0;0 0;0 0', 2.4, { keyTimes: '0;0.3;0.6;1' })}`;
  const real = `${lunge('translate(-30,0)')}${lanceGlyph(accent, false)}</g></g>`;
  const reflection = `${lunge('translate(30,0) scale(-1,1)')}${lanceGlyph(PLAYER_CYAN, true)}</g></g>`;

  return (
    coreGlow(ctx, { op: 0.14, lo: 0.09, hi: 0.22, dur: 4 }) +
    starfield(ctx, [[-46, -34, 0.9, 2.6, 0.3], [44, -34, 0.8, 3.1, 0.5], [-44, 40, 0.8, 2.2, 0.4], [44, 40, 0.8, 3.6, 0.4]]) +
    seam + real + reflection + clash
  );
}
