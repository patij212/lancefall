// GRAZE — skim. A bullet streaks across the field; the player dot holds just off
// its line and grazes it — a spark fan + a graze-ring ping flare at the moment of
// closest approach. The risk-reward of skimming danger, as a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor, tone } from '../primitives';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 2.8;
  const danger = '#ff5a7d';

  // faint bullet-stream lanes the player threads through
  const lanes =
    `<g stroke="${p.deep}" stroke-width="0.7" opacity="0.22" stroke-linecap="round" stroke-dasharray="3 12">` +
    `<line x1="-62" y1="-26" x2="62" y2="-38"/><line x1="-62" y1="34" x2="62" y2="22"/></g>`;

  // the threading arc the player rides (the near-miss path)
  const arc = `<path d="M -54 36 Q 0 -8 54 -34" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="2 7" opacity="0.45"/>`;

  // the bullet streaking across the lane, with a motion-blur tail
  const bulletGlyph =
    `<g><circle r="4" fill="${danger}" opacity="0.35" filter="${u('bl', uid)}"/>` +
    `<circle r="2.4" fill="#ffd0da"/>` +
    `<path d="M 0 0 L -22 5 L -22 -5 Z" fill="${danger}" opacity="0.4"/></g>`;
  const bullet = a
    ? `<g transform="translate(-58,-4)"><animateTransform attributeName="transform" type="translate" values="-58 -4;58 -16" dur="${dur}s" repeatCount="indefinite"/>${bulletGlyph}</g>`
    : `<g transform="translate(0,-10)">${bulletGlyph}</g>`;

  // the player dot, parked just below the line at the graze point
  const sparks = a
    ? Array.from({ length: 5 }, (_, i) => {
        const ang = (-150 + i * 36) * (Math.PI / 180);
        const dx = (Math.cos(ang) * 16).toFixed(1);
        const dy = (Math.sin(ang) * 16).toFixed(1);
        return `<line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.4;0.5;0.62;1" dur="${dur}s" repeatCount="indefinite"/></line>`;
      }).join('')
    : Array.from({ length: 5 }, (_, i) => {
        const ang = (-150 + i * 36) * (Math.PI / 180);
        const dx = (Math.cos(ang) * 12).toFixed(1);
        const dy = (Math.sin(ang) * 12).toFixed(1);
        return `<line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${p.hilite}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`;
      }).join('');
  const grazeRing = a
    ? `<circle r="10" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0"><animate attributeName="r" values="6;6;18;18" keyTimes="0;0.4;0.6;1" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.85;0;0" keyTimes="0;0.4;0.48;0.6;1" dur="${dur}s" repeatCount="indefinite"/></circle>`
    : `<circle r="13" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.4"/>`;
  const player =
    `<g transform="translate(2,6)">${grazeRing}<g>${sparks}</g>` +
    `<circle r="8" fill="${tone(accent, 1, 0.5)}" opacity="0.25"/>` +
    `<polygon points="0,-5 4.5,3.5 -4.5,3.5" fill="${p.core[0]}"/>` +
    `<circle r="1.6" fill="${p.hilite}"/></g>`;

  return (
    coreGlow(ctx, { op: 0.13, lo: 0.09, hi: 0.2, dur: 4.4 }) +
    starfield(ctx, [[-48, -40, 0.9, 2.6, 0.3], [40, 38, 0.8, 3.1, 0.5], [-40, 44, 0.8, 2.2, 0.4]]) +
    lanes + arc + bullet + player
  );
}
