// THE BEAT — pulse. A metronome arm ticking over a ring of on-beat pips, with
// concentric beat-rings expanding from the core on each beat. The dash-on-the-beat
// reward made into a sigil.

import type { SceneCtx } from '../registry';
import { paletteFor } from '../primitives';
import { spin, twinkle, tween, tweenT } from '../motion';
import { coreGlow, starfield, u } from './_common';

export function scene(ctx: SceneCtx): string {
  const { uid, accent, animated: a } = ctx;
  const p = paletteFor(accent);
  const dur = 1.8; // one full tick-tock

  // on-beat pip ring — 8 pips around the field
  const pips = Array.from({ length: 8 }, (_, i) => {
    const ang = (i * 45 - 90) * (Math.PI / 180);
    const cx = (Math.cos(ang) * 48).toFixed(1);
    const cy = (Math.sin(ang) * 48).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="2" opacity="${a ? 0.35 : 0.6}">${twinkle(a, dur * 2, 0.3, 1)}</circle>`;
  }).join('');
  const pipRing = `<g fill="${accent}">${pips}</g><circle r="48" fill="none" stroke="${p.deep}" stroke-width="0.6" stroke-dasharray="1 6" opacity="0.4">${spin(a, 40)}</circle>`;

  // expanding beat-rings (sonar)
  const beatRing = (begin: number) =>
    a
      ? `<circle fill="none" stroke="${accent}" stroke-width="1.6" opacity="0"><animate attributeName="r" values="6;54" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      : `<circle r="${24 + begin * 24}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="${0.45 - begin * 0.4}"/>`;
  const beatRings = beatRing(0) + beatRing(dur * 0.5);

  // metronome — pivot bob at the bottom, arm swinging
  const metronome =
    `<g transform="translate(0,34)">` +
    `<path d="M -22 6 L 22 6 L 13 -44 L -13 -44 Z" fill="${p.bg}" stroke="${p.deep}" stroke-width="1" opacity="0.85"/>` +
    `<g>${tweenT(a, 'rotate', '-16;16;-16', dur)}` +
    `<line x1="0" y1="2" x2="0" y2="-50" stroke="${p.light}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<rect x="-3.5" y="-34" width="7" height="6" rx="1.5" fill="${p.hilite}"/>` +
    `<circle cx="0" cy="-50" r="2.4" fill="${p.core[0]}"/></g>` +
    `<circle cx="0" cy="2" r="3" fill="${accent}"/></g>`;

  // central pulse heart
  const heartPing = a
    ? `<circle r="6" fill="none" stroke="${p.hilite}" stroke-width="1" opacity="0">${tween(a, 'opacity', '0;0.8;0;0', dur, { keyTimes: '0;0.1;0.5;1' })}</circle>`
    : '';
  const heart =
    `<g>${tweenT(a, 'scale', '0.82;1.16;0.82', dur)}` +
    `<circle r="9" fill="${u('core', uid)}" opacity="0.95"/>` +
    `<circle r="4" fill="${p.core[0]}"/></g>` + heartPing;

  return (
    coreGlow(ctx, { op: 0.16, lo: 0.1, hi: 0.24, dur: 3.2 }) +
    starfield(ctx, [[-46, -22, 0.9, 2.6, 0.3], [44, -34, 0.8, 3.1, 0.5], [50, 18, 0.9, 2.2, 0.3], [-34, 40, 0.8, 3.6, 0.5]]) +
    pipRing + beatRings + metronome + heart
  );
}
